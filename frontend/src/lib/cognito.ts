const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN; // custom domain for user-facing URLs
const COGNITO_TOKEN_DOMAIN = import.meta.env.VITE_COGNITO_TOKEN_DOMAIN; // prefix domain for token exchange (CORS)
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_REDIRECT_URI = `${window.location.origin}/auth/callback`;

// --- PKCE helpers ---

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE() {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);
  return { codeVerifier, codeChallenge };
}

// --- Public API ---

export async function redirectToCognitoLogin() {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  sessionStorage.setItem('cognito_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: 'openid email profile',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    identity_provider: 'Google',
  });

  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ id_token: string }> {
  const codeVerifier = sessionStorage.getItem('cognito_code_verifier');
  if (!codeVerifier) throw new Error('Missing PKCE code verifier');

  const response = await fetch(`https://${COGNITO_TOKEN_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: COGNITO_REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = await response.json();
  sessionStorage.removeItem('cognito_code_verifier');

  return { id_token: tokens.id_token };
}

export function getCognitoLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: window.location.origin + '/auth',
  });

  return `https://${COGNITO_DOMAIN}/logout?${params}`;
}
