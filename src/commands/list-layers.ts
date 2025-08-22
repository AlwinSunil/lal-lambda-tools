import chalk from "chalk";
import ora from "ora";

import { ListLayersOptions } from "../types/app";
import { validateDeployOptions } from "../helpers/validateDeployOptions";
import { buildBaseAws, getLastInvocation, getRuntimeFamily, isFamily, runAws } from "../helpers/awsUtils";

export async function listFunctionsWithLayers(options: ListLayersOptions): Promise<void> {
  const spinner = ora("Loading Lambda functions...").start();

  try {
    await validateDeployOptions({ profile: options.profile, region: options.region });

    const listCmd =
      buildBaseAws(
        'aws lambda list-functions --query "Functions[].{Name:FunctionName, Runtime:Runtime, Layers: Layers[].Arn}"',
        options.profile,
        options.region,
      ) + " --output json";

    const functions: Array<{ Name: string; Runtime?: string; Layers?: string[] }> = (await runAws(listCmd)) as any;

    // Compute totals and filter by runtime family
    const totalFunctions = functions.length;
    const allWithLayers = functions.filter((f) => Array.isArray(f.Layers) && f.Layers.length > 0);

    // Determine runtime filter. Default to 'python' if not provided.
    const requested = (options.runtime || "python").toLowerCase();
    const family = getRuntimeFamily(requested) || requested;

    // Only allow the families 'python' or 'nodejs' for this command
    if (family !== "python" && family !== "nodejs") {
      throw new Error(`Invalid runtime '${options.runtime}'. Use 'python' or 'nodejs'.`);
    }

    // Functions matching the requested runtime family
    const runtimeFunctions = functions.filter((f) => isFamily(f.Runtime, family));
    const runtimeWithLayers = runtimeFunctions.filter((f) => Array.isArray(f.Layers) && f.Layers.length > 0);

    // Print a clear summary line and proceed
    if (spinner.isSpinning) spinner.stop();
    console.log(
      chalk.green(
        `✔ ${totalFunctions} total; ${runtimeFunctions.length} ${family}; ${runtimeWithLayers.length} ${family} with layers (account-wide with layers: ${allWithLayers.length})`,
      ),
    );

    if (runtimeWithLayers.length === 0) {
      console.log(chalk.yellow(`No functions with layers found for runtime '${family}'.`));
      return;
    }

    // We'll list only runtime functions that have layers
    let withLayers = runtimeWithLayers;

    spinner.start("Fetching last invocation times...");

    const invocationPromises = withLayers.map(async (f) => ({
      name: f.Name,
      last: await getLastInvocation(f.Name, options.profile, options.region),
    }));

    const invocationData = await Promise.all(invocationPromises);
    const invocationByName = new Map(invocationData.map(({ name, last }) => [name, last]));

    // Sort by most recent invocation first
    withLayers.sort((a, b) => {
      const ta = invocationByName.get(a.Name)?.ts || 0;
      const tb = invocationByName.get(b.Name)?.ts || 0;
      return (tb || 0) - (ta || 0);
    });

    if (spinner.isSpinning) spinner.stop();

    if (withLayers.length === 0) {
      console.log(chalk.yellow("No functions with layers found."));
      return;
    }

    // Build rows for display and print as a per-function list (name, runtime, layers, last invoked)
    const rows: Array<{ name: string; runtime: string; layers: string[]; lastDisplay: string }> = withLayers.map((f) => ({
      name: f.Name,
      runtime: f.Runtime || "unknown",
      layers: Array.isArray(f.Layers) ? f.Layers : [],
      lastDisplay: invocationByName.get(f.Name)?.display || "unknown",
    }));

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

    // Show each unique layer and how many functions use it
    const sortedLayers = Array.from(layerCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [arn, count] of sortedLayers) {
      console.log(`  - ${arn}  (${count} function${count === 1 ? "" : "s"})`);
    }
  } catch (error: any) {
    spinner.fail(`Listing failed: ${error?.message || error}`);
    throw error;
  } finally {
    if (spinner.isSpinning) spinner.stop();
  }
}
