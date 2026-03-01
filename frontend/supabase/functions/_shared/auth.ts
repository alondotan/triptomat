/**
 * Validate a webhook token against the webhook_tokens table.
 * Returns the user_id if valid, or null if invalid.
 */
export async function validateWebhookToken(
  supabase: any,
  token: string,
): Promise<{ valid: boolean; userId?: string }> {
  const { data: tokenRow } = await supabase
    .from('webhook_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle();

  if (tokenRow) {
    return { valid: true, userId: tokenRow.user_id };
  }
  return { valid: false };
}
