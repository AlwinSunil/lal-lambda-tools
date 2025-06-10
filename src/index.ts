#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";

import { createTemplate } from "./commands/create-template";
import { deployLambda } from "./commands/deploy";
import { CreateOptions, DeployOptions } from "./types/app";

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

${chalk.cyan("Commands:")}
  ${chalk.white("create <name>")}                        Create new Lambda function template
  ${chalk.white("deploy")}                              Deploy Lambda function to AWS

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
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools create user-auth")}                Create Python function in current directory
  ${chalk.green("lal-lambda-tools create api-gateway -l nodejs")}    Create Node.js function
  ${chalk.green("lal-lambda-tools create processor -o ./functions")} Create in specific directory

${chalk.cyan("Languages:")}
  ${chalk.white("python")}    Python 3.9+ (default)
  ${chalk.white("nodejs")}    Node.js 18+
`,
  )
  .action(async (name: string, options: CreateOptions) => {
    try {
      await createTemplate(name, options.language, options.output);
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

program.parse();
