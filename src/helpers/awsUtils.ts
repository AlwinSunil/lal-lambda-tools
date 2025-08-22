import { exec } from "child_process";
import { promisify } from "util";
import { formatDistanceToNow } from "date-fns";

// Internal exec promise with a larger buffer for AWS CLI outputs
const execPromise = promisify(exec);

// Run an AWS CLI command and optionally parse JSON output
export async function runAws<T = any>(command: string, expectJson = true): Promise<T | string> {
  const { stdout, stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
  if (stderr && stderr.trim().length > 0) {
    // AWS CLI can print warnings/progress to stderr; ignore unless exec throws
  }
  return expectJson ? (JSON.parse(stdout) as T) : stdout;
}

// Build a base AWS CLI command with optional region/profile
export function buildBaseAws(prefix: string, profile: string, region: string | undefined): string {
  let cmd = prefix;
  if (region) cmd += ` --region ${region}`;
  if (profile) cmd += ` --profile ${profile}`;
  return cmd;
}

// Get last invocation time for a Lambda function (display string + timestamp)
export async function getLastInvocation(
  name: string,
  profile: string,
  region: string | undefined,
): Promise<{ display: string; ts: number | null }> {
  try {
    const cmd = buildBaseAws(
      `aws logs describe-log-streams --log-group-name "/aws/lambda/${name}" --order-by LastEventTime --descending --max-items 1`,
      profile,
      region,
    );
    const result: any = await runAws(cmd, true);
    const lastEventTimestamp = result.logStreams?.[0]?.lastEventTimestamp;
    if (!lastEventTimestamp) return { display: "never", ts: null };
    const ts = Number(lastEventTimestamp) || null;
    const display = ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : "unknown";
    return { display, ts };
  } catch (err: any) {
    return { display: "unknown", ts: null };
  }
}

// Identify the runtime family from a runtime string
export function getRuntimeFamily(rt?: string | null): string | null {
  if (!rt) return null;
  const s = rt.toLowerCase();
  // Common AWS Lambda runtime families
  if (s.startsWith("python")) return "python";
  if (s.startsWith("nodejs")) return "nodejs";
  return s.split(/\d|\.|-/)[0] || s; // fallback: prefix before first digit/dot/hyphen
}

export function isFamily(runtime: string | undefined, family: string): boolean {
  const f = getRuntimeFamily(runtime);
  return f === family;
}

// Validate target runtime format and return its family
export function validateAndGetRuntimeFamily(targetRuntime: string): string {
  const rules: Array<{ family: string; pattern: RegExp; example: string }> = [
    { family: "python", pattern: /^python3\.\d+$/, example: "python3.12" },
    { family: "nodejs", pattern: /^nodejs\d+\.x$/, example: "nodejs20.x" },
  ];

  const family = getRuntimeFamily(targetRuntime) || "unknown";
  const rule = rules.find((r) => r.family === family);
  if (!rule) {
    throw new Error(`Unsupported runtime '${targetRuntime}'. Only python and nodejs are supported.`);
  }
  if (!rule.pattern.test(targetRuntime)) {
    throw new Error(`Invalid target runtime '${targetRuntime}'. Expected ${rule.family} format like '${rule.example}'`);
  }
  return family;
}

// Wait for a Lambda function configuration update to complete
export async function waitForUpdate(
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
    intervalMs = Math.min(Math.floor(intervalMs * 1.5), maxIntervalMs);
  }
  return { status: "Timeout", reason: `Waited ${Math.round(timeoutMs / 1000)}s` };
}
