import { exec } from "child_process";
import { promisify } from "util";

import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";

import { UpgradeOptions } from "../types/app";
import { validateDeployOptions } from "../helpers/validateDeployOptions";

const execPromise = promisify(exec);

// Small helper to run aws cli and return parsed JSON (when expected)
async function runAws<T = any>(command: string, expectJson = true): Promise<T | string> {
  const { stdout, stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
  if (stderr && stderr.trim().length > 0) {
    // aws sometimes writes progress to stderr; don't fail on it unless no stdout
    // we'll log it in verbose future; ignore for now
  }
  return expectJson ? (JSON.parse(stdout) as T) : stdout;
}

function buildBaseAws(prefix: string, profile: string, region: string | undefined): string {
  let cmd = prefix;
  if (region) cmd += ` --region ${region}`;
  if (profile) cmd += ` --profile ${profile}`;
  return cmd;
}

function getRuntimeFamily(rt?: string | null): string | null {
  if (!rt) return null;
  const s = rt.toLowerCase();
  // Common AWS Lambda runtime families
  // examples: python3.12, nodejs20.x, java11, dotnet6, ruby3.2, go1.x, provided.al2
  if (s.startsWith("python")) return "python";
  if (s.startsWith("nodejs")) return "nodejs";
  return s.split(/\d|\.|-/)[0] || s; // fallback: prefix before first digit/dot/hyphen
}

function isFamily(runtime: string | undefined, family: string): boolean {
  const f = getRuntimeFamily(runtime);
  return f === family;
}

// Extensible runtime validation: add new families with pattern and example
function validateAndGetRuntimeFamily(targetRuntime: string): string {
  const rules: Array<{ family: string; pattern: RegExp; example: string }> = [
    { family: "python", pattern: /^python3\.\d+$/, example: "python3.12" },
    { family: "nodejs", pattern: /^nodejs\d+\.x$/, example: "nodejs20.x" },
  ];

  const family = getRuntimeFamily(targetRuntime) || "unknown";

  // Only support families we have rules for
  const rule = rules.find((r) => r.family === family);
  if (!rule) {
    throw new Error(`Unsupported runtime '${targetRuntime}'. Only python and nodejs are supported.`);
  }

  if (!rule.pattern.test(targetRuntime)) {
    throw new Error(`Invalid target runtime '${targetRuntime}'. Expected ${rule.family} format like '${rule.example}'`);
  }

  return family;
}

async function waitForUpdate(
  name: string,
  profile: string,
  region: string | undefined,
  timeoutMs = 1 * 60 * 1000,
  initialIntervalMs = 1000,
  maxIntervalMs = 5000,
): Promise<{ status: string; reason?: string }> {
  const start = Date.now();
  let intervalMs = initialIntervalMs;
  while (Date.now() - start < timeoutMs) {
    const cmd = buildBaseAws(`aws lambda get-function-configuration --function-name ${name}`, profile, region);
    try {
      const cfg: any = await runAws<any>(cmd, true);
      const status: string = cfg.LastUpdateStatus || "Unknown";
      if (status === "Successful") return { status };
      if (status === "Failed") return { status, reason: cfg.LastUpdateStatusReason };
    } catch (e: any) {
      return { status: "Failed", reason: e?.message || String(e) };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    // exponential backoff: increase interval but cap at maxIntervalMs
    intervalMs = Math.min(Math.floor(intervalMs * 1.5), maxIntervalMs);
  }
  return { status: "Timeout", reason: `Waited ${Math.round(timeoutMs / 1000)}s` };
}

export async function upgradeRuntimes(options: UpgradeOptions): Promise<void> {
  const spinner = ora("Loading Lambda functions...").start();

  try {
    // Validate target runtime and get its family first (fail fast, avoid any AWS calls)
    const targetFamily = validateAndGetRuntimeFamily(options.targetRuntime);

    // Reuse existing validation for profile/region credentials
    await validateDeployOptions({ profile: options.profile, region: options.region });

    // 1) List functions with their runtimes via AWS CLI
    const listCmd =
      buildBaseAws(
        'aws lambda list-functions --query "Functions[].{Name:FunctionName, Runtime:Runtime}"',
        options.profile,
        options.region,
      ) + " --output json"; // force json for parsing

    const functions: Array<{ Name: string; Runtime?: string }> = (await runAws(listCmd)) as any;

    // Filter candidate functions by the selected family
    const candidateFunctions = functions.filter((f) => isFamily(f.Runtime, targetFamily));
    const runtimeByName = new Map<string, string>(
      candidateFunctions.map((f) => [f.Name, f.Runtime || "unknown"] as [string, string]),
    );

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
      const choices = candidateFunctions.map((f) => ({
        title: `${f.Name}  ${chalk.dim(`(${f.Runtime})`)}`,
        value: f.Name,
      }));

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
    const toUpgrade = selectedNames.filter((n) => (runtimeByName.get(n) || "").toLowerCase() !== targetLower);
    const alreadyTarget = selectedNames.filter((n) => !toUpgrade.includes(n));

    if (alreadyTarget.length > 0) {
      console.log(chalk.yellow("\nSkipping functions already at target runtime:"));
      alreadyTarget.forEach((n) => console.log(chalk.yellow(`  - ${n} (${runtimeByName.get(n)})`)));
    }

    if (toUpgrade.length === 0) {
      console.log(chalk.yellow("All selected functions already at the target runtime. Nothing to upgrade."));
      return;
    }

    console.log("\nPlanned upgrades:");
    toUpgrade.forEach((n) => {
      const from = runtimeByName.get(n) || "unknown";
      console.log(`  - ${n} (${from} -> ${options.targetRuntime})`);
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

      const fromRuntime = runtimeByName.get(name) || "unknown";
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
