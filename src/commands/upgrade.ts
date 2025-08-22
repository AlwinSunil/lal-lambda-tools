import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";

import { UpgradeOptions } from "../types/app";
import { validateDeployOptions } from "../helpers/validateDeployOptions";
import {
  buildBaseAws,
  getLastInvocation,
  getRuntimeFamily,
  isFamily,
  runAws,
  validateAndGetRuntimeFamily,
  waitForUpdate,
} from "../helpers/awsUtils";

export async function upgradeRuntimes(options: UpgradeOptions): Promise<void> {
  const spinner = ora("Loading Lambda functions...").start();

  try {
    // Validate target runtime and get its family first (fail fast, avoid any AWS calls)
    const targetFamily = validateAndGetRuntimeFamily(options.targetRuntime);

    // Reuse existing validation for profile/region credentials
    await validateDeployOptions({ profile: options.profile, region: options.region });

    // 1) List functions with their runtimes and Layers via AWS CLI
    const listCmd =
      buildBaseAws(
        'aws lambda list-functions --query "Functions[].{Name:FunctionName, Runtime:Runtime, Layers: Layers[].Arn}"',
        options.profile,
        options.region,
      ) + " --output json"; // force json for parsing

    const functions: Array<{ Name: string; Runtime?: string; Layers?: string[] }> = (await runAws(listCmd)) as any;

    // Filter candidate functions by the selected family
    const candidateFunctions = functions.filter((f) => isFamily(f.Runtime, targetFamily));

    // Build a map of runtime + layers from the initial list result (no extra AWS calls)
    const infoByName = new Map<string, { runtime: string; layers: string[] }>();
    for (const f of candidateFunctions) {
      const runtime = f.Runtime || "unknown";
      const layers = Array.isArray(f.Layers) ? f.Layers : [];
      infoByName.set(f.Name, { runtime, layers });
    }

    spinner.text = "Fetching last invocation times...";

    // Get last invocation times for all candidate functions (returns display + timestamp)
    const invocationPromises = candidateFunctions.map(async (f) => ({
      name: f.Name,
      last: await getLastInvocation(f.Name, options.profile, options.region),
    }));

    const invocationData = await Promise.all(invocationPromises);
    const invocationByName = new Map(invocationData.map(({ name, last }) => [name, last]));

    // Sort candidateFunctions by most recent invocation first (null timestamps go to the end)
    candidateFunctions.sort((a, b) => {
      const ta = invocationByName.get(a.Name)?.ts || 0;
      const tb = invocationByName.get(b.Name)?.ts || 0;
      return (tb || 0) - (ta || 0);
    });

    spinner.succeed(chalk.green(`Found ${functions.length} functions, ${candidateFunctions.length} ${targetFamily} functions`));

    if (candidateFunctions.length === 0) {
      console.log(chalk.yellow(`No ${targetFamily} functions found to upgrade in this account/region.`));
      return;
    }

    // 2) Determine selection mode
    let selectedNames: string[] = [];

    if (options.all) {
      selectedNames = candidateFunctions.map((f) => f.Name);
    } else if (options.include && options.include.length > 0) {
      const set = new Set(options.include);
      selectedNames = candidateFunctions.filter((f) => set.has(f.Name)).map((f) => f.Name);
      const missing = options.include.filter((n) => !selectedNames.includes(n));
      if (missing.length) {
        console.log(chalk.yellow(`Skipping unknown or non-${targetFamily} functions: ${missing.join(", ")}`));
      }
    } else {
      // Interactive multi-select with prompts (checkbox)
      const choices = candidateFunctions.map((f) => {
        const info = infoByName.get(f.Name) || { runtime: "unknown", layers: [] };
        const layersText = info.layers.length ? `, layers: ${info.layers.join(", ")}` : "";
        const last = invocationByName.get(f.Name) || { display: "unknown", ts: null };

        return {
          title: `${f.Name} ${chalk.dim(`(last: ${last.display}, ${info.runtime}${layersText})`)}`,
          value: f.Name,
        };
      });

      const { picked } = await prompts(
        {
          type: "autocompleteMultiselect",
          name: "picked",
          message: `Select functions to upgrade to ${options.targetRuntime}`,
          hint: "Use arrow keys to navigate, space to select, enter to confirm",
          instructions: false,
          choices,
        } as any,
        {
          onCancel: () => {
            console.log(chalk.yellow("Selection cancelled."));
            process.exit(0);
          },
        },
      );

      selectedNames = picked || [];
    }

    if (selectedNames.length === 0) {
      console.log(chalk.yellow("No functions selected. Nothing to upgrade."));
      return;
    }

    // Filter out functions already on the target runtime
    const targetLower = options.targetRuntime.toLowerCase();
    const toUpgrade = selectedNames.filter((n) => ((infoByName.get(n)?.runtime || "") as string).toLowerCase() !== targetLower);
    const alreadyTarget = selectedNames.filter((n) => !toUpgrade.includes(n));

    if (alreadyTarget.length > 0) {
      console.log(chalk.yellow("\nSkipping functions already at target runtime:"));
      alreadyTarget.forEach((n) => {
        const info = infoByName.get(n) || { runtime: "unknown", layers: [] };
        const layersText = info.layers && info.layers.length ? `, layers: ${info.layers.join(", ")}` : "";
        console.log(chalk.yellow(`  - ${n} (${info.runtime}${layersText})`));
      });
    }

    if (toUpgrade.length === 0) {
      console.log(chalk.yellow("All selected functions already at the target runtime. Nothing to upgrade."));
      return;
    }

    console.log("\nPlanned upgrades:");
    toUpgrade.forEach((n) => {
      const info = infoByName.get(n) || { runtime: "unknown", layers: [] };
      const layersText = info.layers && info.layers.length ? `, layers: ${info.layers.join(", ")}` : "";
      console.log(`  - ${n} (${info.runtime}${layersText} -> ${options.targetRuntime})`);
    });

    // 3) Confirm (interactive only)
    {
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: "Proceed with these updates?",
        initial: true,
      });
      if (!confirm) {
        console.log("Aborted.");
        return;
      }
    }

    // 4) Perform updates sequentially (clear output per function)
    const results: { name: string; ok: boolean; message?: string }[] = [];

    for (const name of toUpgrade) {
      const updateCmd = buildBaseAws(
        `aws lambda update-function-configuration --function-name ${name} --runtime ${options.targetRuntime}`,
        options.profile,
        options.region,
      );

      const fromRuntime = infoByName.get(name)?.runtime || "unknown";
      console.log(chalk.cyan(`\nUpdating ${name} (${fromRuntime} -> ${options.targetRuntime}) ...`));
      try {
        const json = (await runAws<any>(updateCmd, true)) as any;
        // Wait by default until the update completes
        const wait = await waitForUpdate(name, options.profile, options.region);
        const status = wait.status;
        if (wait.reason && status !== "Successful") {
          console.log(chalk.red(`  ↳ Reason: ${wait.reason}`));
        }
        // concise per-item status for DX
        const ok = status === "Successful";
        const line = ok
          ? chalk.green(`✔ ${json.FunctionName} -> ${json.Runtime} (${status})`)
          : chalk.red(`✖ ${json.FunctionName} -> ${json.Runtime} (${status})`);
        console.log(line);
        results.push({ name, ok });
      } catch (err: any) {
        console.log(chalk.red(`Failed updating ${name}: ${err?.message || err}`));
        results.push({ name, ok: false, message: err?.message || String(err) });
      }
    }

    // 5) Summary
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    console.log("\nSummary:");
    console.log(chalk.green(`  ✅ Success: ${ok}`));
    console.log(chalk.red(`  ❌ Failed: ${fail}`));
    if (alreadyTarget.length > 0) {
      console.log(chalk.yellow(`  ⏭️  Skipped (already on target): ${alreadyTarget.length}`));
    }

    if (fail > 0) {
      for (const r of results.filter((x) => !x.ok)) {
        console.log(`   - ${r.name}: ${r.message}`);
      }
    }
  } catch (error: any) {
    spinner.fail(`Upgrade failed: ${error?.message || error}`);
    throw error;
  } finally {
    if (spinner.isSpinning) spinner.stop();
  }
}
