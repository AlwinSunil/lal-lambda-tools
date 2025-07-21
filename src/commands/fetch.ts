#!/usr/bin/env node

import path from "path";

import AdmZip from "adm-zip";
import chalk from "chalk";
import fse from "fs-extra";
import ora from "ora";

import { GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { fromIni } from "@aws-sdk/credential-providers";

import { checkFunctionStatus } from "../helpers/checkFunctionStatus";
import { validateDeployOptions } from "../helpers/validateDeployOptions";
import { FetchOptions } from "../types/app";

async function createLambdaClient(options: Pick<FetchOptions, "profile" | "region">): Promise<LambdaClient> {
  const creds = await fromIni({ profile: options.profile });

  const lambdaClient = new LambdaClient({
    region: options.region,
    credentials: creds,
  });

  return lambdaClient;
}

export async function fetchLambda(functionName: string, options: FetchOptions): Promise<void> {
  // Validate options similar to deploy options
  await validateDeployOptions({
    profile: options.profile,
    region: options.region,
    functionName,
  });

  const spinner = ora("Preparing to fetch Lambda function...").start();

  try {
    // Create output directory
    const outputDir = path.resolve(options.output, functionName);

    // Check if directory already exists
    const dirExists = await fse.pathExists(outputDir);
    if (dirExists) {
      const dirStat = await fse.stat(outputDir);
      if (dirStat.isDirectory()) {
        const dirContents = await fse.readdir(outputDir);
        if (dirContents.length > 0) {
          throw new Error(`Directory '${outputDir}' already exists and is not empty`);
        }
      } else {
        throw new Error(`A file with the name '${functionName}' already exists at the specified location`);
      }
    }

    await fse.ensureDir(outputDir);

    spinner.text = "Setting up AWS clients...";
    const lambdaClient = await createLambdaClient({
      profile: options.profile,
      region: options.region,
    });

    spinner.text = "Checking if function exists...";
    const functionConfig = await checkFunctionStatus(lambdaClient, functionName);

    if (!functionConfig) {
      throw new Error(`Lambda function '${functionName}' not found in region '${options.region}'`);
    }

    spinner.text = "Downloading function code...";

    // Get function code using GetFunction command
    const getFunctionCommand = new GetFunctionCommand({
      FunctionName: functionName,
    });

    const functionResponse = await lambdaClient.send(getFunctionCommand);

    if (!functionResponse.Code || !functionResponse.Code.Location) {
      throw new Error("Unable to get function code download URL");
    }

    // Download the code ZIP file
    spinner.text = "Downloading and extracting function code...";

    const response = await fetch(functionResponse.Code.Location);
    if (!response.ok) {
      throw new Error(`Failed to download function code: ${response.statusText}`);
    }

    const zipBuffer = Buffer.from(await response.arrayBuffer());

    // Extract ZIP file
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(outputDir, true);

    spinner.succeed(chalk.green(`✅ Lambda function '${functionName}' code downloaded and extracted successfully!`));

    // Success output
    console.log(`
${chalk.blue("📁 Downloaded to:")}`);
    console.log(`   ${outputDir}/`);

    console.log(`
${chalk.blue("📊 Function details (from AWS):")}`);
    console.log(`   🚀 Function Name: ${functionName}`);
    console.log(`   📍 Region: ${options.region}`);
    console.log(`   🔐 Role: ${functionConfig.Role || "Unknown"}`);
    console.log(`   🎯 Handler: ${functionConfig.Handler || "Unknown"}`);
    console.log(`   ⚡ Runtime: ${functionConfig.Runtime || "Unknown"}`);
    console.log(`   ⏱️ Timeout: ${functionConfig.Timeout || "Unknown"}s`);
    console.log(`   💾 Memory: ${functionConfig.MemorySize || "Unknown"}MB`);

    console.log(`
${chalk.blue("🚀 Next steps:")}`);
    console.log(`   cd ${path.join(options.output, functionName)}`); // Corrected path for cd
    console.log("   # Review the downloaded code");
  } catch (error) {
    spinner.fail(`❌ Failed to fetch Lambda function: ${error}`);
    throw error;
  }
}
