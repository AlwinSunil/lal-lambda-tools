# LAL Lambda Tools

CLI tool for AWS Lambda development and deployment with template generation.

## Installation

```bash
npm install -g lal-lambda-tools
```

## Commands

### Create Template

Generate a Lambda function template with SAM configuration:

```bash
lal-lambda-tools create MyFunction --stack-name my-stack --role arn:aws:iam::123456789012:role/lambda-role
```

**Required Options:**

- `--stack-name` - CloudFormation stack name, can pass exisiting stack or pass a new name to create a new stack
- `--role` - IAM execution role ARN

**Optional:**

- `--language` - `python` (default) or `nodejs`
- `--output` - Output directory (default: current)
- `--profile` - AWS CLI profile (default: `default`)
- `--region` - AWS region (default: `us-east-2`)
- `--layers` - Layer ARNs to attach

### Deploy

Deploy Lambda function using AWS SAM:

```bash
lal-lambda-tools deploy
```

**Options:**

- `--profile` - AWS CLI profile (default: `default`)
- `--region` - AWS region (default: `us-east-2`)
- `--function-name` - Pass only if required to override function name from template.yml
- `--status-only` - Check deployment status only

**Requirements:** `template.yml` and AWS SAM CLI installed

### Fetch

Download existing Lambda function from AWS:

```bash
lal-lambda-tools fetch FunctionName
```

**Options:**

- `--profile` - AWS CLI profile (default: `default`)
- `--region` - AWS region (default: `us-east-2`)
- `--output` - Output directory (default: current)

Downloads function code and configuration for local development.

### Upgrade

Upgrade Lambda function runtimes in bulk (for example updating python3.9 -> python3.12).

```bash
lal-lambda-tools upgrade --target-runtime python3.12 --profile lal-devops
```

Options:

- `--target-runtime` (required) - target runtime string, e.g. `python3.12` or `nodejs20.x`
- `--profile` - AWS CLI profile to use (default: `default`)
- `--region` - AWS region to operate in (default: `us-east-2`)
- `--all` - upgrade all functions that match the runtime family (non-interactive)
- `--include` - comma-separated function names to include (non-interactive)
 - `--layer-arn` - replace existing Layers with this single Layer ARN during the upgrade

Behavior/Notes:

- Validates the provided `--target-runtime` format first and only supports the `python` and `nodejs` families.
- By default the command will prompt interactively to select functions to upgrade. Use `--all` or `--include` to run non-interactively.
- The command performs the `update-function-configuration --runtime` call and waits for each function's LastUpdateStatus to become `Successful` (or reports failures/timeouts).
- If `--layer-arn` is provided, the command also calls `update-function-configuration` with `--layers <ARN>`, which replaces all existing layers on the function with the specified layer. This runs even when the runtime is already on the target version (layer-only update).

Examples:

```bash
# Upgrade runtime and replace layers with a single provided layer ARN
lal-lambda-tools upgrade --target-runtime python3.12 --layer-arn arn:aws:lambda:us-east-2:123456789012:layer:my-layer:5

# Only replace layers (runtime already on target): still works
lal-lambda-tools upgrade --target-runtime python3.12 --include MyFn --layer-arn arn:aws:lambda:us-east-2:123456789012:layer:my-layer:5
```

### List Functions

List Lambda functions in the account/region, show runtime, attached layers, and last invocation time.

```bash
lal-lambda-tools list-functions --profile lal-devops --runtime python
```

Options:

- `--profile` - AWS CLI profile to use (default: `default`)
- `--region` - AWS region (default: `us-east-2`)
- `--runtime` - optional substring to filter runtimes (case-insensitive). Examples: `python`, `nodejs`, `python3.12`

Output:

- Prints a per-function list with name, runtime, attached layer ARNs, and the last time the function was invoked (relative time). Also prints a summary of unique layers and how many functions reference each.

### List Layers

Show only functions that have layers attached, filtered by runtime family (python/nodejs).

```bash
lal-lambda-tools list-layers --profile lal-devops --runtime python
```

Options:

- `--profile` - AWS CLI profile to use (default: `default`)
- `--region` - AWS region (default: `us-east-2`)
- `--runtime` - runtime family to filter by; accepts `python` or `nodejs` (defaults to `python`)

Behavior/Notes:

- `list-layers` focuses on functions that have layers attached and reports the unique layer ARNs and counts of functions using them. It also fetches the last invocation time to help prioritize maintenance.

## Requirements

- Node.js 22+
- AWS SAM CLI (for deployments)
- Valid AWS credentials
