import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * フロントエンドホスティングスタック。
 *
 * - S3バケット: 静的アセット格納 (パブリックアクセス完全ブロック)
 * - CloudFront: OAC (Origin Access Control) 経由でS3配信
 * - WAF: us-east-1のWebACL ARNをSSM経由で参照
 *
 * ⚠️ 事前準備: WafStackのデプロイが必要 (SSM Parameter StoreにARNを保存するため)
 *
 * KDDI要件対応: S3, CloudFront, WAF
 */
export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // アクセスログ用バケット
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Webアセット用バケット (パブリックアクセス完全ブロック)
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'website/',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // WAF WebACL ARNをSSM Parameter Storeから取得
    // WafStack (us-east-1) がこのパラメータを作成している
    // NOTE: SSM.valueForStringParameter はデプロイ時に解決される
    const webAclArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/platform-template/waf/webacl-arn',
    );

    // CloudFront OAC (Origin Access Control)
    // OAI (旧方式) ではなく OAC を使用する (AWS推奨)
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for Platform Template Website',
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPAルーティング: 404/403 → index.htmlにフォールバック
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      webAclId: webAclArn,
      enableLogging: true,
      logBucket: accessLogsBucket,
      logFilePrefix: 'cloudfront/',
    });

    // Next.js静的エクスポート (next build + next export) の出力をデプロイ
    // next.config.ts に output: 'export' の設定が必要
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../../frontend/out')),
      ],
      destinationBucket: this.websiteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'], // デプロイ後にCloudFrontキャッシュを無効化
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'フロントエンドのURL',
    });
  }
}
