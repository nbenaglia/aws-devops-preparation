#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CicdStack } from '../lib/cicd-stack';
import { CicdProps, DeploymentType } from '../lib/utils';

// Set properties for stacks
let properties: CicdProps = {
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

// Choose ECS, SERVER or LAMBDA
properties.deploymentType = DeploymentType.ECS
new CicdStack(app, 'cicd-stack', properties);


