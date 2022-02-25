/* eslint-disable no-useless-constructor, no-new */
import { Stack, StackProps, DockerImage, BundlingOptions, CfnOutput } from 'aws-cdk-lib'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { Asset } from 'aws-cdk-lib/aws-s3-assets'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AwsCdkExplorationsStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AwsCdkExplorationsQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
    const api = new RestApi(this, 'CdkExplorations', {
      restApiName: 'CdkExplorationsAPI',
      description: 'Exploring CDK options'
    })
    this.createLambdas(api)
    this.createEC2()
  }

  createLambdas (api: RestApi) {
    const lambdaApi = api.root.addResource('lambda')

    // ------------------------------
    //    LAMBDA RUST STACK
    // ------------------------------
    const pathRust = path.join(__dirname, '..', 'lambda', 'play-rs')
    const target = 'x86_64-unknown-linux-musl'
    const rustHandler = new lambda.Function(this, 'PlayRust', {
      functionName: 'play-rs',
      code: lambda.Code.fromAsset(pathRust, {
        bundling: {
          local: {
            tryBundle: (outputDir: string, options: BundlingOptions): boolean => {
              try {
                spawnSync('cargo',
                  ['build', '--release'],
                  { cwd: pathRust }
                )
                spawnSync('cp',
                  [`target/${target}/release/play-rs`, path.join(outputDir, 'bootstrap')],
                  { cwd: pathRust }
                )
                return true
              } catch {
                return false
              }
            }
          },
          image: DockerImage.fromRegistry('rust:slim')
        }
      }),
      runtime: lambda.Runtime.PROVIDED_AL2,
      handler: 'main'
    })
    const rustApi = lambdaApi.addResource('rust')
    rustApi.addMethod('GET', new LambdaIntegration(rustHandler))
  }

  createEC2 () {
    // ------------------------------
    //    EC2 Typescript stack
    // ------------------------------
    const vpc = new ec2.Vpc(this, 'my-cdk-vpc', {
      natGateways: 0,
      subnetConfiguration: [
        { name: 'my-public-subnet', cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC }
      ]
    })
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: 'CdkExplorationsSG',
      vpc,
      description: 'Allow ssh and internet access to ec2 instances',
      allowAllOutbound: true
    })
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh access from the world')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow HTTP traffic from anywhere')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'allow HTTPS traffic from anywhere')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'allow HTTP traffic from anywhere')
    const ec2Instance = new ec2.Instance(this, 'my-ec2-instance', {
      instanceName: 'CdkExpv5',
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      keyName: 'ec2-key-pair'
    })
    // Initial setup
    // Check: /var/log/cloud-init.log and /var/log/cloud-init-output.log
    // There is also: /etc/cloud folder
    const userDataAsset = new Asset(this, 'userDataAsset', { path: path.join(__dirname, 'user-data.sh') })
    const localPath = ec2Instance.userData.addS3DownloadCommand({
      bucket: userDataAsset.bucket,
      bucketKey: userDataAsset.s3ObjectKey
    })
    ec2Instance.userData.addExecuteFileCommand({
      filePath: localPath,
      arguments: '--verbose -y'
    })
    userDataAsset.grantRead(ec2Instance.role)
    // Bundled Server
    const serverPath = path.join(__dirname, '..', 'ec2', 'fast-gql')
    spawnSync('npm', ['run', 'build'], { cwd: serverPath })
    const serverAsset = new Asset(this, 'serverAsset', {
      path: path.join(serverPath, 'dist', 'index.js')
    })
    const serverLocalPath = ec2Instance.userData.addS3DownloadCommand({
      bucket: serverAsset.bucket,
      bucketKey: serverAsset.s3ObjectKey,
      localFile: '/home/ec2-user/index.js'
    })
    ec2Instance.userData.addCommands(`node ${serverLocalPath}`)
    serverAsset.grantRead(ec2Instance.role)

    new CfnOutput(this, 'MyEC2IP', {
      exportName: 'server-info',
      value: `
      IP: ${ec2Instance.instancePublicIp}
      DNS: http://${ec2Instance.instancePublicDnsName}
      userData: ${localPath}
      server: ${serverLocalPath}
        `,
      description: 'The public IP address of the ec2 host'
    })
  }
}
