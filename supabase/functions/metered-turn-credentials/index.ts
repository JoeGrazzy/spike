import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const domain = "spikemediachat.metered.live";
let cachedIceServers: unknown[] | null = null;
let cacheUntil = 0;
let creationInFlight: Promise<unknown[]> | null = null;

async function getIceServers(): Promise<unknown[]> {
  if (cachedIceServers && Date.now() < cacheUntil) return cachedIceServers;
  if (creationInFlight) return await creationInFlight;
  creationInFlight = (async () => {
    const secretKey = Deno.env.get("METERED_API_KEY");
    const appId = Deno.env.get("METERED_APP_ID");
    if (!secretKey || !appId) throw new Error("Metered secrets are not configured");
    const createResponse = await fetch(
      `https://${domain}/api/v1/turn/credential?secretKey=${encodeURIComponent(secretKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ label: "spike-rotating", expiryInSeconds: 172800 }) },
    );
    const created = await createResponse.json().catch(() => null);
    if (!createResponse.ok || !created?.apiKey) throw new Error("Metered could not create a TURN credential");
    const iceResponse = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(created.apiKey)}`,
      { headers: { "Accept": "application/json" }, cache: "no-store" },
    );
    const iceServers = await iceResponse.json().catch(() => null);
    if (!iceResponse.ok || !Array.isArray(iceServers) || !iceServers.some((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => typeof url === "string" && url.startsWith("turn"));
    })) throw new Error("Metered returned an invalid ICE server list");
    cachedIceServers = iceServers;
    cacheUntil = Date.now() + 24 * 60 * 60 * 1000;
    return iceServers;
  })();
  try { return await creationInFlight; } finally { creationInFlight = null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  try {
    const iceServers = await getIceServers();
    return new Response(JSON.stringify({ iceServers, credentialPropagationMayTakeSeconds: 120 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("TURN credentials function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to load TURN credentials" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
