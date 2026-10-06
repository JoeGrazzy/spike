import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function envList(name: string) {
  return (Deno.env.get(name) || '').split(',').map((v) => v.trim()).filter(Boolean);
}
function requireConfig() {
  const origins = envList('SPIKE_WEBAUTHN_ORIGINS');
  const rpID = Deno.env.get('SPIKE_WEBAUTHN_RP_ID')?.trim();
  if (!origins.length || !rpID) throw new Error('WebAuthn server is not configured. Set SPIKE_WEBAUTHN_ORIGINS and SPIKE_WEBAUTHN_RP_ID.');
  return { origins, rpID, rpName: Deno.env.get('SPIKE_WEBAUTHN_RP_NAME') || 'SPIKE' };
}
function authClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
  return createClient(url, key, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
}
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Supabase server secret is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function b64ToBytes(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function bytesToHex(bytes: Uint8Array) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
async function userId(req: Request) {
  const { data, error } = await authClient(req).auth.getUser();
  if (error || !data.user) throw new Error('Authentication required.');
  return data.user.id;
}
async function rateLimit(admin: ReturnType<typeof adminClient>, uid: string, purpose: 'registration'|'authentication') {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin.from('spike_safety_webauthn_attempts').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('purpose', purpose).gte('created_at', since);
  if (error) throw error;
  if ((count || 0) >= 12) throw new Error('Too many passkey verification attempts. Please wait before trying again.');
  const { error: insertError } = await admin.from('spike_safety_webauthn_attempts').insert({ user_id: uid, purpose });
  if (insertError) throw insertError;
}
async function saveChallenge(admin: ReturnType<typeof adminClient>, uid: string, challenge: string, purpose: 'registration'|'authentication') {
  const { error } = await admin.from('spike_safety_webauthn_challenges').upsert({ user_id: uid, challenge, purpose, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
  if (error) throw error;
}
async function takeChallenge(admin: ReturnType<typeof adminClient>, uid: string, purpose: 'registration'|'authentication') {
  const { data, error } = await admin.from('spike_safety_webauthn_challenges').select('challenge,expires_at').eq('user_id', uid).eq('purpose', purpose).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new Error('WebAuthn challenge expired. Start again.');
  await admin.from('spike_safety_webauthn_challenges').delete().eq('user_id', uid).eq('purpose', purpose);
  return data.challenge as string;
}

export default { async fetch(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const origin = req.headers.get('origin') || '';
    const { origins, rpID, rpName } = requireConfig();
    if (!origins.includes(origin)) return json({ error: 'WebAuthn origin is not allowed' }, 403);
    const uid = await userId(req);
    const admin = adminClient();
    const { action, response } = await req.json();

    if (action === 'registration-options') {
      await rateLimit(admin, uid, 'registration');
      const { data: existing } = await admin.from('spike_safety_passkeys').select('credential_id,transports').eq('user_id', uid);
      const options = await generateRegistrationOptions({
        rpName, rpID, userName: uid, userDisplayName: uid, attestationType: 'none',
        excludeCredentials: (existing || []).map((x) => ({ id: x.credential_id, transports: x.transports || undefined })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' },
        supportedAlgorithmIDs: [-7, -257],
      });
      await saveChallenge(admin, uid, options.challenge, 'registration');
      return json(options);
    }

    if (action === 'registration-verify') {
      if (!response?.id || !response?.response) throw new Error('Invalid WebAuthn registration response.');
      const challenge = await takeChallenge(admin, uid, 'registration');
      const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
      if (!verification.verified || !verification.registrationInfo) throw new Error('Passkey registration could not be verified.');
      const info = verification.registrationInfo;
      const credentialId = info.credential.id;
      const publicKey = info.credential.publicKey;
      const transports = response.response.transports || [];
      const { error } = await admin.from('spike_safety_passkeys').upsert({ credential_id: credentialId, user_id: uid, public_key: `\\x${bytesToHex(publicKey)}`, counter: info.credential.counter, transports });
      if (error) throw error;
      return json({ ok: true, credentialId });
    }

    if (action === 'authentication-options') {
      await rateLimit(admin, uid, 'authentication');
      const { data: creds } = await admin.from('spike_safety_passkeys').select('credential_id,transports').eq('user_id', uid);
      if (!creds?.length) throw new Error('No passkey is registered on this account.');
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: creds.map((x) => ({ id: x.credential_id, transports: x.transports || undefined })) });
      await saveChallenge(admin, uid, options.challenge, 'authentication');
      return json(options);
    }

    if (action === 'authentication-verify') {
      if (!response?.id || !response?.response) throw new Error('Invalid WebAuthn authentication response.');
      const challenge = await takeChallenge(admin, uid, 'authentication');
      const { data: row, error } = await admin.from('spike_safety_passkeys').select('credential_id,public_key,counter,transports').eq('credential_id', response.id).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!row) throw new Error('Passkey is not registered for this account.');
      const publicKey = row.public_key?.startsWith('\\x') ? Uint8Array.from((row.public_key.slice(2).match(/.{1,2}/g) || []).map((h: string) => parseInt(h, 16))) : b64ToBytes(row.public_key);
      const verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true, credential: { id: row.credential_id, publicKey, counter: Number(row.counter), transports: row.transports || [] } });
      if (!verification.verified) throw new Error('Passkey authentication could not be verified.');
      await admin.from('spike_safety_passkeys').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('credential_id', row.credential_id).eq('user_id', uid);
      return json({ ok: true });
    }
    return json({ error: 'Unknown WebAuthn action.' }, 400);
  } catch (e) {
    console.error('[spike-webauthn]', e);
    return json({ error: e instanceof Error ? e.message : 'WebAuthn request failed.' }, 400);
  }
}};
