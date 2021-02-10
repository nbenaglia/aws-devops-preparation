import * as cdk from '@aws-cdk/core';
import * as codecommit from '@aws-cdk/aws-codecommit';
import { MyProps } from './utils';

export class CodeCommitStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);

    const repository = new codecommit.Repository(this, `${props.repositoryName}-repository`, {
      repositoryName: `${props.repositoryName}`,
      description: 'First repository with CDK codecommit.'
    });
  }
}
