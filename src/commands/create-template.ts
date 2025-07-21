#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

import chalk from "chalk";
import fse from "fs-extra";
import { Liquid } from "liquidjs";
import ora from "ora";
import { z } from "zod";

import { generateResourceName } from "../helpers/generateResourceName";
import { SupportedLanguage } from "../types/app";

// Zod schema for create template validation
const CreateTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Function name is required")
    .max(64, "Function name cannot exceed 64 characters")
    .regex(/^[A-Z][A-Za-z0-9]*$/, "Function name must be PascalCase as it will be used as a resource name in template.yml"),
  language: z.enum(["python", "nodejs"], {
    errorMap: () => ({ message: 'Language must be either "python" or "nodejs"' }),
  }),
  output: z
    .string()
    .min(1, "Output directory is required")
    .refine((path) => !path.includes(".."), "Output path cannot contain '..' for security reasons"),
  layers: z.array(z.string()).optional(),
  stackName: z.string().min(1, "Stack name is required"),
  role: z.string().optional(),
});

async function createTemplate(
  name: string,
  language: SupportedLanguage,
  output: string,
  stackName: string,
  layers?: string[],
  role?: string,
): Promise<void> {
  // Validate inputs using Zod schema
  const validationResult = CreateTemplateSchema.safeParse({
    name: name?.trim(),
    language,
    output,
    layers,
    stackName,
    role,
  });

  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map((err) => err.message);
    throw new Error(`Validation failed: ${errorMessages.join(", ")}`);
  }

  const {
    name: validatedName,
    language: validatedLanguage,
    output: validatedOutput,
    layers: validatedLayers,
    stackName: validatedStackName,
    role: validatedRole,
  } = validationResult.data;
  const projectDir = path.resolve(validatedOutput, validatedName);

  // Check if directory already exists
  const dirExists = await fse.pathExists(projectDir);
  if (dirExists) {
    const dirStat = await fse.stat(projectDir);
    if (dirStat.isDirectory()) {
      const dirContents = await fse.readdir(projectDir);
      if (dirContents.length > 0) {
        throw new Error(`Directory '${projectDir}' already exists and is not empty`);
      }
    } else {
      throw new Error(`A file with the name '${validatedName}' already exists at the specified location`);
    }
  }

  const spinner = ora("Creating Lambda template...").start();

  try {
    await fse.ensureDir(projectDir);

    const templateRoot = path.resolve(__dirname, "../templates");
    const templatesExist = await fse.pathExists(templateRoot);
    if (!templatesExist) {
      throw new Error(`Template directory not found at: ${templateRoot}`);
    }

    spinner.text = "Creating function files...";

    const engine = new Liquid({
      root: templateRoot,
      extname: ".liquid",
    });

    try {
      if (validatedLanguage === "python") {
        const pythonContent = await engine.renderFile("lambda_function.py.liquid", {
          name: validatedName,
          language: validatedLanguage,
        });
        await fs.writeFile(path.join(projectDir, "lambda_function.py"), pythonContent);
      }

      if (validatedLanguage === "nodejs") {
        const nodeContent = await engine.renderFile("index.js.liquid", {
          name: validatedName,
          language: validatedLanguage,
        });
        await fs.writeFile(path.join(projectDir, "index.js"), nodeContent);

        const packageJsonContent = await engine.renderFile("package.json.liquid", {
          name: validatedName,
          language: validatedLanguage,
        });
        await fs.writeFile(path.join(projectDir, "package.json"), packageJsonContent);
      }

      const resourceName = generateResourceName(validatedName);

      const templateContent = await engine.renderFile("template.yml.liquid", {
        resourceName,
        language: validatedLanguage,
        layers: validatedLayers,
        role: validatedRole,
      });
      await fs.writeFile(path.join(projectDir, "template.yml"), templateContent);

      const gitignoreContent = await engine.renderFile("gitignore.liquid");
      await fs.writeFile(path.join(projectDir, ".gitignore"), gitignoreContent);

      const readmeContent = await engine.renderFile("README.md.liquid", {
        name: validatedName,
        language: validatedLanguage,
      });
      await fs.writeFile(path.join(projectDir, "README.md"), readmeContent);

      const samconfigContent = await engine.renderFile("samconfig.toml.liquid", {
        stackName: validatedStackName,
        s3Prefix: validatedName,
        region: "us-east-2",
        profile: "lal-devops",
      });
      await fs.writeFile(path.join(projectDir, "samconfig.toml"), samconfigContent);
    } catch (fileError) {
      try {
        await fse.remove(projectDir);
      } catch (cleanupError) {
        console.warn(chalk.yellow(`Warning: Failed to clean up directory after error: ${cleanupError}`));
      }
      throw new Error(`Failed to create template files: ${fileError}`);
    }

    spinner.text = "Finalizing template creation...";
    spinner.succeed(chalk.green(`Lambda template '${validatedName}' created successfully!`));

    // Success output - controlled and structured
    console.log(`\n${chalk.blue("📁 Created files:")}`);
    console.log(`   ${projectDir}/`);
    console.log(`   ├── ${validatedLanguage === "python" ? "lambda_function.py" : "index.js"}`);
    if (validatedLanguage === "nodejs") {
      console.log("   ├── package.json");
    }
    console.log("   ├── template.yml");
    console.log("   ├── samconfig.toml");
    console.log("   ├── .gitignore");
    console.log("   └── README.md");

    console.log(`\n${chalk.blue("🚀 Next steps:")}`);
    console.log(`   cd ${validatedName}`);
    console.log("   npx lal-lambda-tools deploy");
  } catch (error) {
    spinner.fail("Failed to create Lambda template");
    throw error;
  }
}

export { createTemplate };
