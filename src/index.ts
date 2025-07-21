#!/usr/bin/env node

import { readFileSync } from "fs";
import { join } from "path";

import chalk from "chalk";
import { Command } from "commander";

import { createTemplate } from "./commands/create-template";
import { deployLambda } from "./commands/deploy";
import { fetchLambda } from "./commands/fetch";
import { CreateOptions, DeployOptions, FetchOptions } from "./types/app";

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

${chalk.cyan("Quick Examples:")}
  ${chalk.dim("$")} ${chalk.green("lal-lambda-tools create UserAuth")}
  ${chalk.dim("$")} ${chalk.green("lal-lambda-tools deploy --profile dev")}
  ${chalk.dim("$")} ${chalk.green("lal-lambda-tools fetch UserAuth")}

${chalk.dim("Run 'lal-lambda-tools <command> --help' for specific options")}
`,
  );

// Create command
program
  .command("create")
  .description("Create new Lambda function from template")
  .argument("<name>", "Function name (PascalCase)")
  .option("--language <type>", "Language (default: python)", "python")
  .option("--output <directory>", "Output directory (default: current directory)", ".")
  .option("--layers <arns...>", "Layer ARNs to attach to the function")
  .option("--stack-name <name>", "CloudFormation stack name (required - use existing or create new)")
  .option(
    "--role <arn>",
    "IAM execution role ARN (default: arn:aws:iam::358922846691:role/service-role/prescription-generator-role-c9fkws8j)",
  )
  .addHelpText(
    "after",
    `
${chalk.cyan("Examples:")}
  ${chalk.green("lal-lambda-tools create UserAuth --stack-name my-auth-stack")}     Create Python function
  ${chalk.green("lal-lambda-tools create ApiGateway --language nodejs --stack-name api-stack")}  Create Node.js function
  ${chalk.green("lal-lambda-tools create Processor --output ./functions --stack-name proc-stack")}  Create in specific directory

${chalk.cyan("Runtime Info:")}
  ${chalk.white("python")}    Python 3.9+ (default)
  ${chalk.white("nodejs")}    Node.js 18+

${chalk.cyan("Stack Name:")}
  • ${chalk.yellow("Required")} - Must specify a CloudFormation stack name
  • Use existing stack name to update existing deployment
  • Use new stack name to create a new deployment
  • Stack name must be unique within your AWS account/region

${chalk.cyan("Template Features:")}
  • SAM template with best practices 
  • Function code with error handling
  • Ready-to-deploy samconfig.toml
`,
  )
  .action(async (name, options: CreateOptions) => {
    try {
      // Check if stack name is provided
      if (!options.stackName) {
        console.error(
          chalk.red(`❌ Error: Stack name is required. Use --stack-name <name> to specify a CloudFormation stack name.`),
        );
        console.error(chalk.yellow(`💡 Example: lal-lambda-tools create ${name} --stack-name my-${name.toLowerCase()}-stack`));
        process.exit(1);
      }

      await createTemplate(name, options.language, options.output, options.stackName, options.layers, options.role);
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
  ${chalk.green("lal-lambda-tools deploy --region eu-west-1")}     Deploy to specific region

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

program.parse();
