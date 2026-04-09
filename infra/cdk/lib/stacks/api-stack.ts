import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  todoLambda: lambda.IFunction;
  todoTable: dynamodb.Table;
  userPool: cognito.UserPool;
  /** Bedrock RAG Lambda ARN (AppSync LambdaDataSource用) */
  bedrockRagLambdaArn?: string;
}

/**
 * APIスタック。
 *
 * - REST API Gateway: 既存のTodo CRUD (Cognito JWT認証付き)
 * - AppSync GraphQL API: Subscriptionサポート + Bedrock RAG統合
 *
 * KDDI要件対応: API Gateway, AppSync, セキュリティ要件
 */
export class ApiStack extends cdk.Stack {
  public readonly restApi: apigw.LambdaRestApi;
  public readonly graphqlApi: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // REST API Gateway (Cognito認証付き)
    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        cognitoUserPools: [props.userPool],
      },
    );

    this.restApi = new apigw.LambdaRestApi(this, 'TodoApi', {
      handler: props.todoLambda,
      defaultCorsPreflightOptions: {
        // 本番では具体的なオリジンを指定すること
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
        ],
      },
      defaultMethodOptions: {
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
      },
    });

    // AppSync GraphQL API
    this.graphqlApi = new appsync.GraphqlApi(this, 'GraphqlApi', {
      name: 'PlatformTemplateApi',
      schema: appsync.SchemaFile.fromAsset(
        path.join(__dirname, '../../../../../backend/graphql/schema.graphql'),
      ),
      authorizationConfig: {
        defaultAuthorization: {
          // Cognito認証をデフォルト (APIキーはテスト環境のみ)
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool: props.userPool },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.API_KEY,
            apiKeyConfig: {
              description: 'For local development only',
              expires: cdk.Expiration.after(cdk.Duration.days(365)),
            },
          },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
    });

    // DynamoDB DataSource (Todo CRUD)
    const todoDs = this.graphqlApi.addDynamoDbDataSource('TodoDataSource', props.todoTable);

    // リゾルバー: listTodos
    todoDs.createResolver('ListTodosResolver', {
      typeName: 'Query',
      fieldName: 'listTodos',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(
        path.join(
          __dirname,
          '../../../../../backend/graphql/resolvers/listTodos.request.vtl',
        ),
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromFile(
        path.join(
          __dirname,
          '../../../../../backend/graphql/resolvers/listTodos.response.vtl',
        ),
      ),
    });

    // リゾルバー: createTodo
    todoDs.createResolver('CreateTodoResolver', {
      typeName: 'Mutation',
      fieldName: 'createTodo',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(
        path.join(
          __dirname,
          '../../../../../backend/graphql/resolvers/createTodo.request.vtl',
        ),
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromFile(
        path.join(
          __dirname,
          '../../../../../backend/graphql/resolvers/createTodo.response.vtl',
        ),
      ),
    });

    // Bedrock RAG DataSource (オプション)
    if (props.bedrockRagLambdaArn) {
      const ragLambda = lambda.Function.fromFunctionArn(
        this,
        'BedrockRagLambda',
        props.bedrockRagLambdaArn,
      );
      const ragDs = this.graphqlApi.addLambdaDataSource('BedrockRagDataSource', ragLambda);
      ragDs.createResolver('SearchKnowledgeResolver', {
        typeName: 'Query',
        fieldName: 'searchKnowledge',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    new cdk.CfnOutput(this, 'GraphqlApiUrl', { value: this.graphqlApi.graphqlUrl });
    new cdk.CfnOutput(this, 'RestApiUrl', { value: this.restApi.url });
  }
}
