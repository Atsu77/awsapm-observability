私の目的はこのハンズオンを実行し、技術に対する理解を深めることです。
必要があれば↓のドキュメントを最初に読み込んでください。
https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Service-Application-Observability-for-AWS-GitHub-Action.html

# CloudWatch Application Signals GitHub Action ハンズオン（CDK TypeScript 版）


## 目次

1. [このハンズオンで学べること](#1-このハンズオンで学べること)
2. [準備](#2-準備)
3. [やってみる](#3-やってみる)
4. [次のステップ](#4-次のステップ)

---

## 1. このハンズオンで学べること

このハンズオンでは、CloudWatch Application Signals と GitHub Actions を連携するための **IAM OIDC 連携設定を CDK TypeScript でコード化**します。
AWS コンソールを触らずに、CDK スタックをデプロイするだけで GitHub Actions から AWS に安全にアクセスできるロールを作成し、CloudWatch Application Signals のメトリクスやトレースを参照する基盤を構築します。
所要時間は一〇分から一五分程度を想定しています。

---

## 2. 準備

### 2.1 前提知識

* TypeScript の基本的な文法が分かること
* AWS CDK v2 の基本操作が分かること
  `cdk init` `cdk synth` `cdk deploy` を実行できる程度
* GitHub リポジトリの作成と Actions の有効化ができること

### 2.2 必要なもの

* AWS アカウント

  * CloudWatch Application Signals が有効なリージョン
  * ここでは例として `us-east-1` を使用します
* ローカル開発環境

  * Node.js 一八系以上
  * npm または pnpm
  * AWS CDK v2

    * インストール例

      ```bash
      npm install -g aws-cdk@2
      ```
  * AWS CLI で認証済みプロファイル
    `aws sts get-caller-identity` が成功する状態
* GitHub アカウント

  * 対象となるリポジトリ一つ

### 2.3 作業ディレクトリと構成

任意の空ディレクトリで次の構成を作成します。

```text
awsapm-cdk/
  bin/
    awsapm-cdk.ts
  lib/
    github-application-observability-stack.ts
  cdk.json
  package.json
  tsconfig.json
  .gitignore
```

このうち `lib/github-application-observability-stack.ts` と `cdk.json` を編集していきます。

---

## 3. やってみる

### 3.1 Step1: CDK プロジェクトの作成

1. 作業用ディレクトリを作成して移動します。

   ```bash
   mkdir awsapm-cdk
   cd awsapm-cdk
   ```
2. TypeScript の CDK アプリケーションを初期化します。

   ```bash
   cdk init app --language typescript
   ```
3. 依存パッケージをインストールします。

   ```bash
   npm install
   ```

ここまでで CDK プロジェクトのひな型が作成されます。

---

### 3.2 Step2: GitHub 用 OIDC プロバイダと IAM ロールを CDK で定義する

#### 3.2.1 CDK コンテキストに GitHub 情報を設定

`cdk.json` を開き、`context` セクションに GitHub 情報を追加します。

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/awsapm-cdk.ts",
  "context": {
    "githubOrg": "your-github-org-or-user",
    "githubRepo": "your-repository-name",
    "githubBranch": "main"
  }
}
```

* `your-github-org-or-user` は GitHub のユーザー名または組織名
* `your-repository-name` は対象リポジトリ名
* `githubBranch` は GitHub Actions を動かすブランチ名

このコンテキスト値を CDK スタック内から参照します。

#### 3.2.2 スタックファイルの実装

`lib/github-application-observability-stack.ts` を次の内容で作成または置き換えます。

```typescript
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
      description: 'GitHub Actions が CloudWatch Application Signals を参照するためのロール',
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`
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
```

**観察ポイント**

* OpenIdConnectProvider と Role をコードで定義することで、コンソールでのクリック操作をすべてコード化しています。
* `sub` 条件に `repo:org/repo:ref:refs/heads/branch` を指定することで、特定リポジトリとブランチに限定した安全な OIDC 連携を実現しています。
* PolicyStatement には CloudWatch Application Signals ハンズオンに必要な読み取り系アクションのみを付与しています。

#### 3.2.3 エントリーポイントのスタック名を修正

`bin/awsapm-cdk.ts` を開き、スタッククラス名を合わせます。

```typescript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GitHubApplicationObservabilityStack } from '../lib/github-application-observability-stack';

const app = new cdk.App();
new GitHubApplicationObservabilityStack(app, 'GitHubApplicationObservabilityStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
```

---

### 3.3 Step3: CDK でスタックをデプロイする

1. TypeScript をビルドします。

   ```bash
   npm run build
   ```
2. 初回のみ、CDK のブートストラップを実行します。

   ```bash
   cdk bootstrap
   ```
3. スタックをデプロイします。

   ```bash
   cdk deploy
   ```

プロンプトが出たら `y` を入力してデプロイを許可します。
デプロイ完了時に `GitHubRoleArn` の値が表示されます。これが GitHub Actions から Assume するロールの ARN です。

**観察ポイント**

* コンソールを一切開かずに、OIDC プロバイダと IAM ロールが作成されました。
* CDK によって同じ構成を再現可能な形で管理できることが、ドキュメントの「インフラのコード化」の考え方に対応しています。

---

### 3.4 Step4: GitHub 側でロールを使ってみる

ここでは GitHub Actions の最小構成だけを扱い、Application Signals GitHub Action の連携部分が動く状態を作ります。

#### 3.4.1 GitHub シークレットと変数

1. 対象リポジトリの Settings を開きます。
2. Secrets and variables の Actions を選択します。
3. New repository secret から次を登録します。

   * Name: `AWS_IAM_ROLE_ARN`
   * Value: CDK 出力の `GitHubRoleArn`
4. Repository variables から次を登録します。

   * Name: `AWS_REGION`
   * Value: `us-east-1` など Application Signals のリージョン

#### 3.4.2 ワークフローファイルの作成

リポジトリ直下に `.github/workflows/awsapm-observability.yml` を作成し、次の内容を保存します。

```yaml
name: Application observability for AWS

on:
  issue_comment:
    types: [created]

jobs:
  awsapm-investigation:
    if: contains(github.event.comment.body, '@awsapm')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_IAM_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION || 'us-east-1' }}

      - name: Prepare Investigation Context
        id: prepare
        uses: aws-actions/application-observability-for-aws@v1
        with:
          bot_name: "@awsapm"
          cli_tool: "claude_code"

      - name: Run Claude Investigation
        id: claude
        uses: anthropics/claude-code-base-action@beta
        with:
          use_bedrock: "true"
          model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
          prompt_file: ${{ steps.prepare.outputs.prompt_file }}
          mcp_config: ${{ steps.prepare.outputs.mcp_config_file }}
          allowed_tools: ${{ steps.prepare.outputs.allowed_tools }}

      - name: Post Investigation Results
        if: always()
        uses: aws-actions/application-observability-for-aws@v1
        with:
          cli_tool: "claude_code"
          comment_id: ${{ steps.prepare.outputs.awsapm_comment_id }}
          output_file: ${{ steps.claude.outputs.execution_file }}
          output_status: ${{ steps.claude.outputs.conclusion }}
```

#### 3.4.3 実際にトリガーしてみる

1. GitHub リポジトリの Issues で任意の Issue を作成します。
2. その Issue にコメントとして次のように投稿します。

   ```text
   @awsapm 本番サービスのレイテンシが悪化していないか確認してください。
   ```
3. Actions タブでワークフローが起動していることを確認し、完了後に Issue に自動コメントが追加されているかを確認します。

**観察ポイント**
この段階で、

* AWS 側の全設定は CDK TypeScript で管理されていること
* GitHub からのコメント一つで Application Signals と AI による調査が走ること
  を体験できます。
  CDK のコードを修正し再デプロイすることで、ポリシーや条件をバージョン管理しながら改善できる点が、この機能の設計思想に合致しています。

---

## 4. 次のステップ

* このハンズオンでは Application Signals 自体の定義や SLO 設定の CDK 化は省略しました。実運用では次のような発展が考えられます。

  * Observability 用リソース一式を別スタックで管理し、サービスごとの SLO を CDK で定義する。
  * 環境ごとに異なる GitHub ブランチやロールを用意し、本番とステージングを分離する。
  * Application Signals のメトリクスやトレースを追加で活用し、デプロイ前後の自動比較チェックを組み込む。

元ドキュメントの CloudWatch Application Signals GitHub Action 解説や AWS 公式ブログを併読すると、今回の最小構成を足場に、組織全体の運用と開発フローにどのように組み込めるかのイメージを広げられます。

