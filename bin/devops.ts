#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CicdStack } from '../lib/cicd-stack';
import { CicdProps } from '../lib/utils';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { Signals } from '@aws-cdk/aws-autoscaling';
import { Duration } from '@aws-cdk/core';
import { AmazonLinuxEdition, AmazonLinuxGeneration } from '@aws-cdk/aws-ec2';

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

new CicdStack(app, 'cicd-stack', properties);


