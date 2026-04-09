import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/stacks/storage-stack';
import { ComputeStack } from '../lib/stacks/compute-stack';

/**
 * StorageStackのテスト
 * セキュリティ要件（暗号化・PITR・アクセスブロック）を検証する
 */
describe('StorageStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestStorageStack');
    template = Template.fromStack(stack);
  });

  test('DynamoDB table has PAY_PER_REQUEST billing mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('DynamoDB table has encryption enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: { SSEEnabled: true },
    });
  });

  test('DynamoDB table has PITR enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  test('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket enforces SSL', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Deny',
            Condition: {
              Bool: { 'aws:SecureTransport': 'false' },
            },
          },
        ],
      },
    });
  });
});

/**
 * ComputeStackのテスト
 * X-Ray、DLQの設定を検証する
 */
describe('ComputeStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const storageStack = new StorageStack(app, 'TestStorageStack');
    const computeStack = new ComputeStack(app, 'TestComputeStack', {
      todoTable: storageStack.todoTable,
    });
    template = Template.fromStack(computeStack);
  });

  test('Lambda function has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      TracingConfig: { Mode: 'Active' },
    });
  });

  test('Lambda DLQ is created with encryption', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      SqsManagedSseEnabled: true,
    });
  });

  test('Lambda runtime is Node.js 18', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs18.x',
    });
  });
});
