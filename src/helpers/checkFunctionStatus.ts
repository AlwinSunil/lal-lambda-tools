import { FunctionConfiguration, GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";

export async function checkFunctionStatus(
  lambdaClient: LambdaClient,
  functionName: string,
): Promise<FunctionConfiguration | null> {
  try {
    const getCommand = new GetFunctionCommand({
      FunctionName: functionName,
    });
    const response = await lambdaClient.send(getCommand);
    return response.Configuration || null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return null; // Function doesn't exist
    }
    // Re-throw other errors (like permission errors)
    throw error;
  }
}
