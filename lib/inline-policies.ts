import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { Construct, StackProps } from '@aws-cdk/core';
import { CicdProps } from './utils';

export function getSsmPolicy(scope: Construct, id: string, props?: StackProps): iam.Policy {
  let policy = new iam.Policy(scope, id, { policyName: 'ssm-policy' });
  policy.addStatements(
    new iam.PolicyStatement(
      {
        resources: ['*'],
        actions: [
          'ssm:DescribeAssociation',
          'ssm:GetDeployablePatchSnapshotForInstance',
          'ssm:GetDocument',
          'ssm:DescribeDocument',
          'ssm:GetManifest',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:ListAssociations',
          'ssm:ListInstanceAssociations',
          'ssm:PutInventory',
          'ssm:PutComplianceItems',
          'ssm:PutConfigurePackageResult',
          'ssm:UpdateAssociationStatus',
          'ssm:UpdateInstanceAssociationStatus',
          'ssm:UpdateInstanceInformation',
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
          'ec2messages:AcknowledgeMessage',
          'ec2messages:DeleteMessage',
          'ec2messages:FailMessage',
          'ec2messages:GetEndpoint',
          'ec2messages:GetMessages',
          'ec2messages:SendReply',
        ]
      }
    )
  );
  return policy;
}

export function getS3Policy(scope: Construct, id: string, props: CicdProps): iam.Policy {
  let policy = new iam.Policy(scope, id, { policyName: id });
  policy.addStatements(
    new iam.PolicyStatement({
      resources: [
        `arn:aws:s3:::${props.bucketName}/*`,
        `arn:aws:s3:::${props.bucketName}`
      ],
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:GetBucketLocation',
        's3:ListAllMyBuckets',
        's3:ListBucket'
      ],
    })
  );

  return policy
}

export function getCodedeployPolicy(scope: Construct, id: string, props?: StackProps): iam.Policy {
  let policy = new iam.Policy(scope, id, { policyName: id });
  policy.addStatements(
    new iam.PolicyStatement({
      actions: [
        'autoscaling:CompleteLifecycleAction',
        'autoscaling:DeleteLifecycleHook',
        'autoscaling:DescribeAutoScalingGroups',
        'autoscaling:DescribeLifecycleHooks',
        'autoscaling:PutLifecycleHook',
        'autoscaling:RecordLifecycleActionHeartbeat',
        'autoscaling:CreateAutoScalingGroup',
        'autoscaling:UpdateAutoScalingGroup',
        'autoscaling:EnableMetricsCollection',
        'autoscaling:DescribeAutoScalingGroups',
        'autoscaling:DescribePolicies',
        'autoscaling:DescribeScheduledActions',
        'autoscaling:DescribeNotificationConfigurations',
        'autoscaling:DescribeLifecycleHooks',
        'autoscaling:SuspendProcesses',
        'autoscaling:ResumeProcesses',
        'autoscaling:AttachLoadBalancers',
        'autoscaling:AttachLoadBalancerTargetGroups',
        'autoscaling:PutScalingPolicy',
        'autoscaling:PutScheduledUpdateGroupAction',
        'autoscaling:PutNotificationConfiguration',
        'autoscaling:PutLifecycleHook',
        'autoscaling:DescribeScalingActivities',
        'autoscaling:DeleteAutoScalingGroup',
        'ec2:DescribeInstances',
        'ec2:DescribeInstanceStatus',
        'ec2:TerminateInstances',
        'tag:GetResources',
        'sns:Publish',
        'cloudwatch:DescribeAlarms',
        'cloudwatch:PutMetricAlarm',
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeInstanceHealth',
        'elasticloadbalancing:RegisterInstancesWithLoadBalancer',
        'elasticloadbalancing:DeregisterInstancesFromLoadBalancer',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeTargetHealth',
        'elasticloadbalancing:RegisterTargets',
        'elasticloadbalancing:DeregisterTargets'
      ],
      resources: ['*']
    }
    )
  );
  return policy;
}