import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({
    ok: false,
    error: "This connectivity configuration endpoint has been retired."
  }), { status: 410, headers });
});
