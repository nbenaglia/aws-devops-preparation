#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DevopsStack } from '../lib/devops-stack';
import { MyProps } from '../lib/utils';

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

new DevopsStack(app, 'devops-stack', properties);
