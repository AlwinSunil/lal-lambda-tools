import { LambdaClient } from "@aws-sdk/client-lambda";

import { checkFunctionStatus } from "./checkFunctionStatus";

export async function waitForFunctionUpdate(
  lambdaClient: LambdaClient,
  functionName: string,
  maxWaitTime: number = 60000, // 60 seconds max wait
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const functionConfig = await checkFunctionStatus(lambdaClient, functionName);

      if (functionConfig && functionConfig.State === "Active" && functionConfig.LastUpdateStatus === "Successful") {
        return; // Function is ready
      }

      if (functionConfig && functionConfig.LastUpdateStatus === "Failed") {
        throw new Error(`Function update failed: ${functionConfig.LastUpdateStatusReason || "Unknown reason"}`);
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      if (error instanceof Error && error.message.includes("update failed")) {
        throw error;
      }
      // Continue waiting for other errors
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`Timeout waiting for function update to complete after ${maxWaitTime / 1000} seconds`);
}
