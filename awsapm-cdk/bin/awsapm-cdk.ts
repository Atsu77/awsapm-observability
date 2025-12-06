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
