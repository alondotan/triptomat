import boto3
import sys

session = boto3.Session(profile_name='triptomat', region_name='eu-central-1')
client = session.client('apigatewayv2')

print("Updating CORS config...")
resp = client.update_api(
    ApiId='9hhwxodv7a',
    CorsConfiguration={
        'AllowOrigins': ['http://localhost:5173', 'https://triptomat.com', 'https://www.triptomat.com', 'https://frontend-three-omega-84.vercel.app', 'https://aqpzhflzsqkjceeeufyf.supabase.co'],
        'AllowMethods': ['GET', 'POST', 'DELETE', 'OPTIONS'],
        'AllowHeaders': ['Content-Type', 'Authorization'],
        'MaxAge': 86400,
    }
)
print("CORS updated:", resp.get('CorsConfiguration'))
sys.exit(0)
