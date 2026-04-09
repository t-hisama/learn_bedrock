import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { SecureLambda } from '../constructs/secure-lambda';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  todoTable: dynamodb.Table;
}

/**
 * コンピュートスタック。
 *
 * Lambdaファンクション群を管理する。StorageStackへの依存を持つ。
 * SecureLambdaコンストラクトを使用してX-Ray/DLQ/ログ設定を統一。
 *
 * KDDI要件対応: Lambda, 共通コンストラクトによる標準化
 */
export class ComputeStack extends cdk.Stack {
  public readonly todoLambda: import('aws-cdk-lib/aws-lambda-nodejs').NodejsFunction;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const todoHandler = new SecureLambda(this, 'TodoHandler', {
      entry: path.join(__dirname, '../../../../../backend/lambda/handler.ts'),
      handler: 'main',
      environment: {
        TABLE_NAME: props.todoTable.tableName,
      },
    });

    props.todoTable.grantReadWriteData(todoHandler.fn);

    this.todoLambda = todoHandler.fn;

    new cdk.CfnOutput(this, 'TodoLambdaArn', { value: todoHandler.fn.functionArn });
  }
}
