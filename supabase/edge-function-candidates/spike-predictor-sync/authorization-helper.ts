/**
 * Candidate-only authorization helper for spike-predictor-sync.
 * Never treats anon/publishable Supabase keys as privileged credentials.
 * Keep this candidate out of production until the scheduled caller contract is confirmed.
 */
export async function isAuthorizedPredictorCaller(req: Request, deps: {
  verifyUser: (req: Request) => Promise<{ id: string; role: string } | null>;
  expectedSecret?: string;
}) {
  const expected = deps.expectedSecret?.trim();
  const supplied = req.headers.get('x-spike-predictor-secret')?.trim();
  if (expected && supplied && supplied.length === expected.length) {
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    if (diff === 0) return true;
  }
  const user = await deps.verifyUser(req).catch(() => null);
  return !!user && (user.role === 'admin' || user.role === 'super_admin');
}
