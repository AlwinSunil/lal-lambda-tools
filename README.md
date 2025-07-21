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

## Requirements

- Node.js 18+
- AWS SAM CLI (for deployments)
- Valid AWS credentials
