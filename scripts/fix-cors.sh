#!/bin/bash
set -euo pipefail

REGION="eu-central-1"
PROFILE="triptomat"
API_ID="9hhwxodv7a"

echo "Updating API Gateway CORS configuration..."

CORS_JSON='{"AllowOrigins":["http://localhost:5173","https://frontend-three-omega-84.vercel.app","https://aqpzhflzsqkjceeeufyf.supabase.co"],"AllowMethods":["GET","POST","DELETE","OPTIONS"],"AllowHeaders":["Content-Type","Authorization"],"MaxAge":86400}'

aws apigatewayv2 update-api \
  --api-id "$API_ID" \
  --cors-configuration "$CORS_JSON" \
  --profile "$PROFILE" --region "$REGION" \
  --output text --query 'CorsConfiguration'

echo ""
echo "CORS updated. Verifying..."

curl -s -D - -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "https://${API_ID}.execute-api.${REGION}.amazonaws.com/admin/stats" 2>&1 | grep -i "access-control"

echo ""
echo "Done."
