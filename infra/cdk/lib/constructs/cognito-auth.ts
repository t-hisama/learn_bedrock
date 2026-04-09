import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CognitoAuthProps {
  /** Cognito Hosted UI のドメインプレフィックス（グローバル一意） */
  domainPrefix: string;
  /** OAuth2コールバックURL (例: https://example.com/auth/callback) */
  callbackUrls: string[];
  /** ログアウト後のリダイレクトURL */
  logoutUrls: string[];
}

/**
 * Cognito UserPool + HostedUI + AppClientを一括プロビジョニングするコンストラクト。
 *
 * 企業要件に基づくセキュリティ設定:
 * - メール検証必須
 * - MFAオプション（ユーザー選択）
 * - パスワードポリシー（12文字以上、大小英数字記号）
 * - 高度なセキュリティ機能（ENFORCED）
 */
export class CognitoAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolDomain = new cognito.UserPoolDomain(this, 'Domain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'Client', {
      userPool: this.userPool,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      generateSecret: false, // SPA (Next.js) はシークレット不要
      preventUserExistenceErrors: true,
    });
  }
}
