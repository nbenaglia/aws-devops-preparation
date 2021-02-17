import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as logs from '@aws-cdk/aws-logs';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codedeploy from '@aws-cdk/aws-codedeploy';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { AsgCapacity, CicdProps, DeploymentType } from './utils';
import { Duration, RemovalPolicy, Tags } from '@aws-cdk/core';
import { Signals } from '@aws-cdk/aws-autoscaling';
import { AmazonLinuxEdition, AmazonLinuxGeneration } from '@aws-cdk/aws-ec2';
import { ComputeType, LinuxBuildImage } from '@aws-cdk/aws-codebuild';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { MinimumHealthyHosts } from '@aws-cdk/aws-codedeploy';
import { getCodecommitPolicy, getCodedeployPolicy, getCodepipelinePolicy, getS3Policy, getSsmPolicy } from './inline-policies';
import { ContainerImage, NetworkMode } from '@aws-cdk/aws-ecs';
import { Artifact } from '@aws-cdk/aws-codepipeline';

export class EcsCicdStack extends cdk.Stack {
  artifactName: string = 'myArtifact'
  ec2Role: iam.Role
  ec2InstanceProfile: iam.CfnInstanceProfile
  ecrRepository: ecr.Repository
  codecommitRole: iam.Role
  codebuildProject: codebuild.Project
  codebuildRole: iam.Role
  codedeployRole: iam.Role
  codepipelineRole: iam.Role
  codedeployApplication: codedeploy.ServerApplication
  ec2SecurityGroup: ec2.SecurityGroup
  bucket: s3.Bucket
  repository: codecommit.Repository
  props: CicdProps
  prodAsg: autoscaling.AutoScalingGroup
  testAsg: autoscaling.AutoScalingGroup
  prodEcsDeploymentGroup: codedeploy.IEcsDeploymentGroup
  testEcsDeploymentGroup: codedeploy.IEcsDeploymentGroup

