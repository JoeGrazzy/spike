# SPIKE voice/video calls — v49 repair and deployment guide

## Changes included

1. The live Supabase migration `supabase/migrations/20261011130222_spike_call_recipient_channel_authorization_repair_v3.sql` has been applied to project `cjqpyndceqyqsijihxbb` and verified by querying `pg_policies`.
2. The call runtime now reports any Realtime subscription error detail returned by the client, validates optional ICE server configuration, gives clearer media-permission errors, handles remote media playback, logs ICE-candidate signaling failures, and gives ICE disconnections a recovery window before ending the call.
3. When the auth session changes, cached peer call channels are removed as well as the incoming-call channel, avoiding reuse of channels created under an older token.
4. All pages that load the call runtime now reference `?v=sitewide-calls-v8` to invalidate stale browser/CDN cache entries.

## Important boundary

The SQL policy repair v3 is deployed. A final v4 copy is included after the older, not-yet-applied call-policy migrations so a future full migration push cannot leave the legacy policy set active. The updated browser JavaScript in this ZIP is **not deployed to your web host by this package operation**. Upload/deploy the contents of the `spike/` directory to the same hosting root, then purge the host/CDN cache if applicable.

No two-device call test has been run from this environment. Confirm signaling and media on real signed-in devices before declaring calls fixed.

## TURN configuration for reliable mobile/network connectivity

The runtime accepts an optional global `window.SPIKE_CALL_ICE_SERVERS` array. If absent, it uses public STUN servers only. STUN-only connectivity is not reliable on all carrier-grade NATs, firewalls, VPNs, or restrictive Wi-Fi networks.

Configure your TURN provider to issue short-lived, per-session credentials. Do **not** commit a TURN shared secret or permanent credential into public JavaScript. Add a small configuration script before `js/spike-dm-realtime-calls-v2.js` in the page templates (or inject it through your hosting config), for example:

```html
<script>
  // Populate this from your backend with temporary TURN credentials.
  // Replace these placeholders; do not use them literally.
  window.SPIKE_CALL_ICE_SERVERS = [
    { urls: 'stun:YOUR_STUN_HOST:3478' },
    {
      urls: ['turn:YOUR_TURN_HOST:3478?transport=udp', 'turn:YOUR_TURN_HOST:3478?transport=tcp', 'turns:YOUR_TURN_HOST:5349?transport=tcp'],
      username: 'SHORT_LIVED_USERNAME',
      credential: 'SHORT_LIVED_CREDENTIAL'
    }
  ];
</script>
```

For production, the temporary username/credential should come from an authenticated backend endpoint backed by a TURN service such as coturn or a managed TURN provider. Do not use long-lived shared secrets in this inline example. Ensure the provider's UDP/TCP/TLS ports are allowed by its firewall.

## Deployment and validation checklist

1. Deploy the complete `spike/` directory, including `js/spike-dm-realtime-calls-v2.js` and the updated HTML cache-busting query strings.
2. Purge the hosting/CDN cache. On each test device, fully close/reopen the page or use a fresh browser tab; sign out and back in if the session may be stale.
3. Use two distinct, signed-in accounts with an existing direct-message conversation between them.
4. In Supabase SQL editor, verify the current policies:

   ```sql
   SELECT policyname, cmd, roles, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'realtime' AND tablename = 'messages'
     AND (policyname ILIKE '%call%' OR policyname ILIKE '%recipient%')
   ORDER BY policyname;
   ```

   Expected current call policies: `spike call recipient or dm participant can receive` (SELECT) and `spike dm participant can send recipient call` (INSERT). The old pair-call policies should be absent.

5. Open `messages.html` on recipient device A and a direct conversation on device B. Verify A can receive a call while on the inbox or another page that loads the global call runtime.
6. Test voice call: offer → incoming UI → accept → answer → ICE candidates → connected state → two-way audio → hang up.
7. Repeat for video; allow camera and microphone; confirm both local and remote video and two-way audio.
8. Repeat over different networks (for example, Wi-Fi and mobile data). If signaling works but ICE remains `failed` or media never connects, configure TURN as described above and retest.
9. If `CHANNEL_ERROR` persists, capture the browser console message including the channel label/status and inspect Supabase Realtime logs at the matching timestamp. Verify the page uses `https://cjqpyndceqyqsijihxbb.supabase.co` and has a valid signed-in session.

## Diagnostic interpretation

- `Incoming-call channel failed (CHANNEL_ERROR)`: still a Realtime authorization, token/session, project URL, or network/subscription problem; TURN is not the fix for this stage.
- Incoming UI appears but no answer arrives: inspect outgoing recipient-channel subscription and INSERT policy, then check whether the answer signal is emitted.
- Offer/answer exchange succeeds but ICE fails: check TURN configuration, browser connectivity, VPN/firewall, and ICE candidate logs.
- Connected state but no audio/video: inspect browser permissions, device selection, remote track events, and media playback restrictions.
