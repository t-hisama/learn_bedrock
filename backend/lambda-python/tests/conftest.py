"""pytest共通フィクスチャ"""

import os

import pytest


@pytest.fixture(autouse=True)
def aws_environment(monkeypatch):
    """テスト用AWS環境変数を設定する (実際のAWSへの接続を防ぐ)"""
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-northeast-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("POWERTOOLS_SERVICE_NAME", "test-service")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
