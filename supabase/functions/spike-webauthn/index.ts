import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from 'npm:@simplewebauthn/server@13.2.2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromHex = (value: string) => { const h = String(value || '').replace(/^\\x/i, ''); if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error('Invalid stored WebAuthn public key'); return Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16)); };
const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const configuredOrigins = String(Deno.env.get('SPIKE_WEBAUTHN_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
const configuredRpId = String(Deno.env.get('SPIKE_WEBAUTHN_RP_ID') || '').trim();
const isLocalOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
const allowedOrigin = (origin: string) => configuredOrigins.includes(origin) || (!configuredOrigins.length && isLocalOrigin(origin));
const cors = (origin: string) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'Origin',
});
const json = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(origin ? cors(origin) : {}) },
});
const requestOrigin = (req: Request) => String(req.headers.get('origin') || '').trim();

async function actor(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function rateLimited(userId: string, purpose: 'registration' | 'authentication') {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('spike_safety_webauthn_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .gte('created_at', cutoff);
  if (error) throw new Error('WebAuthn rate-limit check failed');
  return Number(count || 0) >= 8;
}

function rpConfig(origin: string) {
  if (!allowedOrigin(origin)) throw new Error('WebAuthn origin is not allowed');
  const rpID = configuredRpId || (isLocalOrigin(origin) ? new URL(origin).hostname : '');
  if (!rpID) throw new Error('WebAuthn RP ID is not configured on the SPIKE server');
  const expectedOrigins = configuredOrigins.length ? configuredOrigins : [origin];
  return { rpID, expectedOrigins };
}

Deno.serve(async req => {
  const origin = requestOrigin(req);
  if (req.method === 'OPTIONS') {
    if (!origin || !allowedOrigin(origin)) return new Response('Forbidden', { status: 403 });
    return new Response('ok', { status: 200, headers: cors(origin) });
  }
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405, origin);
  if (!origin || !allowedOrigin(origin)) return json({ error: 'WebAuthn origin is not allowed' }, 403);

  const user = await actor(req);
  if (!user) return json({ error: 'Authentication required' }, 401, origin);

  const { rpID, expectedOrigins } = rpConfig(origin);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  try {
    if (action === 'registration-options') {
      if (await rateLimited(user.id, 'registration')) return json({ error: 'Too many passkey registration attempts. Try again later.' }, 429, origin);
      { const { error } = await db.from('spike_safety_webauthn_attempts').insert({ user_id: user.id, purpose: 'registration' }); if (error) throw new Error('Could not record WebAuthn attempt'); }
      const { count, error: countError } = await db.from('spike_safety_passkeys').select('credential_id', { count: 'exact', head: true }).eq('user_id', user.id);
      if (countError) throw new Error('Passkey registry unavailable');
      if (Number(count || 0) >= 5) return json({ error: 'This account already has the maximum of 5 Safety Center passkeys.' }, 409, origin);
      const { data: existing, error: existingError } = await db.from('spike_safety_passkeys').select('credential_id').eq('user_id', user.id);
      if (existingError) throw new Error('Passkey registry unavailable');
      const options = await generateRegistrationOptions({
        rpName: 'SPIKE', rpID, userID: user.id,
        userName: user.email || `spike-${user.id}`,
        userDisplayName: user.user_metadata?.display_name || 'SPIKE User',
        attestationType: 'none',
        excludeCredentials: (existing || []).map(x => ({ id: x.credential_id, type: 'public-key' as const })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      const { error } = await db.from('spike_safety_webauthn_challenges').upsert({ user_id: user.id, challenge: options.challenge, purpose: 'registration', expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
      if (error) throw new Error('Could not store WebAuthn challenge');
      return json(options, 200, origin);
    }

    if (action === 'registration-verify') {
      const { data: ch, error: challengeError } = await db.from('spike_safety_webauthn_challenges').select('*').eq('user_id', user.id).eq('purpose', 'registration').gt('expires_at', new Date().toISOString()).maybeSingle();
      if (challengeError) throw new Error('WebAuthn challenge lookup failed');
      if (!ch) return json({ error: 'Registration challenge expired. Start again.' }, 400, origin);
      const verification = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: expectedOrigins, expectedRPID: rpID, requireUserVerification: true });
      if (!verification.verified || !verification.registrationInfo) return json({ error: 'Passkey verification failed' }, 400, origin);
      const info = verification.registrationInfo;
      const credentialId = info.credential.id;
      const { error: insertError } = await db.from('spike_safety_passkeys').upsert({ credential_id: credentialId, user_id: user.id, public_key: '\\x' + toHex(new Uint8Array(info.credential.publicKey)), counter: info.credential.counter, transports: body.response?.response?.transports || [] }, { onConflict: 'credential_id' });
      if (insertError) throw new Error('Could not save verified passkey');
      await db.from('spike_safety_webauthn_challenges').delete().eq('user_id', user.id);
      return json({ ok: true, credentialId }, 200, origin);
    }

    if (action === 'authentication-options') {
      if (await rateLimited(user.id, 'authentication')) return json({ error: 'Too many passkey verification attempts. Try again later.' }, 429, origin);
      { const { error } = await db.from('spike_safety_webauthn_attempts').insert({ user_id: user.id, purpose: 'authentication' }); if (error) throw new Error('Could not record WebAuthn attempt'); }
      const { data: creds, error: credError } = await db.from('spike_safety_passkeys').select('credential_id,transports').eq('user_id', user.id);
      if (credError) throw new Error('Passkey registry unavailable');
      if (!creds?.length) return json({ error: 'No registered passkey' }, 404, origin);
      const options = await generateAuthenticationOptions({ rpID, allowCredentials: creds.map(x => ({ id: x.credential_id, type: 'public-key' as const, transports: x.transports || [] })), userVerification: 'required' });
      const { error } = await db.from('spike_safety_webauthn_challenges').upsert({ user_id: user.id, challenge: options.challenge, purpose: 'authentication', expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
      if (error) throw new Error('Could not store WebAuthn challenge');
      return json(options, 200, origin);
    }

    if (action === 'authentication-verify') {
      const { data: ch, error: challengeError } = await db.from('spike_safety_webauthn_challenges').select('*').eq('user_id', user.id).eq('purpose', 'authentication').gt('expires_at', new Date().toISOString()).maybeSingle();
      if (challengeError) throw new Error('WebAuthn challenge lookup failed');
      if (!ch) return json({ error: 'Authentication challenge expired. Start again.' }, 400, origin);
      const credentialId = String(body.response?.id || '');
      const { data: cred, error: credError } = await db.from('spike_safety_passkeys').select('*').eq('credential_id', credentialId).eq('user_id', user.id).maybeSingle();
      if (credError) throw new Error('Passkey lookup failed');
      if (!cred) return json({ error: 'Passkey is not registered for this account' }, 403, origin);
      const verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: expectedOrigins, expectedRPID: rpID, credential: { id: cred.credential_id, publicKey: fromHex(cred.public_key), counter: Number(cred.counter), transports: cred.transports || [] }, requireUserVerification: true });
      if (!verification.verified) return json({ error: 'Passkey verification failed' }, 403, origin);
      const { error: updateError } = await db.from('spike_safety_passkeys').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('credential_id', credentialId).eq('user_id', user.id);
      if (updateError) throw new Error('Could not update passkey state');
      await db.from('spike_safety_webauthn_challenges').delete().eq('user_id', user.id);
      return json({ ok: true, credentialId }, 200, origin);
    }

    return json({ error: 'Unknown action' }, 400, origin);
  } catch (e) {
    console.error('[SPIKE WebAuthn]', e);
    return json({ error: e instanceof Error ? e.message : 'WebAuthn operation failed' }, 400, origin);
  }
});
