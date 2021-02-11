import * as cdk from '@aws-cdk/core';

export interface MyProps extends cdk.StackProps {
  availabilityZone: string
  bucketName: string
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