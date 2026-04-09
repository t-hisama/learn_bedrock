#!/bin/bash
# デプロイ前検証スクリプト
# CDK diff + セキュリティ監査を実行してデプロイの安全性を確認する

set -e

echo "=== デプロイ前検証 ==="
echo ""

# 1. 依存関係の脆弱性チェック
echo "--- [1/4] 依存関係の脆弱性チェック ---"
echo "Frontend:"
cd frontend && npm audit --audit-level=high; cd ..

echo "Backend:"
cd backend/lambda && npm audit --audit-level=high; cd ../..

echo "CDK:"
cd infra/cdk && npm audit --audit-level=high; cd ../..

echo ""

# 2. TypeScript型チェック
echo "--- [2/4] TypeScript型チェック ---"
cd infra/cdk && npx tsc --noEmit && echo "CDK: OK"
cd ../..
cd frontend && npx tsc --noEmit && echo "Frontend: OK"
cd ..

echo ""

# 3. CDKテスト
echo "--- [3/4] CDKテスト ---"
cd infra/cdk && npm test -- --ci
cd ../..

echo ""

# 4. CDK diff (変更内容の確認)
echo "--- [4/4] CDK diff (変更差分) ---"
cd infra/cdk && npx cdk diff --all
cd ../..

echo ""
echo "=== 検証完了: デプロイ可能です ==="
