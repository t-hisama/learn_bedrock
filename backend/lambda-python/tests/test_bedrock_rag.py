"""
Bedrock RAG Lambda のユニットテスト

実際のBedrockへの接続はbotocore stubbersでモックする。
(motoはBedrock Agent Runtimeをサポートしていないため)
"""

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_BASE_ID", "test-kb-id")
    monkeypatch.setenv(
        "MODEL_ARN",
        "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
    )
    monkeypatch.setenv("REGION", "ap-northeast-1")


class TestHandler:
    def test_missing_query_returns_400(self):
        from bedrock_rag.handler import handler

        result = handler({}, MagicMock())
        assert result["statusCode"] == 400
        assert "query is required" in result["error"]

    def test_empty_query_returns_400(self):
        from bedrock_rag.handler import handler

        result = handler({"query": "  "}, MagicMock())
        assert result["statusCode"] == 400

    def test_too_long_query_returns_400(self):
        from bedrock_rag.handler import handler

        result = handler({"query": "a" * 1001}, MagicMock())
        assert result["statusCode"] == 400
        assert "1000 characters" in result["error"]

    def test_appsync_arguments_format(self):
        """AppSync経由のeventフォーマット (arguments.query) をサポートする"""
        mock_response = {
            "output": {"text": "テスト回答"},
            "sessionId": "session-123",
            "citations": [],
        }

        with patch("bedrock_rag.handler.bedrock_agent_runtime") as mock_client:
            mock_client.retrieve_and_generate.return_value = mock_response
            mock_client.exceptions.ResourceNotFoundException = Exception
            mock_client.exceptions.ThrottlingException = Exception

            from bedrock_rag.handler import handler

            result = handler({"arguments": {"query": "テスト質問"}}, MagicMock())

        assert result["statusCode"] == 200
        assert result["answer"] == "テスト回答"

    def test_successful_rag_response(self):
        """正常なRAGレスポンスが返ること"""
        mock_response = {
            "output": {"text": "CDKのデプロイにはnpx cdk deployを使います。"},
            "sessionId": "session-abc",
            "citations": [
                {
                    "retrievedReferences": [
                        {
                            "content": {"text": "デプロイ手順の説明"},
                            "location": {"s3Location": {"uri": "s3://bucket/docs/guide.md"}},
                            "score": 0.95,
                        }
                    ]
                }
            ],
        }

        with patch("bedrock_rag.handler.bedrock_agent_runtime") as mock_client:
            mock_client.retrieve_and_generate.return_value = mock_response
            mock_client.exceptions.ResourceNotFoundException = Exception
            mock_client.exceptions.ThrottlingException = Exception

            from bedrock_rag.handler import handler

            result = handler({"query": "CDKのデプロイ方法は？", "sessionId": "session-abc"}, MagicMock())

        assert result["statusCode"] == 200
        assert "CDK" in result["answer"]
        assert result["sessionId"] == "session-abc"
        assert len(result["citations"]) == 1
        assert result["citations"][0]["location"] == "s3://bucket/docs/guide.md"
        assert result["citations"][0]["score"] == 0.95


class TestExtractCitations:
    def test_empty_citations(self):
        from bedrock_rag.handler import _extract_citations

        assert _extract_citations([]) == []

    def test_citation_without_score(self):
        from bedrock_rag.handler import _extract_citations

        raw = [
            {
                "retrievedReferences": [
                    {
                        "content": {"text": "テストコンテンツ"},
                        "location": {"s3Location": {"uri": "s3://bucket/file.md"}},
                    }
                ]
            }
        ]
        result = _extract_citations(raw)
        assert len(result) == 1
        assert result[0]["score"] is None
