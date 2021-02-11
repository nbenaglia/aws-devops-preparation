import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as logs from '@aws-cdk/aws-logs';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { AsgCapacity, MyProps } from './utils';
import { Duration, RemovalPolicy, Tags } from '@aws-cdk/core';
import { Signals } from '@aws-cdk/aws-autoscaling';
import { AmazonLinuxEdition, AmazonLinuxGeneration, MachineImage } from '@aws-cdk/aws-ec2';
import { ComputeType, LinuxBuildImage } from '@aws-cdk/aws-codebuild';
import { RetentionDays } from '@aws-cdk/aws-logs';

export class DevopsStack extends cdk.Stack {
  ec2Role: iam.Role
  codebuildRole: iam.Role
  codedeployRole: iam.Role
  ec2SecurityGroup: ec2.SecurityGroup
  bucket: s3.Bucket
  repository: codecommit.Repository
  props: MyProps

  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);
    this.props = props

    this.createRoles()
    this.createSecurityGroups()
    this.createBucket()
    this.createRepository()
    this.createAutoscalingGroups('test', { desiredCapacity: 2, minCapacity: 1, maxCapacity: 3 })
    this.createAutoscalingGroups('prod', { desiredCapacity: 1, minCapacity: 1, maxCapacity: 4 })
    this.createCodebuild()
    this.createCodedeploy()
    this.createCodepipeline()
  }

  // CODECOMMIT REPOSITORY
  createRepository() {
    this.repository = new codecommit.Repository(this, `${this.props.repositoryName}-repository`, {
      repositoryName: `${this.props.repositoryName}`,
      description: 'First repository with CDK codecommit.'
    });
  }

  // ROLES
  createRoles() {
    // EC2
    const ec2Role = new iam.Role(this, 'ec2-role', {
      roleName: 'ec2Role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    ec2Role.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${this.props.bucketName}/*`],
      actions: ['s3:GetObject', 's3:PutObject'],
    }));

    // CODEBUILD ROLE
    const codebuildRole = new iam.Role(this, 'codebuild-role', {
      roleName: 'codebuildRole',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${this.props.bucketName}/*`],
      actions: ['s3:GetObject', 's3:PutObject'],
    }));

    // CODEDEPLOY ROLE
    const codedeployRole = new iam.Role(this, 'codedeploy-role', {
      roleName: 'codedeployRole',
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });

    codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${this.props.bucketName}/*`],
      actions: ['s3:GetObject'],
    }));
  }

  // S3 BUCKET
  createBucket() {
    this.bucket = new s3.Bucket(this, 'nbenaglia-bucket', {
      autoDeleteObjects: true,
      bucketName: this.props.bucketName,
      encryption: s3.BucketEncryption.UNENCRYPTED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: false
    });
  }

  // SECURITY GROUPS
  createSecurityGroups() {
    this.ec2SecurityGroup = new ec2.SecurityGroup(this, 'ec2-sg', {
      allowAllOutbound: true,
      securityGroupName: "ec2-sg",
      vpc: ec2.Vpc.fromLookup(this, "my-sg-vpc", { vpcId: this.props.vpcId })
    })

    // SG-SSH
    this.ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "SSH",
        protocol: ec2.Protocol.TCP,
        fromPort: 22,
        toPort: 22
      }));

    // SG-HTTP
    this.ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "HTTP",
        protocol: ec2.Protocol.TCP,
        fromPort: 80,
        toPort: 80
      }));
  }

  // CODEBUILD PROJECT
  createCodebuild() {
    new codebuild.Project(this, 'MyFirstCodeCommitProject', {
      artifacts: codebuild.Artifacts.s3({
        bucket: this.bucket,
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
      role: this.codebuildRole,
      source: codebuild.Source.codeCommit({
        repository: this.repository
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
  }

  // AUTOSCALING GROUPS
  createAutoscalingGroups(environment: string, capacity: AsgCapacity) {
    const ec2TestASG = new autoscaling.AutoScalingGroup(this, `ec2-${environment}`, {
      autoScalingGroupName: `asg-${environment}`,
      desiredCapacity: capacity.desiredCapacity,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['install', 'amazon_ssm_agent'],
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
        configSets: ['default'],
        embedFingerprint: false,
      },
      signals: Signals.waitForAll({ timeout: Duration.minutes(10) }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      keyName: this.props.key,
      machineImage: new ec2.AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: AmazonLinuxEdition.STANDARD
      }),
      minCapacity: capacity.minCapacity,
      maxCapacity: capacity.maxCapacity,
      role: this.ec2Role,
      securityGroup: this.ec2SecurityGroup,
      vpc: ec2.Vpc.fromLookup(this, `autoscaling-vpc-${environment}`, { vpcId: this.props.vpcId }),
    });
    Tags.of(ec2TestASG).add('Name', `test-${environment}`);
    Tags.of(ec2TestASG).add('Environment', `${environment}`);
  }

  // CODEDEPLOY PROJECT
  createCodedeploy() {

  }


  // CODEPIPELINE PROJECT
  createCodepipeline() {

  }
}