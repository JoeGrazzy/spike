# SPIKE — Metered TURN relay setup

The call engine requests ICE servers from the authenticated Supabase Edge Function `metered-turn-credentials`. Both participants use the same returned ICE server array, with public STUN servers retained as fallback.

## Metered configuration

- Metered app domain: `spikemediachat.metered.live`.
- Supabase secret `METERED_API_KEY` may contain either:
  - the credential-scoped API key from Metered **Get credential → Show API Key**, or
  - the account Secret Key from Metered **Developers**.
- Keep the account Secret Key only in Supabase Edge Function secrets. Never place it in browser JavaScript or a public Cloudflare asset.
- The Edge Function supports both key types. With a credential-scoped key it fetches the ICE array directly. With an account Secret Key it reuses a valid `spike-rotating` credential and only creates one if needed.

The Metered REST API uses the app domain and either a credential API key or account Secret Key; the dashboard App ID is not part of those request URLs.

## Verification

1. Deploy the V12 static assets to the Cloudflare Workers site.
2. Reload both signed-in devices and test voice, then video.
3. Confirm both devices reach `VOICE CONNECTED` only after WebRTC reports a connected peer connection.
4. On restrictive mobile networks, inspect WebRTC diagnostics and confirm the selected candidate pair is `relay` when direct connectivity is unavailable.

Metered notes that newly created TURN credentials may take up to two minutes to propagate. A successful call alone does not prove that TURN relay was selected.
