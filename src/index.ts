#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";

import { createTemplate } from "./commands/create-template";
import { deployLambda } from "./commands/deploy";
import { fetchLambda } from "./commands/fetch";
import { CreateOptions, DeployOptions, FetchOptions } from "./types/app";

const program = new Command();

program
  .name("lal-lambda-tools")
  .description("LiveAltLife Lambda Tools - Create and deploy AWS Lambda functions")
  .version("0.1.0")
  .addHelpText(
    "after",
    `
${chalk.cyan("Quick Start:")}
  ${chalk.green("lal-lambda-tools create my-function")}   Create Python function in current directory
  ${chalk.green("lal-lambda-tools deploy")}               Deploy function from current directory
  ${chalk.green("lal-lambda-tools fetch my-function")}    Download function from AWS

${chalk.cyan("Commands:")}
  ${chalk.white("create <name>")}                        Create new Lambda function template
  ${chalk.white("deploy")}                              Deploy Lambda function to AWS
  ${chalk.white("fetch <name>")}                        Download Lambda function from AWS

${chalk.cyan("Common Options:")}
  ${chalk.white("-l, --language <type>")}               Language: python (default) | nodejs
  ${chalk.white("-o, --output <dir>")}                  Output directory (default: current directory)
  ${chalk.white("-h, --help")}                          Show help for command

${chalk.dim("Run 'lal-lambda-tools <command> --help' for detailed options")}
`,
  );

// Create command
program
  .command("create")
  .description("Create new Lambda function from template")
  .argument("<name>", "Function name")
  .option("-l, --language <type>", "Language (default: python)", "python")
  .option("-o, --output <directory>", "Output directory (default: current directory)", ".")
  .option("--layers <arns...>", "Layer ARNs to attach to the function")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools create user-auth")}                Create Python function in current directory
  ${chalk.green("lal-lambda-tools create api-gateway -l nodejs")}    Create Node.js function
  ${chalk.green("lal-lambda-tools create processor -o ./functions")} Create in specific directory
  ${chalk.green(
    "lal-lambda-tools create my-lambda --layers arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1 arn:aws:lambda:us-east-1:123456789012:layer:another-layer:3",
  )} Create Python function with layers

${chalk.cyan("Languages:")}
  ${chalk.white("python")}    Python 3.9+ (default)
  ${chalk.white("nodejs")}    Node.js 18+
`,
  )
  .action(async (name: string, options: CreateOptions) => {
    try {
      await createTemplate(name, options.language, options.output, options.layers);
    } catch (error) {
      console.error(chalk.red(`❌ Error creating template: ${error}`));
      process.exit(1);
    }
  });

// Deploy command
program
  .command("deploy")
  .description("Deploy Lambda function to AWS")
  .option("-p, --profile <name>", "AWS CLI profile (default: default)", "default")
  .option("-r, --region <region>", "AWS region (default: us-east-2)", "us-east-2")
  .option("-f, --function-name <name>", "Override function name")
  .option("--role <arn>", "IAM execution role ARN")
  .option("-s, --status-only", "Check deployment status only")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools deploy")}                       Deploy with default settings
  ${chalk.green("lal-lambda-tools deploy -p production")}         Use specific AWS profile
  ${chalk.green("lal-lambda-tools deploy -r eu-west-1")}          Deploy to specific region
  ${chalk.green("lal-lambda-tools deploy --status-only")}         Check deployment status only

${chalk.cyan("Requirements:")}
  ${chalk.white("•")} Function code in current directory
  ${chalk.white("•")} Valid AWS credentials configured
  ${chalk.white("•")} Appropriate IAM permissions
`,
  )
  .action(async (options: DeployOptions) => {
    try {
      await deployLambda(options);
    } catch (error) {
      console.error(chalk.red(`❌ ${options.statusOnly ? "Status check failed" : "Deployment failed"}: ${error}`));
      process.exit(1);
    }
  });

// Fetch command
program
  .command("fetch")
  .description("Download Lambda function from AWS")
  .argument("<name>", "Function name")
  .option("-p, --profile <name>", "AWS CLI profile (default: default)", "default")
  .option("-r, --region <region>", "AWS region (default: us-east-2)", "us-east-2")
  .option("-o, --output <directory>", "Output directory (default: current directory)", ".")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools fetch user-auth")}                 Download function to current directory
  ${chalk.green("lal-lambda-tools fetch api-gateway -p production")} Use specific AWS profile
  ${chalk.green("lal-lambda-tools fetch processor -r eu-west-1")}     Download from specific region
  ${chalk.green("lal-lambda-tools fetch my-func -o ./functions")}     Download to specific directory

${chalk.cyan("Requirements:")}
  ${chalk.white("•")} Valid AWS credentials configured
  ${chalk.white("•")} Function must exist in specified region
  ${chalk.white("•")} Appropriate IAM permissions to read Lambda functions
`,
  )
  .action(async (name: string, options: FetchOptions) => {
    try {
      await fetchLambda(name, options);
    } catch (error) {
      console.error(chalk.red(`❌ Error fetching function: ${error}`));
      process.exit(1);
    }
  });

program.parse();
