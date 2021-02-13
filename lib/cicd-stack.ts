import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as logs from '@aws-cdk/aws-logs';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codedeploy from '@aws-cdk/aws-codedeploy';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { AsgCapacity, CicdProps } from './utils';
import { Duration, RemovalPolicy, Tags } from '@aws-cdk/core';
import { Signals } from '@aws-cdk/aws-autoscaling';
import { AmazonLinuxEdition, AmazonLinuxGeneration } from '@aws-cdk/aws-ec2';
import { ComputeType, LinuxBuildImage } from '@aws-cdk/aws-codebuild';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { MinimumHealthyHosts } from '@aws-cdk/aws-codedeploy';
import { getS3Policy, getSsmPolicy } from './inline-policies';

export class CicdStack extends cdk.Stack {
  ec2Role: iam.Role
  ec2InstanceProfile: iam.CfnInstanceProfile
  codebuildRole: iam.Role
  codedeployRole: iam.Role
  codedeployApplication: codedeploy.ServerApplication
  ec2SecurityGroup: ec2.SecurityGroup
  bucket: s3.Bucket
  repository: codecommit.Repository
  props: CicdProps
  prodAsg: autoscaling.AutoScalingGroup
  testAsg: autoscaling.AutoScalingGroup

  constructor(scope: cdk.Construct, id: string, props: CicdProps) {
    super(scope, id, props);
    this.props = props

    this.createRoles()
    this.createSecurityGroups()
    this.createBucket()
    this.createCodecommitRepository()

    this.createCodebuild()

    // codedeploy
    this.testAsg = this.createAutoscalingGroups('test', { desiredCapacity: 2, minCapacity: 1, maxCapacity: 3 })
    this.prodAsg = this.createAutoscalingGroups('prod', { desiredCapacity: 1, minCapacity: 1, maxCapacity: 4 })
    this.createCodedeployApplication()
    this.createCodedeployDeploymentGroup([this.testAsg], 'test')
    this.createCodedeployDeploymentGroup([this.prodAsg], 'prod')
    // this.createCodedeployDeploymentConfig()

    // this.createCodepipeline()
  }

  // CODECOMMIT REPOSITORY
  createCodecommitRepository() {
    this.repository = new codecommit.Repository(this, `${this.props.repositoryName}-repository`, {
      repositoryName: `${this.props.repositoryName}`,
      description: 'First repository with CDK codecommit.'
    });
  }

  // ROLES
  createRoles() {
    // EC2
    this.ec2Role = new iam.Role(this, 'ec2-role', {
      roleName: 'ec2Role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    this.ec2Role.attachInlinePolicy(getS3Policy(this, 's3-ec2', this.props));
    this.ec2Role.attachInlinePolicy(getSsmPolicy(this, 'ssm-ec2', this.props));

    // CODEBUILD ROLE
    this.codebuildRole = new iam.Role(this, 'codebuild-role', {
      roleName: 'codebuildRole',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    this.codebuildRole.attachInlinePolicy(getSsmPolicy(this, 'ssm-codebuildRole', this.props));
    this.codebuildRole.attachInlinePolicy(getS3Policy(this, 's3-codebuildRole', this.props));

    // CODEDEPLOY ROLE
    this.codedeployRole = new iam.Role(this, 'codedeploy-role', {
      roleName: 'codedeployRole',
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });
    this.codedeployRole.attachInlinePolicy(getSsmPolicy(this, 'ssm-codedeployRole', this.props));
    this.codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:aws:s3:::${this.props.bucketName}/*`],
      actions: ['s3:GetObject'],
    }));
    this.codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        'autoscaling:Describe*',
        'autoscaling:CompleteLifecycleAction'
      ],
    }));
  }

  // S3 BUCKET
  createBucket() {
    this.bucket = new s3.Bucket(this, `${this.props.bucketName}-bucket`, {
      autoDeleteObjects: true,
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
      },
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
  createAutoscalingGroups(environment: string, capacity: AsgCapacity): autoscaling.AutoScalingGroup {
    let asg = new autoscaling.AutoScalingGroup(this, `ec2-${environment}`, {
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
    Tags.of(asg).add('Name', `asg-${environment}`);
    Tags.of(asg).add('Environment', `${environment}`);

    return asg
  }

  // CODEDEPLOY PROJECT
  createCodedeployApplication() {
    this.codedeployApplication = new codedeploy.ServerApplication(this, 'codedeploy-application', {
      applicationName: 'MyApplication',
    });
  }

  createCodedeployDeploymentGroup(autoScalingGroups: autoscaling.AutoScalingGroup[], environment: string) {
    const deploymentGroup = new codedeploy.ServerDeploymentGroup(this, `${environment}-deployment-group`, {
      application: this.codedeployApplication,
      autoScalingGroups: autoScalingGroups,
      deploymentGroupName: `${environment}DeploymentGroup`,
      deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
      installAgent: true,
      ec2InstanceTags: new codedeploy.InstanceTagSet({ 'Environment': [`${environment}`] }),
      // CloudWatch alarms
      // alarms: [
      //   new cloudwatch.Alarm(this, 'error-alarm', {
      //     comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      //     threshold: 1,
      //     evaluationPeriods: 1,
      //     metric: alias.metricErrors()
      //   })
      // ],
      // whether to ignore failure to fetch the status of alarms from CloudWatch
      // default: false
      ignorePollAlarmsFailure: false,
      // auto-rollback configurationTagging your instances enables you to see instance cost allocation b
      role: this.codedeployRole,
      autoRollback: {
        failedDeployment: true, // default: true
        stoppedDeployment: true, // default: false
        deploymentInAlarm: false, // default: true if you provided any alarms, false otherwise
      },
    });
  }

  // Add a deplomentConfig to the three canonical ones: ONE_AT_A_TIME, HALF_AT_A_TIME, ALL_AT_ONCE
  createCodedeployDeploymentConfig() {
    const deploymentConfig = new codedeploy.ServerDeploymentConfig(this, 'DeploymentConfiguration', {
      deploymentConfigName: 'MyDeploymentConfiguration', // optional property
      // one of these is required, but both cannot be specified at the same time
      minimumHealthyHosts: MinimumHealthyHosts.count(1),
      // minHealthyHostPercentage: 75,
    });
  }

  // CODEPIPELINE PROJECT
  createCodepipeline() {

  }
}