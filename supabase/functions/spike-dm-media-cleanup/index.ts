import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceKey || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Invalid session" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: due, error: listError } = await admin
    .from("spike_dm_media_cleanup_queue")
    .select("bucket_id,object_path,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);
  if (listError) return json(500, { error: "Could not load cleanup queue" });

  let cleaned = 0;
  let deferred = 0;
  for (const item of due || []) {
    // Claim each item with a conditional update so concurrent invocations do not
    // process the same queue row at the same time.
    const { data: claimed, error: claimError } = await admin
      .from("spike_dm_media_cleanup_queue")
      .update({ status: "processing", locked_at: new Date().toISOString() })
      .eq("bucket_id", item.bucket_id)
      .eq("object_path", item.object_path)
      .eq("status", "pending")
      .select("bucket_id,object_path,attempts")
      .maybeSingle();
    if (claimError || !claimed) continue;

    const { error: removeError } = await admin.storage
      .from(claimed.bucket_id)
      .remove([claimed.object_path]);
    if (removeError) {
      const attempts = Number(claimed.attempts || 0) + 1;
      const delaySeconds = Math.min(86400, 30 * (2 ** Math.min(attempts, 10)));
      await admin.from("spike_dm_media_cleanup_queue").update({
        status: "pending",
        attempts,
        next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        locked_at: null,
        last_error: String(removeError.message || "Storage deletion failed").slice(0, 1000),
      }).eq("bucket_id", claimed.bucket_id).eq("object_path", claimed.object_path);
      deferred++;
      continue;
    }

    const { error: doneError } = await admin.from("spike_dm_media_cleanup_queue").update({
      status: "done",
      completed_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
    }).eq("bucket_id", claimed.bucket_id).eq("object_path", claimed.object_path);
    if (doneError) deferred++;
    else cleaned++;
  }

  return json(200, { ok: true, cleaned, deferred, checked: (due || []).length });
});
