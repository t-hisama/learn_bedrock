import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CognitoAuth } from '../constructs/cognito-auth';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  /**
   * フロントエンドのURL (例: https://d1234.cloudfront.net)
   * ローカル開発: http://localhost:3000
   */
  frontendUrl: string;
  /**
   * GitHub OrganizationまたはUser名 (OIDC連携用)
   * 例: "my-org" or "my-username"
   */
  githubOrg: string;
  /** GitHub リポジトリ名 (OIDC連携用) */
  githubRepo: string;
}

/**
 * 認証・認可スタック。
 *
 * - Cognito UserPool + HostedUI: ユーザー認証基盤
 * - GitHub Actions OIDC: IAMキー保存不要なCI/CD認証
 *   (IAMアクセスキーをGitHubシークレットに保存するアンチパターンを排除)
 *
 * KDDI要件対応: Identity Center(SSO)、セキュリティ要件対応
 */
export class AuthStack extends cdk.Stack {
  public readonly cognitoAuth: CognitoAuth;
  public readonly githubActionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Cognito 認証基盤
    this.cognitoAuth = new CognitoAuth(this, 'CognitoAuth', {
      domainPrefix: `platform-template-${this.account.slice(-6)}`,
      callbackUrls: [
        `${props.frontendUrl}/auth/callback`,
        'http://localhost:3000/auth/callback',
      ],
      logoutUrls: [props.frontendUrl, 'http://localhost:3000'],
    });

    // GitHub Actions OIDC Provider
    // これによりGitHub ActionsからAWSリソースへIAMキーなしでアクセス可能
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // GitHub Actions用IAMロール (CDKデプロイ権限)
    this.githubActionsRole = new iam.Role(this, 'GithubActionsRole', {
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.githubOrg}/${props.githubRepo}:*`,
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
      description: 'Role for GitHub Actions to deploy via CDK',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // CDKデプロイに必要な最小権限
    // 本番環境では CloudFormation + S3 (CDK assets) + 対象サービスに絞ること
    this.githubActionsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'),
    );

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.cognitoAuth.userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.cognitoAuth.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
      value: this.githubActionsRole.roleArn,
      description: 'GitHub ActionsワークフローのAWS_ROLE_TO_ASSUMEに設定',
    });
  }
}
