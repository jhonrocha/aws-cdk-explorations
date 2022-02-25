/* eslint-disable no-useless-constructor */
import { Stack, StackProps, DockerImage, BundlingOptions } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
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
    const lambdaApi = api.root.addResource('lambda')

    // ------------------------------
    //    RUST STACK
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
}
