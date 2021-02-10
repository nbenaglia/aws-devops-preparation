import * as cdk from '@aws-cdk/core';
import * as codecommit from '@aws-cdk/aws-codecommit';

export class CodeCommitStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repository = new codecommit.Repository(this, 'nbenaglia-repository', {
      repositoryName: 'nbenaglia',
      description: 'First repository with CDK codecommit.'
    });
  }
}
