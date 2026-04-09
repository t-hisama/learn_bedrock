import * as cdk from 'aws-cdk-lib';
import * as kendra from 'aws-cdk-lib/aws-kendra';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface KendraStackProps extends cdk.StackProps {
  knowledgeBaseBucket: s3.Bucket;
}

/**
 * Amazon Kendraスタック。
 *
 * 開発者向けナレッジベースの全文検索を提供する。
 * プラットフォームドキュメント・FAQ・運用ガイドを検索可能にする。
 *
 * ⚠️ コスト注意:
 *   DEVELOPER_S エディション: 約 $810/月
 *   使用しない場合は cdk.json の context に "useKendra": false を設定し、
 *   デプロイをスキップすること。
 *
 * CDKデプロイ例:
 *   cdk deploy KendraStack  (有効化)
 *   cdk deploy --context useKendra=false  (Kendraをスキップ)
 *
 * KDDI要件対応: Amazon Kendra, 開発者ポータル基盤
 */
export class KendraStack extends cdk.Stack {
  public readonly index: kendra.CfnIndex;
  public readonly indexId: string;

  constructor(scope: Construct, id: string, props: KendraStackProps) {
    super(scope, id, props);

    // Kendraサービスロール
    const kendraRole = new iam.Role(this, 'KendraRole', {
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
      description: 'Role for Kendra to access S3 and CloudWatch',
    });

    kendraRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudwatch:PutMetricData',
          'logs:DescribeLogGroups',
          'logs:CreateLogGroup',
          'logs:DescribeLogStreams',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'AWS/Kendra',
          },
        },
      }),
    );

    props.knowledgeBaseBucket.grantRead(kendraRole);

    // Kendra Index (DEVELOPER_S: 開発・検証用)
    this.index = new kendra.CfnIndex(this, 'Index', {
      name: 'PlatformKnowledgeBase',
      edition: 'DEVELOPER_S',
      roleArn: kendraRole.roleArn,
      description: 'Platform Engineering ナレッジベース検索インデックス',
      documentMetadataConfigurations: [
        {
          name: 'language',
          type: 'STRING_VALUE',
          search: { facetable: false, searchable: true, displayable: true },
        },
      ],
    });
    this.indexId = this.index.attrId;

    // S3データソース (docs/knowledge-base/ ディレクトリ)
    const s3DataSourceRole = new iam.Role(this, 'S3DataSourceRole', {
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
    });
    props.knowledgeBaseBucket.grantRead(s3DataSourceRole);

    new kendra.CfnDataSource(this, 'S3DataSource', {
      indexId: this.index.attrId,
      name: 'PlatformDocs',
      type: 'S3',
      roleArn: s3DataSourceRole.roleArn,
      dataSourceConfiguration: {
        s3Configuration: {
          bucketName: props.knowledgeBaseBucket.bucketName,
          inclusionPrefixes: ['knowledge-base/'],
          documentsMetadataConfiguration: {
            s3Prefix: 'knowledge-base-metadata/',
          },
        },
      },
      // 毎日午前2時に自動同期 (JST 11:00)
      schedule: 'cron(0 17 * * ? *)',
      description: 'プラットフォームドキュメントの定期同期',
    });

    new cdk.CfnOutput(this, 'KendraIndexId', {
      value: this.index.attrId,
      description: 'Kendra検索に使用するIndexId',
    });
  }
}
