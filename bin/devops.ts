#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { S3Stack } from '../lib/s3-stack';
import { CodeCommitStack } from '../lib/codecommit-stack';
import { IamStack } from '../lib/iam-stack';

const myEnvironment: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
}

const app = new cdk.App();

// Creation of several stacks
const iam = new IamStack(app, 'iam-stack', { env: myEnvironment });
const s3 = new S3Stack(app, 's3-stack', { env: myEnvironment });
const comecommit = new CodeCommitStack(app, 'codecommit-stack', { env: myEnvironment });
