#!/usr/bin/env node

import { exec, spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import chalk from "chalk";
import fse from "fs-extra";
import ora from "ora";
import YAML from "yaml";
import { parse as parseToml } from "smol-toml";

import { LambdaClient } from "@aws-sdk/client-lambda";
import { fromIni } from "@aws-sdk/credential-providers";

import { showStatusOnly } from "../helpers/showStatusOnly";
import { validateDeployOptions } from "../helpers/validateDeployOptions";
import { formatValidationErrors, validateTemplate } from "../helpers/validateTemplate";
import { DeployOptions, ParsedSAMTemplate, SAMResource, SAMTemplate } from "../types/app";

const execPromise = promisify(exec);

const parseTemplate = async (templatePath: string): Promise<ParsedSAMTemplate> => {
  const templateContent = await fs.readFile(templatePath, "utf-8");
  const template: SAMTemplate = YAML.parse(templateContent);

  // Validate template structure before processing
  const validationErrors = validateTemplate(template);
  if (validationErrors.length > 0) {
    throw new Error(formatValidationErrors(validationErrors));
  }

  const resources = template.Resources || {};

  const lambdaResource = Object.entries(resources).find(
    ([, resource]) => (resource as SAMResource).Type === "AWS::Serverless::Function",
  );

  if (!lambdaResource) {
    throw new Error("No AWS::Serverless::Function resource found in template.yaml");
  }

  const [resourceName, resource] = lambdaResource;
  const properties = (resource as SAMResource).Properties!; // Safe to use ! after validation
  return {
    functionName: resourceName,
    role: properties.Role,
    codeUri: properties.CodeUri!,
    handler: properties.Handler!,
    runtime: properties.Runtime!,
    timeout: properties.Timeout!,
    memorySize: properties.MemorySize!,
    layers: properties.Layers,
  };
};

async function createLambdaClient(options: DeployOptions): Promise<LambdaClient> {
  // Use the specified profile to get credentials
  const creds = await fromIni({ profile: options.profile });

  const lambdaClient = new LambdaClient({
    region: options.region,
    credentials: creds,
  });

  return lambdaClient;
}

/**
 * Check if a CloudFormation stack exists using SAM CLI
 */
async function checkStackExists(stackName: string, profile?: string, region?: string): Promise<boolean> {
  try {
    // Use CloudFormation describe-stacks as the primary method since it's most reliable
    let cfCommand = `aws cloudformation describe-stacks --stack-name ${stackName}`;

    if (profile) {
      cfCommand += ` --profile ${profile}`;
    }

    if (region) {
      cfCommand += ` --region ${region}`;
    }

    const { stdout: cfOutput } = await execPromise(cfCommand);
    console.log("CloudFormation check output:", cfOutput);

    // Parse the JSON output to check if stack exists and get its status
    const result = JSON.parse(cfOutput);
    if (result.Stacks && result.Stacks.length > 0) {
      const stack = result.Stacks[0];
      const stackStatus = stack.StackStatus;

      // Check if stack is in a valid state for sync operations
      const validStates = ["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"];

      if (validStates.includes(stackStatus)) {
        console.log(`Stack '${stackName}' found with status: ${stackStatus}`);
        return true;
      } else {
        console.log(`Stack '${stackName}' found but in state: ${stackStatus} - will use deploy instead of sync`);
        return false; // Treat as non-existent for sync purposes
      }
    }

    return false;
  } catch (error: any) {
    console.log("CloudFormation check error:", error.message);

    // If the error message indicates the stack doesn't exist, return false
    if (error.message.includes("does not exist") || error.message.includes("ValidationError")) {
      console.log(`Stack '${stackName}' does not exist`);
      return false;
    }

    // For other errors (permissions, network, etc.), assume stack doesn't exist to be safe
    console.log(`Assuming stack doesn't exist due to error: ${error.message}`);
    return false;
  }
}

/**
 * Check if AWS SAM CLI is installed
 */
async function checkSamCliInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execPromise("sam --version");
    return stdout.toLowerCase().includes("sam cli");
  } catch (error) {
    return false;
  }
}

/**
 * Check if a samconfig.toml file exists in the current directory
 */
async function checkSamConfigExists(): Promise<boolean> {
  const samConfigPath = path.join(process.cwd(), "samconfig.toml");
  return fse.pathExists(samConfigPath);
}

/**
 * Parse samconfig.toml to get the stack name
 */
async function getStackNameFromSamConfig(): Promise<string | null> {
  try {
    const samConfigPath = path.join(process.cwd(), "samconfig.toml");
    const samConfigContent = await fs.readFile(samConfigPath, "utf-8");

    // Parse TOML content using smol-toml
    const parsedConfig = parseToml(samConfigContent) as any;

    // Navigate to [default.deploy.parameters] section
    const defaultSection = parsedConfig?.default;
    const deploySection = defaultSection?.deploy;
    const parametersSection = deploySection?.parameters;

    if (parametersSection && typeof parametersSection.stack_name === "string") {
      return parametersSection.stack_name;
    }

    // Alternative structure check - sometimes the structure might be different
    // Check if stack_name is directly in the parsed config at various levels
    if (parsedConfig?.stack_name && typeof parsedConfig.stack_name === "string") {
      return parsedConfig.stack_name;
    }

    if (defaultSection?.stack_name && typeof defaultSection.stack_name === "string") {
      return defaultSection.stack_name;
    }

    return null;
  } catch (error) {
    console.log("Error parsing samconfig.toml:", error);
    return null;
  }
}

