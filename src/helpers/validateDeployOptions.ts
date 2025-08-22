import { z } from "zod";

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

import { DeployOptions } from "../types/app";
import { DEFAULT_PROFILE, DEFAULT_REGION } from "../constants";

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
  // apply defaults similar to CLI: profile and region should have sensible defaults
  const optsWithDefaults = {
    profile: options.profile || DEFAULT_PROFILE,
    region: options.region || DEFAULT_REGION,
    functionName: options.functionName,
    role: options.role,
    statusOnly: options.statusOnly,
  };

  const result = DeployOptionsSchema.safeParse(optsWithDefaults);
  if (!result.success) {
    const errors = result.error.errors.map((e) => e.message).join(", ");
    throw new Error(`Deploy options validation failed: ${errors}`);
  }

  // AWS credentials and profile validation
  try {
    const profileToUse = optsWithDefaults.profile;
    const regionToUse = optsWithDefaults.region;
    const credentials = profileToUse !== DEFAULT_PROFILE ? await fromIni({ profile: profileToUse }) : undefined;
    const stsClient = new STSClient({ region: regionToUse, credentials });

    const identity = await stsClient.send(new GetCallerIdentityCommand({}));

    // Validate that we have a proper AWS account ID
    if (!identity.Account || !identity.Arn) {
      throw new Error(`Unable to verify AWS identity for profile '${options.profile}'`);
    }
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === "ProfileNotFoundError" || err.name === "CredentialsProviderError") {
      throw new Error(`AWS profile '${options.profile}' not found or invalid credentials`);
    }
    if (err.name === "UnrecognizedClientException" || err.name === "InvalidClientTokenId") {
      throw new Error(`Invalid AWS credentials for profile '${options.profile}'`);
    }
    if (err.name === "AccessDenied" || err.name === "UnauthorizedOperation") {
      throw new Error(`AWS credentials for profile '${options.profile}' lack necessary permissions`);
    }
    if (err.name === "TokenRefreshRequired" || err.name === "ExpiredToken") {
      throw new Error(`AWS credentials for profile '${options.profile}' have expired. Please refresh your credentials`);
    }
    throw new Error(`AWS validation failed: ${err.message}`);
  }
}
