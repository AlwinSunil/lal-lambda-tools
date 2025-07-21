import chalk from "chalk";
import { Ora } from "ora";

import { LambdaClient } from "@aws-sdk/client-lambda";

import { checkFunctionStatus } from "./checkFunctionStatus";

export const showStatusOnly = async (spinner: Ora, lambdaClient: LambdaClient, functionName: string) => {
  spinner.text = "Checking Lambda function status...";

  const functionConfig = await checkFunctionStatus(lambdaClient, functionName);

  spinner.stop();

  if (functionConfig) {
    console.log(chalk.green(`✅ Function Found: ${functionName}`));
    console.log(chalk.blue(`📊 State: ${functionConfig.State || "Unknown"}`));
    console.log(chalk.blue(`🔄 Last Update Status: ${functionConfig.LastUpdateStatus || "Unknown"}`));
    console.log(chalk.blue(`📅 Last Modified: ${functionConfig.LastModified || "Unknown"}`));
    console.log(chalk.blue(`🔐 Role: ${functionConfig.Role || "Unknown"}`));
    console.log(chalk.blue(`🎯 Handler: ${functionConfig.Handler || "Unknown"}`));
    console.log(chalk.blue(`⚡ Runtime: ${functionConfig.Runtime || "Unknown"}`));
    console.log(chalk.blue(`⏱️ Timeout: ${functionConfig.Timeout || "Unknown"}s`));
    console.log(chalk.blue(`💾 Memory: ${functionConfig.MemorySize || "Unknown"}MB`));
    console.log(chalk.blue(`🔗 Function ARN: ${functionConfig.FunctionArn || "Unknown"}`));

    if (functionConfig.Layers && functionConfig.Layers.length > 0) {
      console.log(chalk.blue("📦 Layers:"));
      functionConfig.Layers.forEach((layer, index) => {
        console.log(chalk.blue(`   ${index + 1}. ${layer.Arn || layer}`));
      });
    }

    if (functionConfig.LastUpdateStatusReason) {
      console.log(chalk.yellow(`📝 Last Update Reason: ${functionConfig.LastUpdateStatusReason}`));
    }

    if (functionConfig.State === "Pending" || functionConfig.LastUpdateStatus === "InProgress") {
      console.log(chalk.yellow(`⚠️  Function is currently being updated. Please wait before deploying again.`));
    } else if (functionConfig.LastUpdateStatus === "Failed") {
      console.log(chalk.red(`❌ Last update failed. Check the function in AWS Console for details.`));
    }
  } else {
    console.log(
      chalk.yellow(
        `📝 Function "${functionName}" was not found. Ensure the resource identifier for lambda in your template.yml matches exactly.`,
      ),
    );
  }
};
