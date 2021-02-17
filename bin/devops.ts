#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CicdProps, DeploymentType } from '../lib/utils';
import { Ec2CicdStack } from '../lib/ec2-cicd-stack';
import { EcsCicdStack } from '../lib/ecs-cicd-stack';

// Set properties for stacks
let properties: CicdProps = {
  availabilityZone: 'eu-west-1a',
  bucketName: 'nbenaglia',
  deploymentType: DeploymentType.ECS, // Choose ECS, SERVER or LAMBDA
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

switch (properties.deploymentType) {
  case DeploymentType.SERVER:
    new Ec2CicdStack(app, 'ec2-cicd-stack', properties);
    break;

  case DeploymentType.ECS:
    new EcsCicdStack(app, 'ecs-cicd-stack', properties);
    break;

  default:
    throw new Error(`Unsupported value in Enum`);
}


