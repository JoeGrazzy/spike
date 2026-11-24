# SPIKE — Metered Open Relay TURN setup

The call engine now requests Metered's full ICE server array before microphone/camera setup. Both the caller and receiver use the same ICE configuration. If the Metered request fails or times out, calls retain the existing public STUN servers as a direct-connection fallback.

## Configure the credential-scoped API URL

Open `js/spike-call-engine.js` and find `METERED_TURN_CREDENTIAL_URL` near the top of the file. Replace:

- `YOUR_METERED_APP` with the Metered app name/domain shown in your dashboard (without `.metered.live`).
- `YOUR_CREDENTIAL_SCOPED_API_KEY` with the API key shown under the SPIKE TURN credential's **Get credential → Show API Key** action.

The resulting URL format is:

`https://YOUR_APP_NAME.metered.live/api/v1/turn/credentials?apiKey=YOUR_CREDENTIAL_SCOPED_API_KEY`

Use the API key for this one TURN credential, not the account-wide Metered Secret Key. Metered documents the credential-scoped API key as safe for front-end use. Never put the account Secret Key in browser code.

The username/password previously pasted into chat should be rotated in Metered. This build does not contain those exposed values.

## Verify

1. Wait up to two minutes after creating or rotating a TURN credential so it propagates.
2. Deploy the updated static assets.
3. Test a voice call and a video call between two signed-in devices, first on Wi-Fi and then with one device on mobile data.
4. In browser WebRTC diagnostics, verify that the selected candidate pair is `relay` on a network where direct connectivity is blocked. A connected call alone does not prove TURN was used.

No Supabase schema, RLS policy, signaling, or call-session migration is changed by this TURN integration.
