#!/usr/bin/env node

import { readFileSync } from "fs";
import { join } from "path";

import chalk from "chalk";
import { Command } from "commander";

import { createTemplate } from "./commands/create-template";
import { deployLambda } from "./commands/deploy";
import { fetchLambda } from "./commands/fetch";
import { upgradeRuntimes } from "./commands/upgrade";
import { CreateOptions, DeployOptions, FetchOptions, UpgradeOptions } from "./types/app";

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const version = packageJson.version;

const program = new Command();

program
  .name("lal-lambda-tools")
  .description("CLI for AWS Lambda development (LiveAltLife)")
  .version(version)
  .addHelpText(
    "after",
    `
${chalk.cyan("Commands:")}
  ${chalk.white("create <name>")}    Create Lambda function template
  ${chalk.white("deploy")}           Deploy Lambda function with SAM
  ${chalk.white("fetch <name>")}     Download Lambda function from AWS
  ${chalk.white("upgrade")}          Upgrade Python runtimes for selected Lambdas

${chalk.cyan("Global Options:")}
  ${chalk.white("--profile")}        AWS CLI profile (default: default)
  ${chalk.white("--region")}         AWS region (default: us-east-2)

${chalk.cyan("Quick Examples:")}
  ${chalk.dim("$")} ${chalk.green(
    "lal-lambda-tools create UserAuth --stack-name my-stack --role arn:aws:iam::123456789012:role/lambda-role",
  )}
  ${chalk.dim("$")} ${chalk.green("lal-lambda-tools deploy --profile dev")}
  ${chalk.dim("$")} ${chalk.green("lal-lambda-tools fetch UserAuth --region us-west-2 --profile lal-devops")}
  ${chalk.dim("$")} ${chalk.green(
    "lal-lambda-tools upgrade --profile lal-devops --region us-east-2 --target-runtime python3.12",
  )}

${chalk.dim("Run 'lal-lambda-tools <command> --help' for specific options")}
`,
  );

// Create command
program
  .command("create")
  .description("Create new Lambda function from template")
  .argument("<name>", "Function name (PascalCase)")
  .requiredOption("--stack-name <name>", "CloudFormation stack name (required - use existing or create new)")
  .requiredOption("--role <arn>", "IAM execution role ARN (required)")
  .option("--language <type>", "Language (default: python)", "python")
  .option("--output <directory>", "Output directory (default: current directory)", ".")
  .option("--profile <name>", "AWS CLI profile", "default")
  .option("--region <region>", "AWS region", "us-east-2")
  .option("--layers <arns...>", "Layer ARNs to attach to the function")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green(
    "lal-lambda-tools create UserAuth --stack-name my-auth-stack --role arn:aws:iam::123456789012:role/lambda-execution-role",
  )}
  ${chalk.green(
    "lal-lambda-tools create ApiGateway --language nodejs --stack-name api-stack --role arn:aws:iam::123456789012:role/lambda-role",
  )}
  ${chalk.green(
    "lal-lambda-tools create Processor --output ./functions --profile prod --region us-west-2 --stack-name proc-stack --role arn:aws:iam::123456789012:role/my-lambda-role",
  )}

${chalk.cyan("Runtime Info:")}
  ${chalk.white("python")}    Python 3.9+ (default)
  ${chalk.white("nodejs")}    Node.js 18+

${chalk.cyan("Required Parameters:")}
  • ${chalk.yellow("--stack-name")} - CloudFormation stack name (use existing or create new)
  • ${chalk.yellow("--role")} - IAM execution role ARN for the Lambda function

${chalk.cyan("Optional Parameters:")}
  • ${chalk.yellow("--profile")} - AWS CLI profile (default: default)
  • ${chalk.yellow("--region")} - AWS region (default: us-east-2)

${chalk.cyan("IAM Role Requirements:")}
  • Must be a valid IAM role ARN
  • Role must have Lambda execution permissions
  • Example: arn:aws:iam::123456789012:role/lambda-execution-role

${chalk.cyan("Template Features:")}
  • SAM template with best practices 
  • Function code with error handling
  • Ready-to-deploy samconfig.toml with your profile/region
`,
  )
  .action(async (name, options: CreateOptions) => {
    try {
      await createTemplate(
        name,
        options.language,
        options.output,
        options.stackName,
        options.role,
        options.layers,
        options.profile,
        options.region,
      );
    } catch (error) {
      console.error(chalk.red(`❌ Error creating template: ${error}`));
      process.exit(1);
    }
  });

// Deploy command
program
  .command("deploy")
  .description("Deploy Lambda function to AWS")
  .option("--profile <name>", "AWS CLI profile", "default")
  .option("--region <region>", "AWS region", "us-east-2")
  .option("--function-name <name>", "Override function name")
  .option("--role <arn>", "IAM execution role ARN")
  .option("--status-only", "Check deployment status only")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools deploy")}                  Deploy with default settings
  ${chalk.green("lal-lambda-tools deploy --profile dev")}           Use specific AWS profile
  ${chalk.green("lal-lambda-tools deploy --region us-east-1")}     Deploy to specific region

${chalk.cyan("Requirements:")}
  • template.yml in current directory
  • samconfig.toml (created automatically by create command)
  • AWS SAM CLI installed

${chalk.cyan("Deployment Process:")}
  1. Validates template and configuration
  2. Uses AWS SAM CLI for deployment
  3. Shows real-time deployment progress
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
  .option("--profile <name>", "AWS CLI profile", "default")
  .option("--region <region>", "AWS region", "us-east-2")
  .option("--output <directory>", "Output directory", ".")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools fetch UserAuth")}                 Download function
  ${chalk.green("lal-lambda-tools fetch ApiGateway --profile prod")}       Use specific profile
  ${chalk.green("lal-lambda-tools fetch Processor --output ./backup")}    Download to specific directory

${chalk.cyan("Process:")}
  1. Connects to AWS Lambda service
  2. Downloads function code and configuration
  3. Creates template files for local development
`,
  )
  .action(async (name, options: FetchOptions) => {
    try {
      await fetchLambda(name, options);
    } catch (error) {
      console.error(chalk.red(`❌ Error fetching function: ${error}`));
      process.exit(1);
    }
  });

// Upgrade command
program
  .command("upgrade")
  .description("List Python Lambdas and upgrade selected to a target Python runtime")
  .option("--profile <name>", "AWS CLI profile", "default")
  .option("--region <region>", "AWS region", "us-east-2")
  .requiredOption("--target-runtime <runtime>", "Target runtime, e.g., python3.12")
  .option("--all", "Upgrade all Python functions found")
  .option("--include <names...>", "Specific function names to upgrade (space-separated)")
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools upgrade --profile lal-devops --region us-east-2 --target-runtime python3.12")}
  ${chalk.green("lal-lambda-tools upgrade --profile lal-devops --target-runtime python3.12 --include MyFnA MyFnB")}

${chalk.cyan("What it does:")}
  1. Uses AWS CLI to list functions with runtimes
  2. Filters Python functions and lets you choose which to upgrade
  3. Runs aws lambda update-function-configuration per selection and waits until the update completes
`,
  )
  .action(async (options: UpgradeOptions) => {
    try {
      await upgradeRuntimes(options);
    } catch (error) {
      console.error(chalk.red(`❌ Upgrade failed: ${error}`));
      process.exit(1);
    }
  });

program.parse();
