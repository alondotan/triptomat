#!/bin/bash
# Deploy script for triptomat-admin Lambda
# Builds, pushes, and updates the Lambda function code.
# Use this for subsequent deployments after initial setup.
#
# Usage: bash scripts/deploy-admin-lambda.sh

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

REGION="eu-central-1"
ACCOUNT_ID="664923616128"
PROFILE="triptomat"
FUNCTION_NAME="triptomat-admin"
ECR_REPO="triptomat-admin"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPO}:latest"

# ──────────────────────────────────────────────────────────────────────────────
# Helper functions
# ──────────────────────────────────────────────────────────────────────────────

log() { echo -e "\n==> $1"; }
ok()  { echo "    [OK] $1"; }
fail() { echo "    [FAIL] $1" >&2; exit 1; }

# ──────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ──────────────────────────────────────────────────────────────────────────────

log "Pre-flight checks"

if [ ! -f "lambda_admin/Dockerfile" ]; then
    fail "lambda_admin/Dockerfile not found. Run from the project root."
fi

if ! aws lambda get-function --function-name "$FUNCTION_NAME" \
    --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    fail "Lambda function '${FUNCTION_NAME}' does not exist. Run setup-admin-lambda.sh first."
fi

ok "All checks passed"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: Build Docker image
# ──────────────────────────────────────────────────────────────────────────────

log "Step 1: Building Docker image"

docker build --provenance=false \
    -t "${FUNCTION_NAME}" \
    -f lambda_admin/Dockerfile .
ok "Docker image built"

docker tag "${FUNCTION_NAME}:latest" "${IMAGE_URI}"
ok "Docker image tagged"

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Push to ECR
# ──────────────────────────────────────────────────────────────────────────────

log "Step 2: Pushing to ECR"

aws ecr get-login-password --region "$REGION" --profile "$PROFILE" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"
ok "ECR login successful"

docker push "${IMAGE_URI}"
ok "Image pushed to ECR"

# ──────────────────────────────────────────────────────────────────────────────
# Step 3: Update Lambda function code
# ──────────────────────────────────────────────────────────────────────────────

log "Step 3: Updating Lambda function code"

aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" \
    --profile "$PROFILE" --region "$REGION" > /dev/null
ok "Lambda function code updated"

# Wait for update to complete
echo "    Waiting for function update to complete..."
aws lambda wait function-updated-v2 \
    --function-name "$FUNCTION_NAME" \
    --profile "$PROFILE" --region "$REGION"
ok "Function update complete"

# ──────────────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  triptomat-admin deployed successfully"
echo "  Image: ${IMAGE_URI}"
echo "============================================================"
