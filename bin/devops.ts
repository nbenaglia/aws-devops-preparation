#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { S3Stack } from '../lib/s3-stack';
import { CodeCommitStack } from '../lib/codecommit-stack';
import { IamStack } from '../lib/iam-stack';
import { MyProps } from '../lib/utils';
import { AutoscalingStack } from '../lib/autoscaling-stack';

// Set properties for stacks
let properties: MyProps = {
  availabilityZone: 'eu-west-1a',
  bucketName: 'nbenaglia',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  key: 'aws_nicola',
  repositoryName: 'nbenaglia',
  securityGroupSourceCIDR: '0.0.0.0/0',
  subnetId: 'subnet-6a35190c',
  vpcId: 'vpc-5e2fdc27'
}

const app = new cdk.App();

// Creation of several stacks
const iam = new IamStack(app, 'iam-stack', properties);
const s3 = new S3Stack(app, 's3-stack', properties);
const comecommit = new CodeCommitStack(app, 'codecommit-stack', properties);
const autoscalingGroups = new AutoscalingStack(app, 'autoscaling-stack', properties)
