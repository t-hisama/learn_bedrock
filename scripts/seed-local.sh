#!/bin/bash
# ローカルDynamoDBへのシードデータ投入スクリプト
# 前提: docker compose up -d で LocalStack が起動していること

set -e

ENDPOINT="http://localhost:4566"
REGION="ap-northeast-1"
TABLE="TodoTable"

echo "=== シードデータを投入中: $TABLE ==="

# サンプルTodo を投入
items=(
  "CDKのStorageStackを実装する"
  "GitHub ActionsのOIDC認証を設定する"
  "Bedrock Knowledge Baseにドキュメントをアップロードする"
  "AppSync GraphQL スキーマを定義する"
  "Backstage catalog-info.yaml を作成する"
)

for item in "${items[@]}"; do
  ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  aws --endpoint-url="$ENDPOINT" --region="$REGION" \
    dynamodb put-item \
    --table-name "$TABLE" \
    --item "{
      \"id\": {\"S\": \"$ID\"},
      \"title\": {\"S\": \"$item\"},
      \"createdAt\": {\"S\": \"$CREATED_AT\"}
    }"

  echo "  追加: $item"
done

echo ""
echo "=== シードデータ投入完了 ==="
echo "DynamoDB Admin UIで確認: http://localhost:8001"
