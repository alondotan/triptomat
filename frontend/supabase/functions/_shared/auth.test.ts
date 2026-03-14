import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { validateWebhookToken } from "./auth.ts";

Deno.test("validateWebhookToken — returns valid with userId when token found", async () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { user_id: "user-123" } }),
        }),
      }),
    }),
  };

  const result = await validateWebhookToken(mockSupabase, "valid-token");
  assertEquals(result.valid, true);
  assertEquals(result.userId, "user-123");
});

Deno.test("validateWebhookToken — returns invalid when token not found", async () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  };

  const result = await validateWebhookToken(mockSupabase, "bad-token");
  assertEquals(result.valid, false);
  assertEquals(result.userId, undefined);
});
