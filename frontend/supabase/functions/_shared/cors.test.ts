import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { corsHeaders } from "./cors.ts";

Deno.test("corsHeaders — allows all origins", () => {
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
});

Deno.test("corsHeaders — allows authorization header", () => {
  const headers = corsHeaders["Access-Control-Allow-Headers"];
  assertEquals(headers.includes("authorization"), true);
});

Deno.test("corsHeaders — allows content-type header", () => {
  const headers = corsHeaders["Access-Control-Allow-Headers"];
  assertEquals(headers.includes("content-type"), true);
});

Deno.test("corsHeaders — allows apikey header", () => {
  const headers = corsHeaders["Access-Control-Allow-Headers"];
  assertEquals(headers.includes("apikey"), true);
});
