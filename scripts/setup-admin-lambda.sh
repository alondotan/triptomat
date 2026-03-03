#!/bin/bash
# Setup script for triptomat-admin Lambda infrastructure
# Run once to create all required AWS resources
# Prerequisites: AWS CLI configured with 'triptomat' profile, Docker running
#
# Usage: bash scripts/setup-admin-lambda.sh
#
# This script is idempotent — it checks for existing resources before creating.
# On Windows/MSYS, it uses MSYS_NO_PATHCONV=1 for paths starting with '/'.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

REGION="eu-central-1"
ACCOUNT_ID="664923616128"
PROFILE="triptomat"
FUNCTION_NAME="triptomat-admin"
ECR_REPO="triptomat-admin"
ROLE_NAME="triptomat-admin-role"
API_ID="9hhwxodv7a"
POLICY_FILE="lambda_admin/iam-policy.json"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPO}:latest"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# ──────────────────────────────────────────────────────────────────────────────
# Helper functions
# ──────────────────────────────────────────────────────────────────────────────

log() { echo -e "\n==> $1"; }
ok()  { echo "    [OK] $1"; }
skip() { echo "    [SKIP] $1 (already exists)"; }
fail() { echo "    [FAIL] $1" >&2; exit 1; }

# ──────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ──────────────────────────────────────────────────────────────────────────────

log "Pre-flight checks"

if ! command -v aws &>/dev/null; then
    fail "AWS CLI not found. Install it first."
fi

if ! command -v docker &>/dev/null; then
    fail "Docker not found. Install it first."
fi

if ! aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    fail "AWS credentials not configured for profile '$PROFILE'."
fi

if [ ! -f "$POLICY_FILE" ]; then
    fail "IAM policy file not found at $POLICY_FILE. Run from the project root."
fi

ok "All pre-flight checks passed"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: Generate admin token
# ──────────────────────────────────────────────────────────────────────────────

log "Step 1: Generating secure admin API token"

ADMIN_TOKEN=$(openssl rand -base64 32)
ok "Admin token generated"

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Create ECR repository
# ──────────────────────────────────────────────────────────────────────────────

log "Step 2: Creating ECR repository '${ECR_REPO}'"

if aws ecr describe-repositories \
    --repository-names "$ECR_REPO" \
    --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    skip "ECR repository '${ECR_REPO}'"
else
    aws ecr create-repository \
        --repository-name "$ECR_REPO" \
        --profile "$PROFILE" --region "$REGION" \
        --output text --query 'repository.repositoryUri'
    ok "ECR repository '${ECR_REPO}' created"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Step 3: Create IAM role with trust policy
# ──────────────────────────────────────────────────────────────────────────────

log "Step 3: Creating IAM role '${ROLE_NAME}'"

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

if aws iam get-role --role-name "$ROLE_NAME" \
    --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    skip "IAM role '${ROLE_NAME}'"
else
    MSYS_NO_PATHCONV=1 aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --description "IAM role for triptomat-admin Lambda function" \
        --profile "$PROFILE" --region "$REGION" \
        --output text --query 'Role.Arn'
    ok "IAM role '${ROLE_NAME}' created"

    # Wait for role to propagate (IAM is eventually consistent)
    echo "    Waiting for IAM role to propagate..."
    sleep 10
fi

# Attach the custom policy from the policy file
log "Step 3a: Attaching custom IAM policy"

CUSTOM_POLICY_NAME="${FUNCTION_NAME}-policy"

if aws iam get-policy \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}" \
    --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    # Policy exists — update it with a new version
    # First, check how many versions exist (max 5). Delete oldest non-default if needed.
    VERSIONS=$(aws iam list-policy-versions \
        --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}" \
        --profile "$PROFILE" --region "$REGION" \
        --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text)

    VERSION_COUNT=$(echo "$VERSIONS" | wc -w)
    if [ "$VERSION_COUNT" -ge 4 ]; then
        OLDEST=$(echo "$VERSIONS" | tr '\t' '\n' | tail -1)
        MSYS_NO_PATHCONV=1 aws iam delete-policy-version \
            --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}" \
            --version-id "$OLDEST" \
            --profile "$PROFILE" --region "$REGION"
    fi

    MSYS_NO_PATHCONV=1 aws iam create-policy-version \
        --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}" \
        --policy-document "file://${POLICY_FILE}" \
        --set-as-default \
        --profile "$PROFILE" --region "$REGION" > /dev/null
    ok "Custom policy '${CUSTOM_POLICY_NAME}' updated"
else
    MSYS_NO_PATHCONV=1 aws iam create-policy \
        --policy-name "$CUSTOM_POLICY_NAME" \
        --policy-document "file://${POLICY_FILE}" \
        --description "Permissions for triptomat-admin Lambda" \
        --profile "$PROFILE" --region "$REGION" > /dev/null
    ok "Custom policy '${CUSTOM_POLICY_NAME}' created"
