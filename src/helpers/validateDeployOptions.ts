import { z } from "zod";

import { fromIni } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

import { DeployOptions } from "../types/app";

const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
] as const;

const DeployOptionsSchema = z.object({
  profile: z
    .string()
    .min(1, "AWS profile cannot be empty")
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid AWS profile name"),
  region: z.enum(AWS_REGIONS, { errorMap: () => ({ message: "Invalid AWS region" }) }),
  functionName: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid function name")
    .max(64)
    .optional(),
  role: z
    .string()
    .regex(/^arn:aws:iam::\d{12}:role\//, "Invalid IAM role ARN")
    .optional(),
  statusOnly: z.boolean().optional(),
});

export async function validateDeployOptions(options: DeployOptions): Promise<void> {
  const result = DeployOptionsSchema.safeParse(options);
  if (!result.success) {
    const errors = result.error.errors.map((e) => e.message).join(", ");
    throw new Error(`Deploy options validation failed: ${errors}`);
  }

  // AWS credentials and profile validation
  try {
    const credentials = options.profile !== "default" ? await fromIni({ profile: options.profile }) : undefined;
    const stsClient = new STSClient({ region: options.region, credentials });

    const identity = await stsClient.send(new GetCallerIdentityCommand({}));

    // Validate that we have a proper AWS account ID
    if (!identity.Account || !identity.Arn) {
      throw new Error(`Unable to verify AWS identity for profile '${options.profile}'`);
    }
  } catch (error: any) {
    if (error.name === "ProfileNotFoundError" || error.name === "CredentialsProviderError") {
      throw new Error(`AWS profile '${options.profile}' not found or invalid credentials`);
    }
    if (error.name === "UnrecognizedClientException" || error.name === "InvalidClientTokenId") {
      throw new Error(`Invalid AWS credentials for profile '${options.profile}'`);
    }
    if (error.name === "AccessDenied" || error.name === "UnauthorizedOperation") {
      throw new Error(`AWS credentials for profile '${options.profile}' lack necessary permissions`);
    }
    if (error.name === "TokenRefreshRequired" || error.name === "ExpiredToken") {
      throw new Error(`AWS credentials for profile '${options.profile}' have expired. Please refresh your credentials`);
    }
    throw new Error(`AWS validation failed: ${error.message}`);
  }
}
