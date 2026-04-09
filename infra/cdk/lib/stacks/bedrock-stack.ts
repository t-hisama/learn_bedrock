import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import { PythonFunction } from '../constructs/python-function';
import * as path from 'path';
import { Construct } from 'constructs';

export interface BedrockStackProps extends cdk.StackProps {
  knowledgeBaseBucket: s3.Bucket;
}

/**
 * Amazon Bedrockスタック。
 *
 * RAG (Retrieval Augmented Generation) システムを構築する。
 * S3のドキュメントをベクトル化してOpenSearch Serverlessに格納し、
 * Claudeモデルで自然言語回答を生成する。
 *
 * アーキテクチャ:
 *   S3 (ドキュメント) → Bedrock Knowledge Base → OpenSearch Serverless (ベクトルDB)
 *   ユーザー質問 → Lambda (RetrieveAndGenerate) → Claude 3 Haiku → 回答+引用
 *
 * ⚠️ コスト注意:
 *   OpenSearch Serverless 最低コスト: 約 $700/月 (OCU x2)
 *   開発時は context に "useBedrock": false を設定してスキップ推奨。
 *
 * ⚠️ 事前準備:
 *   ap-northeast-1 で Claude 3 Haiku のモデルアクセスを有効化すること:
 *   AWS Console → Bedrock → Model access → anthropic.claude-3-haiku...
 *
 * KDDI要件対応: Amazon Bedrock, RAGシステム, 開発者AIアシスタント
 */
export class BedrockStack extends cdk.Stack {
  public readonly ragLambda: import('aws-cdk-lib/aws-lambda').Function;
  public readonly knowledgeBaseId: string;

  constructor(scope: Construct, id: string, props: BedrockStackProps) {
    super(scope, id, props);

    // OpenSearch Serverless コレクション (ベクトルDB)
    // ナレッジベースのEmbeddingを格納する
    const collection = new opensearchserverless.CfnCollection(this, 'VectorCollection', {
      name: 'platform-kb',
      type: 'VECTORSEARCH',
      description: 'Bedrock Knowledge Base用ベクトルコレクション',
    });

    // セキュリティポリシー: 暗号化
    new opensearchserverless.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: 'platform-kb-encryption',
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: ['collection/platform-kb'] }],
        AWSOwnedKey: true,
      }),
    });

    // セキュリティポリシー: ネットワーク (VPCからのアクセスを許可)
    new opensearchserverless.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: 'platform-kb-network',
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            { ResourceType: 'collection', Resource: ['collection/platform-kb'] },
            { ResourceType: 'dashboard', Resource: ['collection/platform-kb'] },
          ],
          AllowFromPublic: true, // 本番ではVPCエンドポイント経由に変更すること
        },
      ]),
    });

    // Bedrock Knowledge Baseサービスロール
    const kbRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Bedrock Knowledge Base',
    });

    props.knowledgeBaseBucket.grantRead(kbRole);

    kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      }),
    );

    kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        ],
      }),
    );

    // Bedrock Knowledge Base
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: 'PlatformKnowledgeBase',
      description: 'Platform Engineering ドキュメントのRAGナレッジベース',
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: collection.attrArn,
          vectorIndexName: 'platform-kb-index',
          fieldMapping: {
            vectorField: 'embedding',
            textField: 'text',
            metadataField: 'metadata',
          },
        },
      },
    });
    this.knowledgeBaseId = knowledgeBase.attrKnowledgeBaseId;

    // S3データソース
    new bedrock.CfnDataSource(this, 'S3DataSource', {
      knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
      name: 'PlatformDocs',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.knowledgeBaseBucket.bucketArn,
          inclusionPrefixes: ['knowledge-base/'],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 10,
          },
        },
      },
    });

    // RAG Lambda (Python) - RetrieveAndGenerate APIを呼び出す
    const ragFunction = new PythonFunction(this, 'RagFunction', {
      codePath: path.join(__dirname, '../../../../../backend/lambda-python/bedrock_rag'),
      handler: 'handler.handler',
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.attrKnowledgeBaseId,
        MODEL_ARN: `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        REGION: this.region,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });
    this.ragLambda = ragFunction.fn;

    ragFunction.fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:RetrieveAndGenerate', 'bedrock:Retrieve', 'bedrock:InvokeModel'],
        resources: [
          knowledgeBase.attrKnowledgeBaseArn,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      }),
    );

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: knowledgeBase.attrKnowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
    });
    new cdk.CfnOutput(this, 'RagLambdaArn', {
      value: ragFunction.fn.functionArn,
      description: 'RAG Lambda ARN (AppSync DataSource用)',
    });
  }
}
