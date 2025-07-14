import { Runtime } from "@aws-sdk/client-lambda";

export type SupportedLanguage = "python" | "nodejs";

export interface CreateOptions {
  language: SupportedLanguage;
  output: string;
  layers?: string[];
  stackName: string;
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

export interface SAMTemplate {
  AWSTemplateFormatVersion?: string;
  Transform?: string;
  Resources: Record<string, SAMResource>;
}

export interface SAMResource {
  Type: string;
  Properties?: {
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
  runtime: Runtime;
  handler: string;
  timeout: number;
  memorySize: number;
  codeUri: string;
  layers?: string[];
}