async function deployLambda(options: DeployOptions) {
  const spinner = ora("Preparing deployment...\n").start();

  try {
    spinner.text = "Validating deployment options...";
    await validateDeployOptions(options);

    const templatePath = path.join(process.cwd(), "template.yml");
    if (!(await fse.pathExists(templatePath))) {
      throw new Error(
        "template.yml not found in current directory. Make sure you are in a Lambda project directory generated by lal-lambda-tools.",
      );
    }

    // Check if the status only flag is set
    if (options.statusOnly) {
      spinner.text = "Setting up AWS clients for status check...";
      const lambdaClient = await createLambdaClient({
        profile: options.profile,
        region: options.region,
      });

      const templateConfig = await parseTemplate(templatePath);
      const functionName = options.functionName || templateConfig.functionName;

      showStatusOnly(spinner, lambdaClient, functionName);
      return;
    }

    // Check if SAM CLI is installed
    spinner.text = "Checking for AWS SAM CLI...";
    const isSamCliInstalled = await checkSamCliInstalled();
    if (!isSamCliInstalled) {
      spinner.fail("AWS SAM CLI is not installed or not in PATH");
      console.log(chalk.yellow("Please install AWS SAM CLI to continue:"));
      console.log(
        chalk.blue(
          "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html",
        ),
      );
      return;
    }

    // Check if samconfig.toml exists
    const samConfigExists = await checkSamConfigExists();

    // Parse template to get function information for output
    spinner.text = "Parsing template.yml...";
    const templateConfig = await parseTemplate(templatePath);
    const functionName = options.functionName || templateConfig.functionName;

    // Get stack name from samconfig.toml if it exists, otherwise use function name
    let stackName = functionName; // Default to function name
    if (samConfigExists) {
      const configStackName = await getStackNameFromSamConfig();
      if (configStackName) {
        stackName = configStackName;
        spinner.info(`Using stack name from samconfig.toml: ${stackName}`);
      } else {
        spinner.info(`No stack_name found in samconfig.toml, using function name: ${stackName}`);
      }
    } else {
      spinner.info(`No samconfig.toml found, using function name as stack name: ${stackName}`);
    }

    // Check if the stack already exists
    spinner.text = "Checking if stack exists...";
    const stackExists = await checkStackExists(stackName, options.profile, options.region);

    let deployCommand: string;

    if (stackExists) {
      // Use sam sync for existing stacks to avoid CloudFormation deletions
      spinner.info(`Stack '${stackName}' exists, using sam sync for faster deployment`);
      deployCommand = `sam sync --stack-name ${stackName} --code`;

      // Add the resource ID for the Lambda function
      deployCommand += ` --resource-id ${functionName}`;

      if (options.profile) {
        deployCommand += ` --profile ${options.profile}`;
      }

      if (options.region) {
        deployCommand += ` --region ${options.region}`;
      }
    } else {
      // Use sam deploy for new stacks
      spinner.info(`Stack '${stackName}' does not exist, using sam deploy for initial deployment`);
      deployCommand = "sam deploy";

      // Add profile if specified
      if (options.profile) {
        deployCommand += ` --profile ${options.profile}`;
      }

      // If no samconfig.toml, add required parameters
      if (!samConfigExists) {
        deployCommand += " --guided";
      } else {
        // With samconfig.toml, we can just use the non-interactive mode
        deployCommand += " --no-confirm-changeset";
      }

      // Add region if specified and no samconfig.toml
      if (options.region && !samConfigExists) {
        deployCommand += ` --region ${options.region}`;
      }

      // Add stack name if specified and no samconfig.toml
      if (options.functionName && !samConfigExists) {
        deployCommand += ` --stack-name ${options.functionName}`;
      }
    }

    console.log(stackExists);

    // Execute the SAM deploy command
    spinner.text = `Deploying Lambda function using AWS SAM CLI: ${functionName}...`;
    spinner.info(`Running: ${deployCommand}`);

    // Temporarily stop the spinner to show real-time output
    spinner.stop();
    console.log(chalk.yellow("\n--- Deployment Process Started ---"));

    // Use child_process.spawn to get real-time output
    const samProcess = spawn(deployCommand, {
      shell: true,
      cwd: process.cwd(),
      stdio: "inherit", // This will show output in real-time
    });

    // Return a promise that resolves when the process exits
    const processResult = await new Promise<{ success: boolean }>((resolve, reject) => {
      samProcess.on("exit", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`SAM CLI process exited with code ${code}`));
        }
      });

      samProcess.on("error", (err: Error) => {
        reject(new Error(`Failed to start SAM CLI process: ${err.message}`));
      });
    });

    console.log(chalk.yellow("--- Deployment Process Completed ---\n"));

    // Restart spinner for remaining steps
    spinner.start();
    spinner.succeed(chalk.green("✅ Lambda function deployed successfully with AWS SAM CLI!"));

    console.log(chalk.blue("🚀 Function Name: " + functionName));
    console.log(chalk.blue("📍 Region: " + (options.region || "from samconfig.toml")));
    if (templateConfig.role) {
      console.log(chalk.blue("🔐 Role: " + templateConfig.role));
    }
    console.log(chalk.blue("📁 Code URI: " + templateConfig.codeUri));
    console.log(chalk.blue("🎯 Handler: " + templateConfig.handler));
    console.log(chalk.blue("⚡ Runtime: " + templateConfig.runtime));
    console.log(chalk.blue("⏱️ Timeout: " + templateConfig.timeout + "s"));
    console.log(chalk.blue("💾 Memory: " + templateConfig.memorySize + "MB"));

    if (templateConfig.layers && templateConfig.layers.length > 0) {
      console.log(chalk.blue("📦 Layers:"));
      templateConfig.layers.forEach((layer: string, index: number) => {
        console.log(chalk.blue(`   ${index + 1}. ${layer}`));
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    spinner.fail(`❌ Deployment failed: ${err.message || error}`);
    throw error;
  }
}

export { deployLambda };