fi

# Attach custom policy to role (idempotent — no error if already attached)
MSYS_NO_PATHCONV=1 aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}" \
    --profile "$PROFILE" --region "$REGION"
ok "Custom policy attached to role"

# Attach basic Lambda execution role (for CloudWatch Logs)
log "Step 3b: Attaching AWSLambdaBasicExecutionRole"

MSYS_NO_PATHCONV=1 aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
    --profile "$PROFILE" --region "$REGION"
ok "AWSLambdaBasicExecutionRole attached"

# ──────────────────────────────────────────────────────────────────────────────
# Step 4: Build and push Docker image
# ──────────────────────────────────────────────────────────────────────────────

log "Step 4: Building Docker image"

docker build --provenance=false \
    -t "${FUNCTION_NAME}" \
    -f lambda_admin/Dockerfile .
ok "Docker image built"

docker tag "${FUNCTION_NAME}:latest" "${IMAGE_URI}"
ok "Docker image tagged as ${IMAGE_URI}"

log "Step 4a: Pushing Docker image to ECR"

aws ecr get-login-password --region "$REGION" --profile "$PROFILE" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"
ok "ECR login successful"

docker push "${IMAGE_URI}"
ok "Docker image pushed to ECR"

# ──────────────────────────────────────────────────────────────────────────────
# Step 5: Look up SQS queue URLs
# ──────────────────────────────────────────────────────────────────────────────

log "Step 5: Looking up SQS queue URLs"

SQS_DOWNLOAD_QUEUE_URL=$(aws sqs get-queue-url \
    --queue-name "triptomat-download-queue" \
    --profile "$PROFILE" --region "$REGION" \
    --query 'QueueUrl' --output text)
ok "Download queue: ${SQS_DOWNLOAD_QUEUE_URL}"

SQS_ANALYSIS_QUEUE_URL=$(aws sqs get-queue-url \
    --queue-name "triptomat-analysis-queue" \
    --profile "$PROFILE" --region "$REGION" \
    --query 'QueueUrl' --output text)
ok "Analysis queue: ${SQS_ANALYSIS_QUEUE_URL}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 6: Create Lambda function
# ──────────────────────────────────────────────────────────────────────────────

log "Step 6: Creating Lambda function '${FUNCTION_NAME}'"

# Build environment variables as JSON (using JSON format to handle commas in values)
ENV_VARS_JSON=$(cat <<ENVEOF
{
  "Variables": {
    "ADMIN_API_TOKEN": "${ADMIN_TOKEN}",
    "DYNAMODB_TABLE": "triptomat-cache",
    "S3_BUCKET_MEDIA": "triptomat-media",
    "S3_BUCKET_EMAILS": "triptomat-raw-emails",
    "SQS_DOWNLOAD_QUEUE_URL": "${SQS_DOWNLOAD_QUEUE_URL}",
    "SQS_ANALYSIS_QUEUE_URL": "${SQS_ANALYSIS_QUEUE_URL}",
    "SUPABASE_URL": "https://aqpzhflzsqkjceeeufyf.supabase.co",
    "SUPABASE_SERVICE_KEY": "PLACEHOLDER_SET_VIA_CONSOLE",
    "ALLOWED_ORIGINS": "https://frontend-three-omega-84.vercel.app,https://aqpzhflzsqkjceeeufyf.supabase.co,http://localhost:5173"
  }
}
ENVEOF
)

if aws lambda get-function --function-name "$FUNCTION_NAME" \
    --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    skip "Lambda function '${FUNCTION_NAME}'"
    echo "    Updating function code instead..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --image-uri "$IMAGE_URI" \
        --profile "$PROFILE" --region "$REGION" > /dev/null
    ok "Lambda function code updated"
else
    MSYS_NO_PATHCONV=1 aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --package-type Image \
        --code "ImageUri=${IMAGE_URI}" \
        --role "$ROLE_ARN" \
        --timeout 30 \
        --memory-size 512 \
        --environment "$ENV_VARS_JSON" \
        --profile "$PROFILE" --region "$REGION" > /dev/null
    ok "Lambda function '${FUNCTION_NAME}' created"

    # Wait for function to become Active
    echo "    Waiting for function to become Active..."
    aws lambda wait function-active-v2 \
        --function-name "$FUNCTION_NAME" \
        --profile "$PROFILE" --region "$REGION"
    ok "Lambda function is Active"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Step 7: Set up API Gateway routes
# ──────────────────────────────────────────────────────────────────────────────

log "Step 7: Creating API Gateway integration"

# Check if an integration for this Lambda already exists
EXISTING_INTEGRATIONS=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --profile "$PROFILE" --region "$REGION" \
    --query "Items[?contains(IntegrationUri, '${FUNCTION_NAME}')].IntegrationId" \
    --output text)

