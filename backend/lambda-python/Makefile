.PHONY: install test lint typecheck clean

# 依存関係のインストール (開発用)
install:
	pip install -r requirements.txt -r requirements-dev.txt

# テスト実行 (カバレッジ付き)
test:
	pytest --cov=. --cov-report=term-missing --cov-report=html -v

# Lintチェック (ruff)
lint:
	ruff check .
	ruff format --check .

# 型チェック (mypy)
typecheck:
	mypy . --ignore-missing-imports

# フォーマット修正
format:
	ruff format .
	ruff check --fix .

# クリーンアップ
clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -name "*.pyc" -delete
	rm -rf .coverage htmlcov .pytest_cache .mypy_cache
