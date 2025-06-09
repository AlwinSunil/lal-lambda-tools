# LAL Lambda Tools

CLI tool for creating and deploying AWS Lambda functions without CloudFormation overhead.

## Installation

```bash
# Install globally
npm install -g lal-lambda-tools

# Or use with npx (recommended)
npx lal-lambda-tools --help
```

## Quick Start

```bash
# Create Lambda template
npx lal-lambda-tools create my-function

# Deploy to AWS
cd my-function
npx lal-lambda-tools deploy
```
