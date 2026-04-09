"""
Amazon Bedrock RAG (Retrieval Augmented Generation) Lambda ハンドラー

Bedrock Knowledge BaseのRetrieveAndGenerate APIを使用して、
ナレッジベースのドキュメントから自然言語で回答を生成する。

アーキテクチャ:
  フロントエンド → API Gateway → このLambda → Bedrock RetrieveAndGenerate
                                               → Knowledge Base (OpenSearch Serverless)
                                               → Claude 3 Haiku (ap-northeast-1)

KDDI要件対応: Amazon Bedrock, RAGシステム, 開発者AIアシスタント
"""

import json
import os
import uuid
from typing import Any

import boto3
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics(namespace="PlatformTemplate")

REGION = os.environ.get("REGION", "ap-northeast-1")
KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
MODEL_ARN = os.environ.get(
    "MODEL_ARN",
    f"arn:aws:bedrock:{REGION}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
)

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name=REGION)

# 日本語対応プロンプトテンプレート
# $search_results$ にKendraの検索結果が挿入される
PROMPT_TEMPLATE_JA = """
あなたはプラットフォームエンジニアリングの専門家アシスタントです。
以下のコンテキスト情報を参照して、質問に日本語で正確に答えてください。

コンテキスト情報:
$search_results$

質問: $query$

回答の際は以下のガイドラインに従ってください:
- コンテキストに基づいた正確な情報を提供する
- 技術的な詳細は具体的なコマンドや設定例を含める
- コンテキストに情報がない場合は「この情報はナレッジベースにありません」と明示する
- 必要に応じて箇条書きや表を使用して読みやすくする

回答:
"""


@tracer.capture_lambda_handler
@logger.inject_lambda_context(log_event=False)  # クエリ内容はセキュリティ上ログしない
@metrics.log_metrics
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    """
    Bedrock RAGエンドポイント。

    入力 (API Gateway経由またはAppSync経由):
        event.query: 質問テキスト (必須)
        event.sessionId: 会話セッションID (省略可 - 省略時は新規セッション生成)

    出力:
        {
            "answer": str,          # 生成された回答
            "sessionId": str,       # セッションID (会話継続に使用)
            "citations": [          # 参照元ドキュメント
                {
                    "content": str,
                    "location": str,
                    "score": float | None
                }
            ]
        }
    """
    # AppSync経由の場合は arguments に格納される
    query = event.get("query") or event.get("arguments", {}).get("query", "")
    query = query.strip() if query else ""

    if not query:
        return _error_response(400, "query is required")

    if len(query) > 1000:
        return _error_response(400, "query must be 1000 characters or less")

    session_id = event.get("sessionId") or str(uuid.uuid4())

    logger.info("Bedrock RAG query", extra={"sessionId": session_id, "queryLength": len(query)})
    metrics.add_metric(name="RAGQueryCount", unit=MetricUnit.Count, value=1)

    try:
        response = bedrock_agent_runtime.retrieve_and_generate(
            input={"text": query},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                    "modelArn": MODEL_ARN,
                    "retrievalConfiguration": {
                        "vectorSearchConfiguration": {
                            "numberOfResults": 5,
                            "overrideSearchType": "HYBRID",  # キーワード+セマンティクス
                        }
                    },
                    "generationConfiguration": {
                        "promptTemplate": {
                            "textPromptTemplate": PROMPT_TEMPLATE_JA,
                        },
                        "inferenceConfig": {
                            "textInferenceConfig": {
                                "maxTokens": 1024,
                                "temperature": 0.1,  # 事実回答のため低温度
                                "topP": 0.9,
                            }
                        },
                    },
                },
            },
            sessionId=session_id,
        )

        answer = response.get("output", {}).get("text", "回答を生成できませんでした。")
        citations = _extract_citations(response.get("citations", []))

        metrics.add_metric(name="RAGSuccessCount", unit=MetricUnit.Count, value=1)
        metrics.add_metric(name="CitationCount", unit=MetricUnit.Count, value=len(citations))

        logger.info(
            "RAG response generated",
            extra={"sessionId": session_id, "citationCount": len(citations)},
        )

        return {
            "statusCode": 200,
            "answer": answer,
            "sessionId": response.get("sessionId", session_id),
            "citations": citations,
        }

    except bedrock_agent_runtime.exceptions.ResourceNotFoundException:
        logger.error("Knowledge base not found", extra={"knowledgeBaseId": KNOWLEDGE_BASE_ID})
        return _error_response(404, "Knowledge base not found. Please check configuration.")
    except bedrock_agent_runtime.exceptions.ThrottlingException:
        logger.warning("Bedrock throttling")
        metrics.add_metric(name="RAGThrottleCount", unit=MetricUnit.Count, value=1)
        return _error_response(429, "AI service is temporarily busy. Please retry in a moment.")
    except Exception:
        logger.exception("Bedrock RAG failed")
        metrics.add_metric(name="RAGErrorCount", unit=MetricUnit.Count, value=1)
        return _error_response(500, "Failed to generate answer. Please try again.")


def _extract_citations(raw_citations: list[dict]) -> list[dict]:
    """Bedrockのcitationsレスポンスをフロントエンド用フォーマットに変換する"""
    citations = []
    for citation in raw_citations:
        for ref in citation.get("retrievedReferences", []):
            location = ref.get("location", {})
            s3_location = location.get("s3Location", {})
            citations.append(
                {
                    "content": ref.get("content", {}).get("text", ""),
                    "location": s3_location.get("uri", ""),
                    "score": ref.get("score"),
                }
            )
    return citations


def _error_response(status_code: int, message: str) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "error": message,
        "answer": "",
        "sessionId": "",
        "citations": [],
    }
