import fs from "fs/promises";
import fse from "fs-extra";
import path from "path";

import chalk from "chalk";
import { Liquid } from "liquidjs";
import ora from "ora";

import { SupportedLanguage } from "../types/app";

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/) // Split on hyphens, underscores, and spaces
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function generateResourceName(name: string): string {
  const pascalName = toPascalCase(name);
  if (pascalName.toLowerCase().endsWith("function")) {
    return pascalName;
  }
  return `${pascalName}Function`;
}

async function createTemplate(name: string, language: SupportedLanguage, output: string): Promise<void> {
  const spinner = ora("Creating Lambda template...").start();

  try {
    if (!["python", "nodejs"].includes(language)) {
      throw new Error('Language must be either "python" or "nodejs"');
    }

    const projectDir = path.join(output, name);

    await fse.ensureDir(projectDir);

    const engine = new Liquid({
      root: path.resolve(__dirname, "../templates"),
      extname: ".liquid",
    });

    spinner.text = "Creating function files...";

    if (language === "python") {
      const pythonContent = await engine.renderFile("lambda_function.py.liquid", { name, language });
      await fs.writeFile(path.join(projectDir, "lambda_function.py"), pythonContent);
    } else {
      const nodeContent = await engine.renderFile("index.js.liquid", { name, language });
      await fs.writeFile(path.join(projectDir, "index.js"), nodeContent);

      const packageJsonContent = await engine.renderFile("package.json.liquid", { name, language });
      await fs.writeFile(path.join(projectDir, "package.json"), packageJsonContent);
    }

    // Render template.yaml using Liquid
    const resourceName = generateResourceName(name);

    const templateContent = await engine.renderFile("template.yml.liquid", {
      resourceName,
      language,
    });
    await fs.writeFile(path.join(projectDir, "template.yaml"), templateContent);

    const gitignoreContent = await engine.renderFile("gitignore.liquid");
    await fs.writeFile(path.join(projectDir, ".gitignore"), gitignoreContent);

    const readmeContent = await engine.renderFile("README.md.liquid", { name, language });
    await fs.writeFile(path.join(projectDir, "README.md"), readmeContent);

    spinner.text = "Creating additional files...";
    spinner.succeed(chalk.green(`Lambda template '${name}' created successfully!`));

    console.log(`\n${chalk.blue("📁 Created files:")}`);
    console.log(`   ${projectDir}/`);
    console.log(`   ├── ${language === "python" ? "lambda_function.py" : "index.js"}`);
    if (language === "nodejs") {
      console.log("   ├── package.json");
    }
    console.log("   ├── template.yaml");
    console.log("   ├── .gitignore");
    console.log("   └── README.md");

    console.log(`\n${chalk.blue("🚀 Next steps:")}`);
    console.log(`   cd ${name}`);
    console.log("   npx lal-lambda-tools deploy");
  } catch (error) {
    spinner.fail("Failed to create Lambda template");
    throw error;
  }
}

export { createTemplate };
