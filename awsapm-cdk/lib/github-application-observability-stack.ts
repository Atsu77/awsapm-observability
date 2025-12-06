import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class GitHubApplicationObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // GitHub 情報を CDK コンテキストから取得
    const githubOrg = this.node.tryGetContext('githubOrg') as string;
    const githubRepo = this.node.tryGetContext('githubRepo') as string;
    const githubBranch = this.node.tryGetContext('githubBranch') as string;

    if (!githubOrg || !githubRepo || !githubBranch) {
      throw new Error('githubOrg, githubRepo, githubBranch のコンテキストを cdk.json に設定してください');
    }

    // GitHub Actions 用の OpenID Connect プロバイダ
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com']
    });

    // GitHub Actions から Assume される IAM ロール
    const githubRole = new iam.Role(this, 'GitHubApplicationObservabilityRole', {
      roleName: 'GitHubApplicationObservabilityRole',
      description: 'IAM role for GitHub Actions to access CloudWatch Application Signals',
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        'StringEquals': {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`
        }
      })
    });

    // CloudWatch Application Signals や関連リソース参照に必要な権限
    githubRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'application-signals:ListServices',
          'application-signals:GetService',
          'application-signals:ListServiceOperations',
          'application-signals:ListServiceLevelObjectives',
          'application-signals:GetServiceLevelObjective',
          'application-signals:ListAuditFindings',
          'cloudwatch:DescribeAlarms',
          'cloudwatch:DescribeAlarmHistory',
          'cloudwatch:ListMetrics',
          'cloudwatch:GetMetricData',
          'cloudwatch:GetMetricStatistics',
          'logs:DescribeLogGroups',
          'logs:DescribeQueryDefinitions',
          'logs:ListLogAnomalyDetectors',
          'logs:ListAnomalies',
          'logs:StartQuery',
          'logs:StopQuery',
          'logs:GetQueryResults',
          'logs:FilterLogEvents',
          'xray:GetTraceSummaries',
          'xray:GetTraceSegmentDestination',
          'xray:BatchGetTraces',
          'xray:ListRetrievedTraces',
          'xray:StartTraceRetrieval',
          'servicequotas:GetServiceQuota',
          'synthetics:GetCanary',
          'synthetics:GetCanaryRuns',
          's3:GetObject',
          's3:ListBucket',
          'iam:GetRole',
          'iam:ListAttachedRolePolicies',
          'iam:GetPolicy',
          'iam:GetPolicyVersion',
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream'
        ],
        resources: ['*']
      })
    );

    // GitHub に設定するためのロール ARN を出力
    new cdk.CfnOutput(this, 'GitHubRoleArn', {
      value: githubRole.roleArn,
      exportName: 'GitHubApplicationObservabilityRoleArn'
    });
  }
}
