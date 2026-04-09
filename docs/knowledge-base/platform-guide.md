# Platform Engineering ガイド

## 概要

本プラットフォームは、開発チームが新規プロジェクトを迅速かつ安全に立ち上げるための共通基盤を提供します。
AWS CDK を使用したInfrastructure as Code により、一貫したセキュリティ設定と運用標準を維持します。

## アーキテクチャ

### コンポーネント構成

| コンポーネント | 技術 | 用途 |
|---|---|---|
| フロントエンド | Next.js + Tailwind CSS | ユーザーインターフェース |
| バックエンド | AWS Lambda (Node.js/Python) | ビジネスロジック |
| API | API Gateway (REST) + AppSync (GraphQL) | APIエンドポイント |
| データストア | DynamoDB | NoSQLデータ管理 |
| 認証 | Amazon Cognito | ユーザー認証・認可 |
| CDN | CloudFront + S3 | 静的アセット配信 |
| セキュリティ | WAF | Webアプリケーションファイアウォール |
| IaC | AWS CDK (TypeScript) | インフラ管理 |
| AI/検索 | Amazon Bedrock + Kendra | RAGシステム |

## 新規プロジェクトの立ち上げ方

### 1. リポジトリのテンプレートを使用する

GitHub でこのリポジトリを「Use this template」してください。

### 2. 必要なコンテキスト変数を設定する

`cdk.json` の `context` セクションを更新します:

```json
{
  "context": {
    "env": "dev",
    "githubOrg": "your-organization",
    "githubRepo": "your-repo-name",
    "frontendUrl": "https://your-cloudfront-domain.cloudfront.net"
  }
}
```

### 3. AWS環境をブートストラップする

```bash
npx cdk bootstrap aws://ACCOUNT_ID/ap-northeast-1
```

### 4. 基本スタックをデプロイする

```bash
npx cdk deploy StorageStack AuthStack ComputeStack ApiStack
```

## セキュリティ設定

### IAMポリシー設計原則

- **最小権限の原則**: 各LambdaはアクセスするAWSリソースのみへの最小限の権限を持つ
- **ロールの分離**: 本番/開発環境でIAMロールを分離する
- **GitHubActionsOIDC**: IAMアクセスキーをシークレットに保存しない

### WAF設定

デフォルトで以下のマネージドルールが有効です:
- `AWSManagedRulesCommonRuleSet`: SQLi, XSSなど一般的な攻撃をブロック
- `AWSManagedRulesKnownBadInputsRuleSet`: 既知の悪意ある入力パターンをブロック
- `AWSManagedRulesSQLiRuleSet`: SQLインジェクション攻撃をブロック

### レート制限

同一IPから5分間に2000リクエスト超でブロックします。
本番環境では要件に合わせて調整してください。

## CI/CD パイプライン

### GitHub Actions ワークフロー

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `ci.yml` | Push/PR | ビルド・テスト・型チェック |
| `security.yml` | Push/PR/週次 | 依存関係監査・SAST・IaCスキャン |
| `deploy-dev.yml` | mainへのPush | dev環境へのCDKデプロイ |
| `deploy-prod.yml` | リリースタグ | 承認ゲート付き本番デプロイ |

### デプロイフロー

1. feature/* ブランチで開発
2. PRを作成 → CIとセキュリティスキャンが自動実行
3. レビュー承認後 main にマージ → dev環境に自動デプロイ
4. リリースタグ作成 → 承認ゲート通過後に本番デプロイ

## AI開発アシスタント

Amazon Bedrock を使用した RAG (Retrieval Augmented Generation) システムにより、
このドキュメントを含むプラットフォームのナレッジベースに基づいた自然言語での質問応答が可能です。

- `/ai-assistant` ページから日本語・英語で質問できます
- 回答には参照元ドキュメントの引用が含まれます
- セッションIDにより会話のコンテキストを維持します

## トラブルシューティング

### CDK synth が失敗する場合

```bash
# 依存関係を再インストール
cd infra/cdk && npm ci

# TypeScriptコンパイルエラーを確認
npx tsc --noEmit
```

### Lambda デプロイが失敗する場合

- esbuildがインストールされているか確認: `npm ls esbuild`
- backend/lambda のビルドを確認: `cd backend/lambda && npm ci`

### Cognito認証エラー

- UserPoolClientのコールバックURLを確認
- `.env.local` の `NEXT_PUBLIC_USER_POOL_CLIENT_ID` が正しいか確認
