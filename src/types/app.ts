import { Runtime } from "@aws-sdk/client-lambda";

export type SupportedLanguage = "python" | "nodejs";

export interface CreateOptions {
  language: SupportedLanguage;
  output: string;
  layers?: string[];
  stackName: string;
  role: string;
  profile: string;
  region: string;
}

export interface DeployOptions {
  profile: string;
  region: string;
  functionName?: string;
  role?: string;
  statusOnly?: boolean;
}

export interface FetchOptions {
  profile: string;
  region: string;
  output: string;
}

export interface UpgradeOptions {
  profile: string;
  region: string;
  targetRuntime: string; // e.g., "python3.12"
  all?: boolean; // upgrade all python functions found
  include?: string[]; // specific function names to upgrade
}

export interface SAMTemplate {
  AWSTemplateFormatVersion?: string;
  Transform?: string;
  Resources: Record<string, SAMResource>;
}

export interface SAMResource {
  Type: string;
  Properties?: {
    FunctionName?: string;
    Role?: string;
    CodeUri?: string;
    Handler?: string;
    Runtime?: Runtime;
    Timeout?: number;
    MemorySize?: number;
    Layers?: string[];
  };
}

export interface ParsedSAMTemplate {
  functionName: string;
  role?: string;
  codeUri: string;
  handler: string;
  runtime: Runtime;
  timeout: number;
  memorySize: number;
  layers?: string[];
}
