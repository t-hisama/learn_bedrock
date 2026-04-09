# サーバレス Todo API テンプレート

## 概要

本リポジトリは、AWS を用いたサーバレスアーキテクチャの構築および開発基盤のテンプレートです。

以下の構成により、シンプルな Todo API を実装しています。

- AWS CDK による Infrastructure as Code
- API Gateway + Lambda による API 構築
- DynamoDB によるデータ永続化
- TypeScript Lambda（NodejsFunction による自動バンドル）

本テンプレートは、開発者が新規プロジェクトを迅速に立ち上げるための基盤として利用することを想定しています。

---

## アーキテクチャ
---

## 前提条件

- Node.js（v18 以上）
- npm
- AWS CLI
- AWS アカウント（認証設定済み）

---

## セットアップ

```bash
git clone <this-repository>
cd serverless-platform-template

cd infra/cdk
npm install

cd ../../backend/lambda
npm install

cd infra/cdk

cdk bootstrap
cdk deploy

