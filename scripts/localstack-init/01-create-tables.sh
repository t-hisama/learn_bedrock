#!/bin/bash
# LocalStack初期化スクリプト
# docker-compose up 後に自動実行される

set -e

ENDPOINT="http://localhost:4566"
REGION="ap-northeast-1"

echo "=== LocalStack初期化: DynamoDBテーブル作成 ==="

# TodoTable作成
aws --endpoint-url="$ENDPOINT" --region="$REGION" \
  dynamodb create-table \
  --table-name TodoTable \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null || echo "TodoTable は既に存在します"

echo "=== LocalStack初期化: S3バケット作成 ==="

# KnowledgeBase用バケット作成
aws --endpoint-url="$ENDPOINT" --region="$REGION" \
  s3 mb s3://platform-knowledge-base-local \
  2>/dev/null || echo "platform-knowledge-base-local は既に存在します"

# サンプルドキュメントをアップロード
if [ -d "/etc/localstack/init/knowledge-base" ]; then
  aws --endpoint-url="$ENDPOINT" --region="$REGION" \
    s3 sync /etc/localstack/init/knowledge-base \
    s3://platform-knowledge-base-local/knowledge-base/
fi

echo "=== LocalStack初期化 完了 ==="
echo "DynamoDB Admin UI: http://localhost:8001"
echo "LocalStack Health: http://localhost:4566/_localstack/health"
