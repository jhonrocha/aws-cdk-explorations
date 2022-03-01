/* eslint-disable no-useless-constructor, no-new */
import { Stack, StackProps, DockerImage, BundlingOptions, CfnOutput } from 'aws-cdk-lib'
import { RestApi, LambdaIntegration, Resource } from 'aws-cdk-lib/aws-apigateway'
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
    const lambdaResouce = api.root.addResource('lambda')
    this.lambdaRust(lambdaResouce)
    this.lambdaPython(lambdaResouce)
  }

  lambdaPython (lambdaApi: Resource) {
    const pyHandler = new lambda.Function(this, 'PlayPython', {
      functionName: 'play-py',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'play-py')),
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'main.handler'
    })
    const pyApi = lambdaApi.addResource('python')
    pyApi.addMethod('GET', new LambdaIntegration(pyHandler))
  }

  lambdaRust (lambdaApi: Resource) {
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
    // Initial setup
    const multipartUserData = new ec2.MultipartUserData()
    const setupCommands = ec2.UserData.forLinux()
    // Check: /var/log/cloud-init.log and /var/log/cloud-init-output.log
    // There is also: /etc/cloud folder
    const userDataAsset = new Asset(this, 'userDataAsset', { path: path.join(__dirname, 'user-data.sh') })
    const localPath = setupCommands.addS3DownloadCommand({
      bucket: userDataAsset.bucket,
      bucketKey: userDataAsset.s3ObjectKey
    })
    setupCommands.addExecuteFileCommand({
      filePath: localPath,
      arguments: '--verbose -y'
    })
    multipartUserData.addPart(ec2.MultipartBody.fromUserData(setupCommands))

    // Now create the first part to make cloud-init run it always
    const cinitConf = ec2.UserData.forLinux()
    cinitConf.addCommands(
      '#cloud-config',
      'cloud_final_modules:',
      '- [scripts-user, always]'
    )
    multipartUserData.addPart(ec2.MultipartBody.fromUserData(cinitConf, 'text/cloud-config'))

    // Bundled Server
    const restartCommands = ec2.UserData.forLinux()
    const serverPath = path.join(__dirname, '..')
    spawnSync('npm', ['run', 'build'], { cwd: serverPath })
    // Send to S3
    const serverAsset = new Asset(this, 'serverAsset', {
      path: path.join(serverPath, 'dist', 'index.js')
    })
    const serverLocalPath = restartCommands.addS3DownloadCommand({
      bucket: serverAsset.bucket,
      bucketKey: serverAsset.s3ObjectKey,
      localFile: '/home/ec2-user/index.js'
    })
    restartCommands.addCommands(
      `node ${serverLocalPath} &`,
      `echo "${new Date()}" >> /home/ec2-user/deploy.txt`
    )
    multipartUserData.addPart(ec2.MultipartBody.fromUserData(restartCommands))
    // EC2 Instance
    const ec2Instance = new ec2.Instance(this, 'my-ec2-instance', {
      instanceName: 'CdkExpv5',
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            deleteOnTermination: true
          })
        }
      ],
      securityGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022
      }),
      keyName: 'ec2-key-pair',
      userData: multipartUserData
    })
    // Grant read access
    userDataAsset.grantRead(ec2Instance.role)
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
