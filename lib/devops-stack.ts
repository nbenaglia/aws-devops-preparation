import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { MyProps } from './utils';
import { Tags } from '@aws-cdk/core';

export class DevopsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);

    // EC2
    const ec2Role = new iam.Role(this, 'ec2-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    ec2Role.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${props.bucketName}/*`],
      actions: ['s3:GetObject', 's3:PutObject'],
    }));

    let ec2SecurityGroup = new ec2.SecurityGroup(this, 'ec2-sg', {
      allowAllOutbound: true,
      securityGroupName: "ec2-sg",
      vpc: ec2.Vpc.fromLookup(this, "my-sg-vpc", { vpcId: props.vpcId })
    })

    // SG-SSH
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "SSH",
        protocol: ec2.Protocol.TCP,
        fromPort: 22,
        toPort: 22
      }));

    // SG-HTTP
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "HTTP",
        protocol: ec2.Protocol.TCP,
        fromPort: 80,
        toPort: 80
      }));

    // CODEDEPLOY
    const codedeployRole = new iam.Role(this, 'codedeploy-role', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });

    codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${props.bucketName}/*`],
      actions: ['s3:PutObject'],
    }));

    // S3 BUCKET
    const bucket = new s3.Bucket(this, 'nbenaglia-bucket', {
      encryption: s3.BucketEncryption.UNENCRYPTED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: true
    });

    // CODECOMMIT REPOSITORY
    const repository = new codecommit.Repository(this, `${props.repositoryName}-repository`, {
      repositoryName: `${props.repositoryName}`,
      description: 'First repository with CDK codecommit.'
    });

    const ec2TestASG = new autoscaling.AutoScalingGroup(this, 'ec2-test', {
      autoScalingGroupName: 'test-asg',
      desiredCapacity: 2,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      minCapacity: 1,
      maxCapacity: 3,
      role: ec2Role,
      securityGroup: ec2SecurityGroup,
      vpc: ec2.Vpc.fromLookup(this, "my-autoscaling-vpc", { vpcId: props.vpcId }),
    });
    Tags.of(ec2TestASG).add('Name', 'ec2-test');
    Tags.of(ec2TestASG).add('Environment', 'test');

    const ec2ProdASG = new autoscaling.AutoScalingGroup(this, 'ec2-prod', {
      autoScalingGroupName: 'prod-asg',
      desiredCapacity: 1,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      minCapacity: 1,
      maxCapacity: 5,
      role: ec2Role,
      securityGroup: ec2SecurityGroup,
      vpc: ec2.Vpc.fromLookup(this, "my-vpc", { vpcId: props.vpcId }),
    });
    Tags.of(ec2ProdASG).add('Name', 'ec2-prod');
    Tags.of(ec2ProdASG).add('Environment', 'prod');
  }
}