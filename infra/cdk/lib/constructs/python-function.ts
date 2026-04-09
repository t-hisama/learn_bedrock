import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface PythonFunctionProps {
  /** Lambda ハンドラーのディレクトリ（requirements.txtが存在すること）*/
  codePath: string;
  /** ハンドラー関数 (module.function 形式) */
  handler: string;
  /** 環境変数 */
  environment?: { [key: string]: string };
  /** タイムアウト。デフォルト: 30秒 */
  timeout?: cdk.Duration;
  /** メモリサイズ (MB)。デフォルト: 256 */
  memorySize?: number;
}

/**
 * Python 3.12 Lambda関数コンストラクト。
 * aws-lambda-powertoolsレイヤーを自動アタッチし、X-Ray・DLQを設定する。
 *
 * NOTE: デプロイにはDockerが必要（bundling時にpip installを実行）
 */
export class PythonFunction extends Construct {
  public readonly fn: lambda.Function;
  public readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: PythonFunctionProps) {
    super(scope, id);

    // AWS Lambda Powertools for Python (V2) - ap-northeast-1 用レイヤーARN
    // 最新バージョンは https://docs.powertools.aws.dev/lambda/python/latest/ を参照
    const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'PowertoolsLayer',
      `arn:aws:lambda:${cdk.Stack.of(this).region}:017000801446:layer:AWSLambdaPowertoolsPythonV2:79`,
    );

    this.dlq = new sqs.Queue(this, 'DLQ', {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.fn = new lambda.Function(this, 'Fn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(props.codePath, {
        bundling: {
          // ローカルDockerでpip installを実行してパッケージをバンドル
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
          ],
        },
      }),
      handler: props.handler,
      environment: {
        POWERTOOLS_SERVICE_NAME: id,
        LOG_LEVEL: 'INFO',
        ...props.environment,
      },
      tracing: lambda.Tracing.ACTIVE,
      deadLetterQueue: this.dlq,
      timeout: props.timeout ?? cdk.Duration.seconds(30),
      memorySize: props.memorySize ?? 256,
      layers: [powertoolsLayer],
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
  }
}
