import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import * as jose from 'https://deno.land/x/jose@v5.2.0/index.ts';

const COGNITO_USER_POOL_ID = Deno.env.get('COGNITO_USER_POOL_ID')!;
const COGNITO_APP_CLIENT_ID = Deno.env.get('COGNITO_APP_CLIENT_ID')!;
const COGNITO_REGION = COGNITO_USER_POOL_ID.split('_')[0]; // e.g. "eu-central-1"
const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

// Cache JWKS keyset
let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

async function verifyCognitoToken(idToken: string) {
  const { payload } = await jose.jwtVerify(idToken, getJWKS(), {
    issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
    audience: COGNITO_APP_CLIENT_ID,
  });

  if (payload.token_use !== 'id') {
    throw new Error('Token is not an id token');
  }

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { id_token } = await req.json();

    if (!id_token) {
      return new Response(
        JSON.stringify({ error: 'Missing id_token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Verify the Cognito ID token
    const claims = await verifyCognitoToken(id_token);
    const email = claims.email as string;

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No email in token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Create Supabase admin client
    const supabase = createSupabaseClient();

    // 3. Create user if not exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    if (!existingUser) {
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          cognito_sub: claims.sub,
          full_name: claims.name || claims.email,
          avatar_url: claims.picture,
        },
      });

      if (createError) {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // 4. Generate a magic link to establish a Supabase session
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData) {
      console.error('Error generating link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate session link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Return the hashed token for the frontend to verify via OTP
    const hashParams = new URL(linkData.properties.action_link).searchParams;
    const token_hash = hashParams.get('token_hash') || linkData.properties.hashed_token;

    return new Response(
      JSON.stringify({ token_hash, type: 'magiclink' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('cognito-auth-bridge error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
