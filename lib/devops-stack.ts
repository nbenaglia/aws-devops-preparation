import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as logs from '@aws-cdk/aws-logs';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { MyProps } from './utils';
import { Duration, RemovalPolicy, Tags } from '@aws-cdk/core';
import { Signals } from '@aws-cdk/aws-autoscaling';
import { AmazonLinuxEdition, AmazonLinuxGeneration, MachineImage } from '@aws-cdk/aws-ec2';
import { ComputeType, LinuxBuildImage } from '@aws-cdk/aws-codebuild';
import { RetentionDays } from '@aws-cdk/aws-logs';

export class DevopsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);

    ////////////////////
    //    ROLES       //
    ////////////////////

    // EC2
    const ec2Role = new iam.Role(this, 'ec2-role', {
      roleName: 'ec2Role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    ec2Role.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${props.bucketName}/*`],
      actions: ['s3:GetObject', 's3:PutObject'],
    }));

    // CODEBUILD ROLE
    const codebuildRole = new iam.Role(this, 'codebuild-role', {
      roleName: 'codebuildRole',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${props.bucketName}/*`],
      actions: ['s3:GetObject', 's3:PutObject'],
    }));

    // CODEDEPLOY ROLE
    const codedeployRole = new iam.Role(this, 'codedeploy-role', {
      roleName: 'codedeployRole',
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });

    codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${props.bucketName}/*`],
      actions: ['s3:GetObject'],
    }));


    ////////////////////////////
    //    SECURITY GROUPS     //
    ////////////////////////////
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

    //////////////////////
    //    RESOURCES     //
    //////////////////////    

    // S3 BUCKET
    const bucket = new s3.Bucket(this, 'nbenaglia-bucket', {
      autoDeleteObjects: true,
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.UNENCRYPTED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: true
    });

    // CODECOMMIT REPOSITORY
    const repository = new codecommit.Repository(this, `${props.repositoryName}-repository`, {
      repositoryName: `${props.repositoryName}`,
      description: 'First repository with CDK codecommit.'
    });

    // CODEBUILD PROJECT
    new codebuild.Project(this, 'MyFirstCodeCommitProject', {
      artifacts: codebuild.Artifacts.s3({
        bucket,
        name: 'myArtifact.zip',
        includeBuildId: true,
        packageZip: true,
        path: 'mycodebuild',
      }),
      description: 'This is my first codebuild project',
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_3,
        computeType: ComputeType.SMALL,
      },
      projectName: 'myFirstCodeCommitProject',
      role: codebuildRole,
      source: codebuild.Source.codeCommit({
        repository
      }),
      logging: {
        cloudWatch: {
          enabled: true,
          prefix: 'myCodebuild',
          logGroup: new logs.LogGroup(this, `codebuild-loggroup`, {
            logGroupName: 'myCodebuild',
            retention: RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY
          }),
        }
      }
    });

    // AUTOSCALING GROUPS
    const ec2TestASG = new autoscaling.AutoScalingGroup(this, 'ec2-test', {
      autoScalingGroupName: 'test-asg',
      desiredCapacity: 2,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          test: ['install', 'amazon_ssm_agent'],
        },
        configs: {
          install: new ec2.InitConfig([
            ec2.InitPackage.rpm('https://s3.region.amazonaws.com/amazon-ssm-region/latest/linux_amd64/amazon-ssm-agent.rpm'),
          ]),
          amazon_ssm_agent: new ec2.InitConfig([
            ec2.InitService.enable('amazon-ssm-agent', {
              enabled: true,
              ensureRunning: true,
            })
          ])
        }
      }),
      initOptions: {
        configSets: ['test'],
        embedFingerprint: false,
      },
      signals: Signals.waitForAll({ timeout: Duration.minutes(10) }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      keyName: props.key,
      machineImage: new ec2.AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: AmazonLinuxEdition.STANDARD
      }),
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
      keyName: props.key,
      machineImage: new ec2.AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: AmazonLinuxEdition.STANDARD
      }),
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