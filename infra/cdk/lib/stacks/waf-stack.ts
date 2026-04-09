import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * WAF WebACLスタック。
 *
 * ⚠️ 重要: CloudFront用WAFは必ずus-east-1にデプロイする必要がある。
 *    API Gateway用WAFはREGIONALスコープで各リージョンにデプロイ。
 *
 * このスタックはus-east-1でデプロイし、WebACL ARNをSSM Parameter Storeに
 * 保存してクロスリージョン参照を実現する。
 *
 * KDDI要件対応: WAF, セキュリティ設定の標準化
 */
export class WafStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      // CloudFront用WAFは必ずus-east-1
      env: { ...props?.env, region: 'us-east-1' },
    });

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'PlatformTemplateWebAcl',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'PlatformTemplateWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        // AWSマネージドルール: 一般的な攻撃パターンをブロック
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // 既知の悪意ある入力をブロック
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
            sampledRequestsEnabled: true,
          },
        },
        // SQLインジェクション攻撃をブロック
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // レートリミット: 同一IPから5分間に2000リクエスト超でブロック
        {
          name: 'RateLimit',
          priority: 4,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // WebACL ARNをSSM Parameter Storeに保存
    // FrontendStack (ap-northeast-1) がこのARNを参照する
    new ssm.StringParameter(this, 'WebAclArnParam', {
      parameterName: '/platform-template/waf/webacl-arn',
      stringValue: `arn:aws:wafv2:us-east-1:${this.account}:global/webacl/PlatformTemplateWebAcl/${this.webAcl.attrId}`,
      description: 'CloudFront用WAF WebACL ARN (us-east-1)',
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      description: 'CloudFrontに関連付けるWAF WebACL ARN',
    });
  }
}
