import chalk from "chalk";
import ora from "ora";

import { ListFunctionsOptions } from "../types/app";
import { validateDeployOptions } from "../helpers/validateDeployOptions";
import { buildBaseAws, getLastInvocation, runAws } from "../helpers/awsUtils";

// Keep it simple: pull JSON from AWS CLI, optionally filter by runtime substring, and print a basic table.

export async function listFunctions(options: ListFunctionsOptions): Promise<void> {
  const spinner = ora("Loading Lambda functions...").start();
  try {
    await validateDeployOptions({ profile: options.profile, region: options.region });

    const query =
      'aws lambda list-functions --query "Functions[].{Name:FunctionName,Runtime:Runtime,Layers:Layers[].Arn,LastModified:LastModified}"';
    const cmd = buildBaseAws(query, options.profile, options.region) + " --output json";

    const functions: Array<{ Name: string; Runtime?: string; Layers?: string[]; LastModified?: string }> = (await runAws(
      cmd,
    )) as any;

    // Optional runtime filter: case-insensitive substring match (e.g., "python" or "nodejs")
    const rtFilter = options.runtime?.trim().toLowerCase();
    const filtered = rtFilter ? functions.filter((f) => (f.Runtime || "").toLowerCase().includes(rtFilter)) : functions;

    // Summary counts
    const totalFunctions = functions.length;
    if (rtFilter && rtFilter.length > 0) {
      if (spinner.isSpinning) spinner.stop();
      console.log(chalk.green(`✔ ${totalFunctions} total; ${filtered.length} matching '${options.runtime}'`));
    } else {
      if (spinner.isSpinning) spinner.stop();
      console.log(chalk.green(`✔ ${totalFunctions} total`));
    }

    if (filtered.length === 0) {
      console.log(chalk.yellow("No functions found."));
      return;
    }

    // use shared helper getLastInvocation from awsUtils

    spinner.start("Fetching last invocation times...");

    const invocationPromises = filtered.map(async (f) => ({
      name: f.Name,
      last: await getLastInvocation(f.Name, options.profile, options.region),
    }));

    const invocationData = await Promise.all(invocationPromises);
    const invocationByName = new Map(invocationData.map(({ name, last }) => [name, last]));

    // Sort filtered functions by most recent invocation first
    filtered.sort((a, b) => {
      const ta = invocationByName.get(a.Name)?.ts || 0;
      const tb = invocationByName.get(b.Name)?.ts || 0;
      return (tb || 0) - (ta || 0);
    });

    if (spinner.isSpinning) spinner.stop();

    // Build rows for display
    const rows = filtered.map((f) => ({
      name: f.Name,
      runtime: f.Runtime || "unknown",
      layers: Array.isArray(f.Layers) ? f.Layers : [],
      lastDisplay: invocationByName.get(f.Name)?.display || "unknown",
    }));

    // Print as a list (similar style to list-layers)
    console.log();
    for (const r of rows) {
      console.log(`${chalk.cyan.bold("• " + r.name)} ${chalk.dim("(")}${chalk.yellow(r.runtime)}${chalk.dim(")")}`);
      console.log(`${chalk.gray("  Layers:")} ${r.layers.length ? chalk.white(r.layers.join(", ")) : chalk.dim("none")}`);
      console.log(`${chalk.gray("  Last Invoked:")} ${chalk.white(r.lastDisplay)}`);
      console.log();
    }

    // Summary of unique layers and counts
    const layerCounts = new Map<string, number>();
    for (const r of rows) {
      for (const arn of r.layers) {
        const prev = layerCounts.get(arn) || 0;
        layerCounts.set(arn, prev + 1);
      }
    }

    console.log();
    console.log(chalk.bold(`Unique layers: ${layerCounts.size}`));
    const sortedLayers = Array.from(layerCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [arn, count] of sortedLayers) {
      console.log(`  - ${arn}  (${count} function${count === 1 ? "" : "s"})`);
    }
  } catch (error: any) {
    spinner.fail(`Listing failed: ${error?.message || error}`);
    throw error;
  }
}
