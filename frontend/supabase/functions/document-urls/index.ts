import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.550.0';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.550.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-central-1';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')!;
const S3_BUCKET = Deno.env.get('S3_DOCUMENTS_BUCKET') || 'triptomat-media';

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

async function authenticateUser(req: Request): Promise<{ user: { id: string } } | Response> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return { user: { id: user.id } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;

    const body = await req.json();
    const { action } = body;

    if (action === 'upload-url') {
      const { tripId, fileName, contentType } = body;
      if (!fileName) {
        return new Response(JSON.stringify({ error: 'fileName required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ext = fileName.split('.').pop() || '';
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      const storagePath = tripId
        ? `documents/${userId}/${tripId}/${uniqueName}`
        : `documents/${userId}/general/${uniqueName}`;

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: storagePath,
        ContentType: contentType || 'application/octet-stream',
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

      return new Response(JSON.stringify({ uploadUrl: signedUrl, storagePath }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'download-url') {
      const { storagePath } = body;
      if (!storagePath) {
        return new Response(JSON.stringify({ error: 'storagePath required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Security: only allow access to own files
      if (!storagePath.startsWith(`documents/${userId}/`)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: storagePath,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      return new Response(JSON.stringify({ downloadUrl: signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { storagePath } = body;
      if (!storagePath) {
        return new Response(JSON.stringify({ error: 'storagePath required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!storagePath.startsWith(`documents/${userId}/`)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await s3.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: storagePath,
      }));

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('document-urls error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
