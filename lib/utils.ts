import * as cdk from '@aws-cdk/core';

export interface CicdProps extends cdk.StackProps {
  availabilityZone: string
  bucketName: string
  deploymentType?: DeploymentType
  env: cdk.Environment
  key: string
  repositoryName: string
  securityGroupSourceCIDR: string
  subnetId: string
  vpcId: string
}

export interface AsgCapacity {
  desiredCapacity: number
  minCapacity: number
  maxCapacity: number
}


export enum DeploymentType {
  SERVER,
  ECS,
  LAMBDA
}