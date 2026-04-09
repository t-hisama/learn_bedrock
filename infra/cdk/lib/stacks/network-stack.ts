import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * ネットワーク基盤スタック。
 *
 * - VPC (2AZ, パブリック/プライベート/アイソレーテッドサブネット)
 * - VPC Endpoints (S3, DynamoDB, Bedrock Runtime) でNATコストを削減
 * - VPC Flow Logs で通信監査
 *
 * KDDI要件対応: VPC、セキュリティグループ、セグメンテーション設計
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1, // コスト削減: 本番では2を推奨
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
    });

    // VPC Flow Logs (セキュリティ監査用)
    const flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.REJECT, // 拒否されたトラフィックのみ記録
    });

    // Lambda用セキュリティグループ (アウトバウンドはVPC Endpoint経由のみ)
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: false,
    });
    this.lambdaSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS outbound for AWS API calls',
    );

    // Gateway型VPC Endpoint (無料)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Interface型VPC Endpoint - Bedrock Runtime (ap-northeast-1)
    // Lambda → NAT → Bedrock のコストを回避
    this.vpc.addInterfaceEndpoint('BedrockRuntimeEndpoint', {
      service: new ec2.InterfaceVpcEndpointService(
        `com.amazonaws.${this.region}.bedrock-runtime`,
        443,
      ),
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
  }
}
