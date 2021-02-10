import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { MyProps } from './utils';

export class SecurityGroupStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyProps) {
    super(scope, id, props);

    let ec2SecurityGroup = new ec2.SecurityGroup(this, 'ec2-sg', {
      allowAllOutbound: true,
      securityGroupName: "ec2-sg",
      vpc: ec2.Vpc.fromLookup(this, "my-vpc", { vpcId: props.vpcId })
    })

    // SSH
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "SSH",
        protocol: ec2.Protocol.TCP,
        fromPort: 22,
        toPort: 22
      }))

    // HTTP
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.securityGroupSourceCIDR),
      new ec2.Port({
        stringRepresentation: "HTTP",
        protocol: ec2.Protocol.TCP,
        fromPort: 80,
        toPort: 80
      }))
  }
}