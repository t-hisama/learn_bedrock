import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ComputeStack } from '../lib/stacks/compute-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { WafStack } from '../lib/stacks/waf-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { KendraStack } from '../lib/stacks/kendra-stack';
import { BedrockStack } from '../lib/stacks/bedrock-stack';

/**
 * Platform Template - マルチスタックCDKアプリケーション
 *
 * スタック依存関係:
 *   NetworkStack
 *   StorageStack
 *   AuthStack    (フロントエンドURLが必要)
 *   ComputeStack ← StorageStack
 *   ApiStack     ← ComputeStack, StorageStack, AuthStack
 *   WafStack     (us-east-1 固定)
 *   FrontendStack← WafStack (SSM経由)
 *   KendraStack  ← StorageStack (オプション)
 *   BedrockStack ← StorageStack (オプション)
 *
 * デプロイコマンド:
 *   # 全スタック
 *   npx cdk deploy --all
 *
 *   # 必須スタックのみ (AI機能なし)
 *   npx cdk deploy NetworkStack StorageStack AuthStack ComputeStack ApiStack
 *
 *   # フロントエンド (WafStackを先にデプロイすること)
 *   npx cdk deploy WafStack && npx cdk deploy FrontendStack
 *
 * コンテキスト変数:
 *   env          : "dev" | "prod" (デフォルト: "dev")
 *   useKendra    : "true" | "false" (デフォルト: "false" - $810/月のコスト注意)
 *   useBedrock   : "true" | "false" (デフォルト: "false" - $700/月のコスト注意)
 *   frontendUrl  : フロントエンドURL (デフォルト: "http://localhost:3000")
 *   githubOrg    : GitHub Org/User名 (OIDC認証用)
 *   githubRepo   : GitHubリポジトリ名 (OIDC認証用)
 */
const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
};

const frontendUrl = app.node.tryGetContext('frontendUrl') ?? 'http://localhost:3000';
const githubOrg = app.node.tryGetContext('githubOrg') ?? 'your-org';
const githubRepo = app.node.tryGetContext('githubRepo') ?? 'serverless-platform-template';
const useKendra = app.node.tryGetContext('useKendra') === 'true';
const useBedrock = app.node.tryGetContext('useBedrock') === 'true';

// ネットワーク基盤
new NetworkStack(app, 'NetworkStack', { env });

// ストレージ基盤
const storageStack = new StorageStack(app, 'StorageStack', { env });

// 認証基盤
const authStack = new AuthStack(app, 'AuthStack', {
  env,
  frontendUrl,
  githubOrg,
  githubRepo,
});

// コンピュート (Lambda)
const computeStack = new ComputeStack(app, 'ComputeStack', {
  env,
  todoTable: storageStack.todoTable,
});
computeStack.addDependency(storageStack);

// API (REST + GraphQL)
const apiStack = new ApiStack(app, 'ApiStack', {
  env,
  todoLambda: computeStack.todoLambda,
  todoTable: storageStack.todoTable,
  userPool: authStack.cognitoAuth.userPool,
});
apiStack.addDependency(computeStack);
apiStack.addDependency(authStack);

// WAF (us-east-1固定, CloudFront用)
new WafStack(app, 'WafStack', {
  env: { ...env, region: 'us-east-1' },
});

// フロントエンドホスティング
const frontendStack = new FrontendStack(app, 'FrontendStack', { env });
// WafStackのSSMパラメータに依存するため、明示的に依存関係は不要
// (SSM.valueForStringParameterがデプロイ時に解決される)
frontendStack.addDependency(storageStack);

// Amazon Kendra (オプション - コスト高いため明示的に有効化が必要)
if (useKendra) {
  const kendraStack = new KendraStack(app, 'KendraStack', {
    env,
    knowledgeBaseBucket: storageStack.knowledgeBaseBucket,
  });
  kendraStack.addDependency(storageStack);
}

// Amazon Bedrock RAG (オプション - コスト高いため明示的に有効化が必要)
if (useBedrock) {
  const bedrockStack = new BedrockStack(app, 'BedrockStack', {
    env,
    knowledgeBaseBucket: storageStack.knowledgeBaseBucket,
  });
  bedrockStack.addDependency(storageStack);
}