if [ -n "$EXISTING_INTEGRATIONS" ] && [ "$EXISTING_INTEGRATIONS" != "None" ]; then
    INTEGRATION_ID=$(echo "$EXISTING_INTEGRATIONS" | head -1)
    skip "API Gateway integration (ID: ${INTEGRATION_ID})"
else
    LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "$LAMBDA_ARN" \
        --payload-format-version "2.0" \
        --profile "$PROFILE" --region "$REGION" \
        --query 'IntegrationId' --output text)
    ok "Integration created (ID: ${INTEGRATION_ID})"
fi

log "Step 7a: Creating API Gateway routes"

TARGET="integrations/${INTEGRATION_ID}"

for METHOD in GET POST DELETE OPTIONS; do
    ROUTE_KEY="${METHOD} /admin/{proxy+}"

    # Check if route already exists
    EXISTING_ROUTE=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --profile "$PROFILE" --region "$REGION" \
        --query "Items[?RouteKey=='${ROUTE_KEY}'].RouteId" \
        --output text)

    if [ -n "$EXISTING_ROUTE" ] && [ "$EXISTING_ROUTE" != "None" ]; then
        skip "Route '${ROUTE_KEY}'"
    else
        aws apigatewayv2 create-route \
            --api-id "$API_ID" \
            --route-key "$ROUTE_KEY" \
            --target "$TARGET" \
            --profile "$PROFILE" --region "$REGION" > /dev/null
        ok "Route '${ROUTE_KEY}' created"
    fi
done

log "Step 7b: Adding Lambda invoke permission for API Gateway"

# Add permission for API Gateway to invoke the Lambda (idempotent via statement ID)
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/admin/{proxy+}"

MSYS_NO_PATHCONV=1 aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "apigateway-admin-invoke" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "$SOURCE_ARN" \
    --profile "$PROFILE" --region "$REGION" 2>/dev/null || \
    skip "Lambda invoke permission (statement already exists)"

log "Step 7c: Deploying API Gateway"

aws apigatewayv2 create-deployment \
    --api-id "$API_ID" \
    --profile "$PROFILE" --region "$REGION" > /dev/null 2>&1 || true

# For HTTP APIs with auto-deploy, the $default stage updates automatically.
# If using a manual stage, update it here:
aws apigatewayv2 update-stage \
    --api-id "$API_ID" \
    --stage-name '$default' \
    --profile "$PROFILE" --region "$REGION" > /dev/null 2>&1 || true
ok "API Gateway deployed"

# ──────────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────────

API_ENDPOINT="https://${API_ID}.execute-api.${REGION}.amazonaws.com"

echo ""
echo "============================================================"
echo "  triptomat-admin Lambda — Setup Complete"
echo "============================================================"
echo ""
echo "  Resources created:"
echo "    ECR repository:  ${ECR_REGISTRY}/${ECR_REPO}"
echo "    IAM role:        ${ROLE_ARN}"
echo "    IAM policy:      arn:aws:iam::${ACCOUNT_ID}:policy/${CUSTOM_POLICY_NAME}"
echo "    Lambda function: ${FUNCTION_NAME}"
echo "    API endpoint:    ${API_ENDPOINT}/admin/{path}"
echo ""
echo "  API Gateway routes:"
echo "    GET    /admin/{proxy+}"
echo "    POST   /admin/{proxy+}"
echo "    DELETE /admin/{proxy+}"
echo "    OPTIONS /admin/{proxy+}"
echo ""
echo "============================================================"
echo "  ADMIN API TOKEN (save this securely!):"
echo "  ${ADMIN_TOKEN}"
echo "============================================================"
echo ""
echo "  Next steps:"
echo "    1. Set SUPABASE_SERVICE_KEY on the Lambda (via AWS Console or CLI):"
echo "       aws lambda update-function-configuration \\"
echo "         --function-name ${FUNCTION_NAME} \\"
echo "         --environment 'Variables={...,SUPABASE_SERVICE_KEY=your_key}' \\"
echo "         --profile ${PROFILE} --region ${REGION}"
echo ""
echo "    2. Add to frontend/.env:"
echo "       VITE_ADMIN_API_TOKEN=${ADMIN_TOKEN}"
echo "       VITE_ADMIN_API_URL=${API_ENDPOINT}/admin"
echo ""
echo "    3. Test the endpoint:"
echo "       curl -H 'Authorization: Bearer ${ADMIN_TOKEN}' \\"
echo "         ${API_ENDPOINT}/admin/health"
echo ""
echo "    4. Add 'admin' to the CD pipeline matrix in .github/workflows/cd.yml:"
echo "       matrix:"
echo "         lambda: [gateway, downloader, worker, mail_handler, admin]"
echo ""
echo "============================================================"
