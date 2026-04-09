.PHONY: install test lint build synth diff deploy-dev security-scan clean help

# デフォルトターゲット
.DEFAULT_GOAL := help

# ===== セットアップ =====

## 全依存関係のインストール
install:
	npm ci --prefix frontend
	npm ci --prefix backend/lambda
	npm ci --prefix infra/cdk
	@echo "✓ Node.js依存関係インストール完了"
	@if command -v pip >/dev/null 2>&1; then \
	  pip install -r backend/lambda-python/requirements-dev.txt; \
	  echo "✓ Python依存関係インストール完了"; \
	fi

# ===== テスト =====

## 全テストの実行
test: test-lambda test-cdk test-python

## TypeScript Lambda テスト
test-lambda:
	@echo "--- Lambda Unit Tests ---"
	cd backend/lambda && npm test

## CDK テスト
test-cdk:
	@echo "--- CDK Tests ---"
	cd infra/cdk && npm test -- --ci

## Python Lambda テスト (pytest)
test-python:
	@if command -v pytest >/dev/null 2>&1; then \
	  echo "--- Python Lambda Tests ---"; \
	  cd backend/lambda-python && pytest --cov=. --cov-report=term-missing -v; \
	else \
	  echo "⚠️  pytest not found. Run 'make install' first."; \
	fi

# ===== コード品質 =====

## 全Lintチェック
lint: lint-ts lint-python

## TypeScript Lint
lint-ts:
	@echo "--- TypeScript Lint ---"
	cd frontend && npm run lint
	cd infra/cdk && npx tsc --noEmit

## Python Lint (ruff)
lint-python:
	@if command -v ruff >/dev/null 2>&1; then \
	  echo "--- Python Lint (ruff) ---"; \
	  cd backend/lambda-python && ruff check . && ruff format --check .; \
	else \
	  echo "⚠️  ruff not found. Run 'make install' first."; \
	fi

# ===== ビルド =====

## フロントエンドビルド
build:
	@echo "--- Frontend Build ---"
	cd frontend && npm run build

## Next.js 静的エクスポート (S3/CloudFront デプロイ用)
## next.config.ts に output: 'export' が必要
export-frontend:
	cd frontend && npm run build
	@echo "✓ frontend/out/ に静的ファイルを出力しました"

# ===== インフラ =====

## CDK synth (CloudFormationテンプレート生成)
synth:
	@echo "--- CDK Synth ---"
	cd infra/cdk && npx cdk synth --all

## CDK diff (デプロイ前の変更確認)
diff:
	@echo "--- CDK Diff ---"
	cd infra/cdk && npx cdk diff --all

## Dev環境へのデプロイ (必須スタックのみ)
deploy-dev:
	@echo "--- CDK Deploy (dev) ---"
	cd infra/cdk && npx cdk deploy \
	  StorageStack AuthStack ComputeStack ApiStack \
	  --require-approval never

## WAF + フロントエンドのデプロイ (CloudFront)
deploy-frontend:
	@echo "--- WAF + Frontend Deploy ---"
	@echo "注意: WafStackはus-east-1にデプロイされます"
	cd infra/cdk && npx cdk deploy WafStack FrontendStack \
	  --require-approval never

# ===== セキュリティ =====

## セキュリティ監査 (依存関係の脆弱性チェック)
security-scan:
	@echo "--- Security Scan ---"
	@echo "[1/3] Frontend npm audit"
	cd frontend && npm audit --audit-level=high
	@echo "[2/3] Backend npm audit"
	cd backend/lambda && npm audit --audit-level=high
	@echo "[3/3] CDK npm audit"
	cd infra/cdk && npm audit --audit-level=high
	@echo "✓ セキュリティスキャン完了"

# ===== ローカル開発 =====

## LocalStack起動 (DynamoDB + S3 ローカルエミュレーター)
localstack-up:
	docker compose up -d
	@echo "✓ LocalStack起動完了"
	@echo "  DynamoDB Admin: http://localhost:8001"
	@echo "  LocalStack: http://localhost:4566"

## LocalStack停止
localstack-down:
	docker compose down

## ローカルDBへのシードデータ投入
seed:
	bash scripts/seed-local.sh

## フロントエンド開発サーバー起動
dev:
	cd frontend && npm run dev

# ===== クリーンアップ =====

## ビルドアーティファクトの削除
clean:
	rm -rf frontend/.next frontend/out
	rm -rf infra/cdk/cdk.out
	find . -name "*.js.map" -not -path "*/node_modules/*" -delete
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ クリーンアップ完了"

# ===== ヘルプ =====

## このヘルプを表示
help:
	@echo ""
	@echo "Platform Template - 利用可能なコマンド"
	@echo "========================================"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo ""
