import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as ec2 from '@aws-cdk/aws-ec2';
import { MyProps } from './utils';
import { Tags } from '@aws-cdk/core';

export class AutoscalingStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);

    const ec2TestASG = new autoscaling.AutoScalingGroup(this, 'ec2-test', {
      vpc: ec2.Vpc.fromLookup(this, "my-vpc", { vpcId: props.vpcId }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      minCapacity: 1,
      maxCapacity: 3,
      desiredCapacity: 2,
    });
    Tags.of(ec2TestASG).add('Name', 'ec2-test');
    Tags.of(ec2TestASG).add('Environment', 'test');

    const ec2ProdASG = new autoscaling.AutoScalingGroup(this, 'ec2-prod', {
      vpc: ec2.Vpc.fromLookup(this, "my-vpc", { vpcId: props.vpcId }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      minCapacity: 1,
      maxCapacity: 5,
      desiredCapacity: 1
    });
    Tags.of(ec2ProdASG).add('Name', 'ec2-prod');
    Tags.of(ec2ProdASG).add('Environment', 'prod');
  }
}