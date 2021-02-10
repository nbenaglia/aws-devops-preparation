import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

export class IamStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EC2
    const ec2Role = new iam.Role(this, 'ec2-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    ec2Role.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['lambda:InvokeFunction'],
    }));

    // CODEDEPLOY
    const codedeployRole = new iam.Role(this, 'codedeploy-role', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });

    codedeployRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['lambda:InvokeFunction'],
    }));
  }
}