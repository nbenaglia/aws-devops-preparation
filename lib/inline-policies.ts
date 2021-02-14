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

export function getCodedeployPolicy(scope: Construct, id: string, props: StackProps): iam.Policy {
  let policy = new iam.Policy(scope, id, { policyName: id });
  policy.addStatements(
    new iam.PolicyStatement({
      actions: [
        'autoscaling:*',
        'codedeploy:*',
        'ec2:*',
        'lambda:*',
        'ecs:*',
        'elasticloadbalancing:*',
        'iam:AddRoleToInstanceProfile',
        'iam:AttachRolePolicy',
        'iam:CreateInstanceProfile',
        'iam:CreateRole',
        'iam:DeleteInstanceProfile',
        'iam:DeleteRole',
        'iam:DeleteRolePolicy',
        'iam:GetInstanceProfile',
        'iam:GetRole',
        'iam:GetRolePolicy',
        'iam:ListInstanceProfilesForRole',
        'iam:ListRolePolicies',
        'iam:ListRoles',
        'iam:PassRole',
        'iam:PutRolePolicy',
        'iam:RemoveRoleFromInstanceProfile', 
        's3:*',
        'ssm:*'
      ],
      resources: ['*']
    }
    )
  );
  return policy;
}