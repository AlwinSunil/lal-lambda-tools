# LAL Lambda Tools

A CLI tool for streamlined AWS Lambda development and deployment.

## Features

- ⚡ Rapid project creation with best-practice templates
- 🚀 Simplified deployment using AWS SAM CLI
- 🔄 Fetch existing Lambda functions for local development
- 🛠️ Multi-language support (Python, Node.js)

## Installation

```bash
# Install globally
npm install -g lal-lambda-tools

# Or use with npx (recommended)
npx lal-lambda-tools --help
```

## Usage

### Creating a Lambda Function Template

```bash
lal-lambda-tools create UserAuth
```

Options:
- `-l, --language <type>` - Language (python/nodejs)
- `-o, --output <dir>` - Output directory
- `--stack-name <name>` - Custom CloudFormation stack name
- `--layers <arns...>` - Layer ARNs to attach

### Deploying a Lambda Function

```bash
lal-lambda-tools deploy
```

Options:
- `-p, --profile <name>` - AWS CLI profile
- `-r, --region <region>` - AWS region
- `-f, --function-name <name>` - Override function name
- `-s, --status-only` - Check deployment status only

### Fetching an Existing Lambda Function

```bash
lal-lambda-tools fetch UserAuth
```

Options:
- `-p, --profile <name>` - AWS CLI profile
- `-r, --region <region>` - AWS region
- `-o, --output <dir>` - Output directory

## Requirements

- Node.js 18+
- AWS SAM CLI (for deployments)
- Valid AWS credentials
