// REVIEW CANDIDATE ONLY — not a complete function and not deployable by itself.
// Replace the live allowedApiKey() shortcut with this secret check, then retain
// the existing auth.getUser() + profiles.role admin check as a separate path.
export function hasDedicatedSyncSecret(req: Request): boolean {
  const expected = Deno.env.get("SPIKE_PREDICTOR_SYNC_SECRET") || "";
  const supplied = req.headers.get("x-spike-predictor-secret") || "";
  // Fail closed if no server-side secret is configured.
  if (!expected || !supplied) return false;
  // Exact comparison; use a dedicated high-entropy secret and rotate it if exposed.
  return supplied === expected;
}
