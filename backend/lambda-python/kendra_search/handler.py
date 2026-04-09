"""
Amazon Kendra 検索 Lambda ハンドラー

プラットフォームドキュメントの全文検索を提供する。
aws-lambda-powertools を使用して構造化ログ・X-Ray・メトリクスを自動計装する。

KDDI要件対応: Amazon Kendra, 開発者向けナレッジベース検索
"""

import json
import os
from typing import Any

import boto3
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics(namespace="PlatformTemplate")

kendra = boto3.client("kendra", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))

INDEX_ID = os.environ["KENDRA_INDEX_ID"]
MAX_RESULTS = int(os.environ.get("MAX_RESULTS", "5"))


@tracer.capture_lambda_handler
@logger.inject_lambda_context(log_event=True)
@metrics.log_metrics
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    """
    Kendra検索エンドポイント。

    入力:
        event.queryText: 検索クエリ (必須)
        event.queryResultType: "DOCUMENT" | "QUESTION_ANSWER" | "ANSWER" (省略可)

    出力:
        {
            "results": [
                {
                    "id": str,
                    "type": str,
                    "title": str,
                    "excerpt": str,
                    "score": str,
                    "documentUri": str | None,
                }
            ],
            "totalResults": int
        }
    """
    query_text = event.get("queryText", "").strip()
    if not query_text:
        return _error_response(400, "queryText is required")

    query_result_type = event.get("queryResultType", "DOCUMENT")

    logger.info("Kendra query", extra={"query": query_text, "resultType": query_result_type})
    metrics.add_metric(name="KendraQueryCount", unit=MetricUnit.Count, value=1)

    try:
        response = kendra.query(
            IndexId=INDEX_ID,
            QueryText=query_text,
            QueryResultTypeFilter=query_result_type,
            PageSize=MAX_RESULTS,
            # 日本語コンテンツのフィルタリング
            AttributeFilter={
                "OrAllFilters": [
                    {
                        "EqualsTo": {
                            "Key": "_language_code",
                            "Value": {"StringValue": "ja"},
                        }
                    },
                    {
                        "EqualsTo": {
                            "Key": "_language_code",
                            "Value": {"StringValue": "en"},
                        }
                    },
                ]
            },
        )

        results = _transform_results(response.get("ResultItems", []))

        metrics.add_metric(
            name="KendraResultCount", unit=MetricUnit.Count, value=len(results)
        )

        return {
            "statusCode": 200,
            "results": results,
            "totalResults": response.get("TotalNumberOfResults", 0),
        }

    except kendra.exceptions.ThrottlingException:
        logger.warning("Kendra throttling")
        metrics.add_metric(name="KendraThrottleCount", unit=MetricUnit.Count, value=1)
        return _error_response(429, "Search service is temporarily busy. Please retry.")
    except Exception as e:
        logger.exception("Kendra query failed")
        metrics.add_metric(name="KendraErrorCount", unit=MetricUnit.Count, value=1)
        return _error_response(500, f"Search failed: {str(e)}")


def _transform_results(result_items: list[dict]) -> list[dict]:
    """KendraのResultItemsを返却用フォーマットに変換する"""
    transformed = []
    for item in result_items:
        doc_attributes = {
            attr["Key"]: attr["Value"]
            for attr in item.get("DocumentAttributes", [])
        }

        transformed.append(
            {
                "id": item.get("Id", ""),
                "type": item.get("Type", ""),
                "title": item.get("DocumentTitle", {}).get("Text", ""),
                "excerpt": item.get("DocumentExcerpt", {}).get("Text", ""),
                "score": item.get("ScoreAttributes", {}).get("ScoreConfidence", "NOT_AVAILABLE"),
                "documentUri": item.get("DocumentURI"),
                "feedbackToken": item.get("FeedbackToken"),
            }
        )

    return transformed


def _error_response(status_code: int, message: str) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "error": message,
        "results": [],
        "totalResults": 0,
    }
