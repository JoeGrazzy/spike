import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// This is the Metered app domain, not the numeric/string App ID shown in the dashboard.
const domain = "spikemediachat.metered.live";
const baseUrl = `https://${domain}`;
const credentialLabel = "spike-rotating";
const credentialLifetimeSeconds = 172800; // 48 hours
let cachedIceServers: unknown[] | null = null;
let cacheUntil = 0;
let creationInFlight: Promise<unknown[]> | null = null;

function isIceServerArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.some((server) => {
    const urls = Array.isArray((server as any)?.urls) ? (server as any).urls : [(server as any)?.urls];
    return urls.some((url: unknown) => typeof url === "string" && url.startsWith("turn"));
  });
}

async function responseBody(response: Response): Promise<any> {
  const raw = await response.text().catch(() => "");
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw.slice(0, 500) }; }
}

async function getIceArray(apiKey: string): Promise<unknown[] | null> {
  const response = await fetch(`${baseUrl}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = await responseBody(response);
  if (!response.ok || !isIceServerArray(body)) return null;
  return body;
}

async function getIceServers(): Promise<unknown[]> {
  if (cachedIceServers && Date.now() < cacheUntil) return cachedIceServers;
  if (creationInFlight) return await creationInFlight;

  creationInFlight = (async () => {
    // METERED_API_KEY may be either the credential-scoped API key from
    // "Get credential → Show API Key" or the account Secret Key. Try the
    // credential-scoped route first; it avoids creating a new credential per call.
    const configuredKey = Deno.env.get("METERED_API_KEY") || Deno.env.get("METERED_SECRET_KEY");
    if (!configuredKey) throw new Error("METERED_API_KEY is not configured in Supabase secrets");

    const directIce = await getIceArray(configuredKey);
    if (directIce) {
      cachedIceServers = directIce;
      cacheUntil = Date.now() + 5 * 60 * 1000;
      return directIce;
    }

    // If the configured key is the account Secret Key, reuse an existing
    // unexpired SPIKE credential before attempting to create another one.
    const listUrl = `${baseUrl}/api/v2/turn/credentials?secretKey=${encodeURIComponent(configuredKey)}&label=${encodeURIComponent(credentialLabel)}`;
    const listResponse = await fetch(listUrl, { headers: { Accept: "application/json" }, cache: "no-store" });
    const listed = await responseBody(listResponse);
    let credentialApiKey: string | undefined;
    if (listResponse.ok && Array.isArray(listed?.data)) {
      const existing = listed.data.find((item: any) => item?.expired !== true && typeof item?.apiKey === "string" && item.apiKey);
      credentialApiKey = existing?.apiKey;
    }

    if (!credentialApiKey) {
      const createResponse = await fetch(
        `${baseUrl}/api/v1/turn/credential?secretKey=${encodeURIComponent(configuredKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ label: credentialLabel, expiryInSeconds: credentialLifetimeSeconds }),
        },
      );
      const created = await responseBody(createResponse);
      if (!createResponse.ok || typeof created?.apiKey !== "string") {
        const providerMessage = typeof created?.message === "string" ? created.message :
          typeof created?.error === "string" ? created.error : "Metered returned no error detail";
        // Provider response text contains no submitted key; never log query URLs or secrets.
        console.error("Metered credential creation rejected:", createResponse.status, providerMessage.slice(0, 300));
        throw new Error(`Metered rejected credential creation (${createResponse.status}): ${providerMessage.slice(0, 180)}`);
      }
      credentialApiKey = created.apiKey;
    }

    const iceServers = await getIceArray(credentialApiKey);
    if (!iceServers) throw new Error("Metered credential exists, but its ICE server list could not be retrieved");

    cachedIceServers = iceServers;
    // Keep a short per-isolate cache. Reuse across calls through the Metered
    // credential list because Edge Function isolates can be restarted at any time.
    cacheUntil = Date.now() + 5 * 60 * 1000;
    return iceServers;
  })();

  try { return await creationInFlight; }
  finally { creationInFlight = null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const iceServers = await getIceServers();
    return new Response(JSON.stringify({ iceServers }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TURN credentials";
    console.error("TURN credentials function error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
