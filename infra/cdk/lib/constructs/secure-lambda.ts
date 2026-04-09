import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface SecureLambdaProps extends NodejsFunctionProps {
  /**
   * ログ保持期間。デフォルト: dev=7日, prod=90日
   * CDKコンテキスト `env` が "prod" の場合は90日になる
   */
  logRetentionDays?: logs.RetentionDays;
}

/**
 * セキュリティベストプラクティスを組み込んだ再利用可能なLambdaコンストラクト。
 * X-Ray、DLQ、CloudWatch Logsの保持期間設定を自動適用する。
 *
 * KDDIプロジェクトでの共通テンプレートコンストラクトのサンプル実装。
 */
export class SecureLambda extends Construct {
  public readonly fn: NodejsFunction;
  public readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: SecureLambdaProps) {
    super(scope, id);

    const isProd = scope.node.tryGetContext('env') === 'prod';
    const logRetention =
      props.logRetentionDays ??
      (isProd ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK);

    // Dead Letter Queue: 3回リトライ失敗後のメッセージを保持
    this.dlq = new sqs.Queue(this, 'DLQ', {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.fn = new NodejsFunction(this, 'Fn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      tracing: lambda.Tracing.ACTIVE, // X-Ray トレーシング
      deadLetterQueue: this.dlq,
      logRetention,
      ...props,
    });
  }
}
