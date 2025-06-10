import { z } from "zod";

// Define supported runtimes for validation
const supportedRuntimes = [
  "nodejs18.x",
  "nodejs20.x",
  "nodejs22.x",
  "python3.9",
  "python3.10",
  "python3.11",
  "python3.12",
] as const;

// Zod schema for SAM template validation
const SAMResourcePropertiesSchema = z.object({
  CodeUri: z.string().min(1, "CodeUri is required and cannot be empty"),
  Handler: z.string().min(1, "Handler is required and cannot be empty"),
  Runtime: z.enum(supportedRuntimes, {
    errorMap: () => ({ message: `Runtime must be one of: ${supportedRuntimes.join(", ")}` }),
  }),
  Timeout: z
    .number()
    .int("Timeout must be an integer")
    .min(1, "Timeout must be at least 1 second")
    .max(900, "Timeout cannot exceed 900 seconds (15 minutes)"),
  MemorySize: z
    .number()
    .int("MemorySize must be an integer")
    .min(128, "MemorySize must be at least 128 MB")
    .max(10240, "MemorySize cannot exceed 10240 MB")
    .refine((val) => val % 64 === 0, "MemorySize must be a multiple of 64 MB"),
});

const SAMResourceSchema = z.object({
  Type: z.literal("AWS::Serverless::Function", {
    errorMap: () => ({ message: "Resource Type must be AWS::Serverless::Function" }),
  }),
  Properties: SAMResourcePropertiesSchema,
});

const SAMTemplateSchema = z.object({
  AWSTemplateFormatVersion: z.string().optional(),
  Transform: z.string().optional(),
  Resources: z
    .record(z.string(), SAMResourceSchema)
    .refine((resources) => Object.keys(resources).length > 0, "At least one resource is required")
    .refine((resources) => {
      const lambdaFunctions = Object.values(resources).filter((resource) => resource.Type === "AWS::Serverless::Function");
      return lambdaFunctions.length > 0;
    }, "At least one AWS::Serverless::Function resource is required"),
});

export interface ValidationError {
  path: string;
  message: string;
}

export function validateTemplate(template: unknown): ValidationError[] {
  const result = SAMTemplateSchema.safeParse(template);

  if (result.success) {
    return [];
  }

  return result.error.errors.map((error) => ({
    path: error.path.length > 0 ? error.path.join(".") : "root",
    message: error.message,
  }));
}

export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return "";

  const errorMessages = errors.map((error) => `• ${error.path}: ${error.message}`);
  return `Template validation failed:\n${errorMessages.join("\n")}`;
}

export function isValidTemplate(template: unknown): template is z.infer<typeof SAMTemplateSchema> {
  return SAMTemplateSchema.safeParse(template).success;
}

export function getValidationSchema() {
  return SAMTemplateSchema;
}

export { SAMTemplateSchema };
