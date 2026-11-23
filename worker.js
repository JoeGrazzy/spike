/**
 * SPIKE Cloudflare Worker entrypoint.
 * Application APIs that require database access use the authenticated Supabase client.
 * This Worker serves the static application assets; no external calling provider is required.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