  constructor(scope: cdk.Construct, id: string, props: CicdProps) {
    super(scope, id, props);
    this.props = props

    this.createRoles()
    this.createSecurityGroups()
    this.createBucket()
    this.createCodecommitRepository()

    // codebuild
    this.createCodebuild()

    // codedeploy
    this.createCodedeployApplication()
    this.testAsg = this.createAutoscalingGroups('test', { desiredCapacity: 2, minCapacity: 1, maxCapacity: 3 })
    this.prodAsg = this.createAutoscalingGroups('prod', { desiredCapacity: 1, minCapacity: 1, maxCapacity: 4 })
    this.createEcrRepository()
    this.createEcsCluster()
    this.testEcsDeploymentGroup = this.createCodedeployDeploymentGroupForEcs('test')
    this.prodEcsDeploymentGroup = this.createCodedeployDeploymentGroupForEcs('prod')

    // codepipeline
    this.createCodepipeline()
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

    // CODECOMMIT ROLE
    this.codecommitRole = new iam.Role(this, 'codecommit-role', {
      roleName: 'codecommitRole',
      assumedBy: new iam.ServicePrincipal('codecommit.amazonaws.com'),
    });
    this.codecommitRole.attachInlinePolicy(getCodecommitPolicy(this, 'codecommitRole', this.props));

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
    this.codedeployRole.attachInlinePolicy(getCodedeployPolicy(this, 'codedeploy', this.props));

    // CODEPIPELINE ROLE
    this.codepipelineRole = new iam.Role(this, 'codepipeline-role', {
      roleName: 'codepipelineRole',
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });
    this.codepipelineRole.attachInlinePolicy(getCodepipelinePolicy(this, 'codepipeline', this.props));
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
      versioned: true
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
    this.codebuildProject = new codebuild.Project(this, 'codebuild-project', {
      artifacts: codebuild.Artifacts.s3({
        bucket: this.bucket,
        name: this.artifactName,
        includeBuildId: true,
        packageZip: true,
        path: 'mycodebuild',
      }),
      description: 'This is my first codebuild project',
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_3,
        computeType: ComputeType.SMALL,
      },
      projectName: 'codebuild-project',
      role: this.codebuildRole,
      source: codebuild.Source.codeCommit({
        repository: this.repository
      }),
      logging: {
        cloudWatch: {
          enabled: true,
          prefix: 'mycodebuild',
          logGroup: new logs.LogGroup(this, `codebuild-loggroup`, {
            logGroupName: 'mycodebuild',
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
    this.codedeployApplication = new codedeploy.EcsApplication(this, 'codedeploy-application', {
      applicationName: 'MyApplication',
    });
  }

  createCodedeployDeploymentGroupForServer(autoScalingGroups: autoscaling.AutoScalingGroup[], environment: string): codedeploy.IServerDeploymentGroup {
    return new codedeploy.ServerDeploymentGroup(this, `${environment}-deployment-group`, {
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

  createEcrRepository() {
    this.ecrRepository = new ecr.Repository(this, 'ecr-repo', {
      repositoryName: this.props.bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      imageScanOnPush: true
    });
  }

  createEcsCluster() {
    const vpc = ec2.Vpc.fromLookup(this, "my-lb-vpc", { vpcId: this.props.vpcId })

    const lb = new elbv2.ApplicationLoadBalancer(this, 'lb', {
      vpc,
      internetFacing: true,
      securityGroup: this.ec2SecurityGroup
    });

    const listener = lb.addListener('Listener', {
      port: 80,

      // 'open: true' is the default, you can leave it out if you want. Set it
      // to 'false' and use `listener.connections` if you want to be selective
      // about who can access the load balancer.
      open: false,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'tg-group', {
      vpc,
      port: 80,
      targetGroupName: 'name',
      targetType: elbv2.TargetType.INSTANCE,
    });

    listener.addAction('default', {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/']),
      ],
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: elbv2.ContentType.TEXT_PLAIN,
        messageBody: 'OK',
      })
    });

    listener.addTargetGroups('ecs-service-targe', {
      targetGroups: [targetGroup],
    });

    const cluster = new ecs.Cluster(this, 'ecs-cluster', {
      vpc
    });

    cluster.addCapacity('bottlerocket-asg', {
      minCapacity: 2,
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImageType: ecs.MachineImageType.BOTTLEROCKET,
    });

    const taskDefinition = new ecs.TaskDefinition(this, 'task-definition', {
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
      cpu: '256',
      executionRole: this.ec2Role,
      family: 'my-task-family',
      networkMode: NetworkMode.AWS_VPC,
      memoryMiB: '512',
      taskRole: this.ec2Role,
    });
    taskDefinition.addContainer('my-container', {
      image: ContainerImage.fromEcrRepository(this.ecrRepository),
      memoryReservationMiB: 500
    })

    const service = new ecs.Ec2Service(this, 'Service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      securityGroup: this.ec2SecurityGroup
    });

    const scaling = service.autoScaleTaskCount({ maxCapacity: 10 });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50
    });

    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 10000,
      targetGroup: listener.addTargets('lb-target', {
        port: 80,
      })
    })
  }

  createCodedeployDeploymentGroupForEcs(environment: string): codedeploy.IEcsDeploymentGroup {
    return codedeploy.EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(this, `${environment}-deployment-group`, {
      application: this.codedeployApplication,
      deploymentGroupName: `${environment}DeploymentGroup`,
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE,
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
    // Artifacts
    const sourceArtifact = new codepipeline.Artifact(this.artifactName);
    const buildArtifact = new codepipeline.Artifact();
    const appspecArtifact = new Artifact('appspec-template')
    const taskDefinitionArtifact = new Artifact('ecs-task-definition')

    const pipeline = new codepipeline.Pipeline(this, 'first-pipeline', {
      artifactBucket: this.bucket,
      pipelineName: 'MyPipeline',
      crossAccountKeys: false,  // if true, KMS Customer Master Keys are created which have a cost of $1/month
      role: this.codepipelineRole,
      // stages: [    // or use .addStage method
      //   {
      //     stageName: 'Source',
      //     actions: [
      //       // see below...
      //     ],
      //   },
      // ],
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'CodeCommitSource',
          branch: 'master',
          output: sourceArtifact,
          repository: this.repository,
        })],
      // placement: {
      //   // note: you can only specify one of the below properties
      //   rightBefore: anotherStage,
      //   justAfter: anotherStage
      // }
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Codebuild',
          project: this.codebuildProject,
          input: sourceArtifact,
          outputs: [buildArtifact],
        })
      ],
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeDeployEcsDeployAction({
          actionName: 'Codebuild',
          appSpecTemplateInput: buildArtifact,
          taskDefinitionTemplateInput: buildArtifact,
          deploymentGroup: this.testEcsDeploymentGroup,
        })],
    })

    // Some events
    // const rule = pipelineProject.onStateChange('OnBuildStarted', { target });
    // rule.addEventPattern({
    //   detail: {
    //     'build-status': [
    //       "IN_PROGRESS",
    //       "SUCCEEDED",
    //       "FAILED",
    //       "STOPPED"
    //     ]
    //   }
    // })

  }
}