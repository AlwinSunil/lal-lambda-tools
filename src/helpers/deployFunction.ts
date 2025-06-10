import chalk from "chalk";

import {
  CreateFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

import { checkFunctionStatus } from "./checkFunctionStatus";
import { waitForFunctionUpdate } from "./waitForFunctionUpdate";
import { LambdaFunctionConfig } from "../types/app";

async function checkIfFunctionExists(lambdaClient: LambdaClient, functionName: string): Promise<boolean> {
  console.log(chalk.yellow(`🔍 Checking if function exists: ${functionName}`));

  try {
    const functionConfig = await checkFunctionStatus(lambdaClient, functionName);

    if (!functionConfig) {
      console.log(chalk.yellow(`📝 Function ${functionName} does not exist`));
      return false;
    }

    console.log(chalk.blue(`📊 Function state: ${functionConfig.State}`));
    console.log(chalk.blue(`🔄 Last update status: ${functionConfig.LastUpdateStatus}`));

    if (functionConfig.LastUpdateStatusReason) {
      console.log(chalk.blue(`📝 Last update reason: ${functionConfig.LastUpdateStatusReason}`));
    }

    const isStatePending = functionConfig.State === "Pending";
    const isUpdateInProgress = functionConfig.LastUpdateStatus === "InProgress";

    if (isStatePending || isUpdateInProgress) {
      throw new Error(`Function ${functionName} is currently updating. Wait for it to complete and try again.`);
    }

    return true;
  } catch (error) {
    // If it's our validation error, re-throw it
    if (error instanceof Error && error.message.includes("currently updating")) {
      throw error;
    }

    // Otherwise, function doesn't exist
    console.log(chalk.yellow(`📝 Function ${functionName} does not exist`));
    return false;
  }
}

async function updateExistingFunction(lambdaClient: LambdaClient, config: LambdaFunctionConfig): Promise<string> {
  console.log(chalk.blue(`🔄 Updating existing function: ${config.functionName}`));

  try {
    // Update function code
    console.log(chalk.yellow("📦 Updating function code..."));
    const updateCodeCommand = new UpdateFunctionCodeCommand({
      FunctionName: config.functionName,
      ZipFile: config.zipBuffer,
    });
    await lambdaClient.send(updateCodeCommand);

    // Wait for code update to complete
    console.log(chalk.yellow("⏳ Waiting for code update to complete..."));
    await waitForFunctionUpdate(lambdaClient, config.functionName);

    // Update function configuration
    console.log(chalk.yellow("⚙️  Updating function configuration..."));
    const updateConfigCommand = new UpdateFunctionConfigurationCommand({
      FunctionName: config.functionName,
      Runtime: config.runtime,
      Handler: config.handler,
      Timeout: config.timeout,
      Role: config.roleArn,
    });
    const response = await lambdaClient.send(updateConfigCommand);

    console.log(chalk.green(`✅ Successfully updated function: ${config.functionName}`));
    return response.FunctionArn || "";
  } catch (error) {
    console.log(chalk.red(`❌ Update failed for ${config.functionName}`));
    throw error;
  }
}

async function createNewFunction(lambdaClient: LambdaClient, config: LambdaFunctionConfig): Promise<string> {
  console.log(chalk.yellow(`🆕 Creating new function: ${config.functionName}`));

  try {
    const createCommand = new CreateFunctionCommand({
      FunctionName: config.functionName,
      Runtime: config.runtime,
      Role: config.roleArn,
      Handler: config.handler,
      Code: {
        ZipFile: config.zipBuffer,
      },
      Timeout: config.timeout,
      Description: "Lambda function deployed by lal-lambda-tools",
    });

    const response = await lambdaClient.send(createCommand);
    console.log(chalk.green(`✅ Successfully created function: ${config.functionName}`));
    return response.FunctionArn || "";
  } catch (error) {
    console.log(chalk.red(`❌ Creation failed for ${config.functionName}`));
    throw error;
  }
}

export async function deployFunction(lambdaClient: LambdaClient, config: LambdaFunctionConfig): Promise<string> {
  console.log(chalk.yellow(`🚀 Starting deployment of function: ${config.functionName}`));

  const functionExists = await checkIfFunctionExists(lambdaClient, config.functionName);

  if (functionExists) {
    return await updateExistingFunction(lambdaClient, config);
  } else {
    return await createNewFunction(lambdaClient, config);
  }
}
