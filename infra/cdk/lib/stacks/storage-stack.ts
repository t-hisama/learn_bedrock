import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * ストレージスタック。
 *
 * - DynamoDB (TodoTable): PAY_PER_REQUEST, 暗号化, PITR有効
 * - S3 (KnowledgeBase): Kendra/Bedrock用ドキュメント格納バケット
 * - S3 (AccessLogs): アクセスログ専用バケット
 *
 * KDDI要件対応: DynamoDB, S3, セキュリティ設定の標準化
 */
export class StorageStack extends cdk.Stack {
  public readonly todoTable: dynamodb.Table;
  public readonly knowledgeBaseBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const isProd = this.node.tryGetContext('env') === 'prod';

    // アクセスログ専用バケット
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Kendra/Bedrock ナレッジベース用S3バケット
    this.knowledgeBaseBucket = new s3.Bucket(this, 'KnowledgeBaseBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'knowledge-base/',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd, // 本番では誤削除防止のため無効
    });

    // TodoテーブルDynamoDB
    this.todoTable = new dynamodb.Table(this, 'TodoTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Outputs
    new cdk.CfnOutput(this, 'TodoTableName', { value: this.todoTable.tableName });
    new cdk.CfnOutput(this, 'KnowledgeBaseBucketName', {
      value: this.knowledgeBaseBucket.bucketName,
    });
  }
}
