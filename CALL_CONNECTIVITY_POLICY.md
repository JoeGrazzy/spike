# SPIKE call connectivity policy

SPIKE calling uses direct WebRTC peer connectivity only.

- ICE server configuration is limited to the public Google and Cloudflare STUN endpoints in the calling clients.
- Calls do not configure or request relay servers.
- Remote SDP is sanitized to remove relay candidates before it is applied.
- Trickle ICE signaling rejects relay candidates on both messaging calls and room audio paths.
- Local candidate signaling sends only host and server-reflexive candidates.
- The former dynamic ICE configuration Edge Function is retired and returns HTTP 410.
- Supabase Realtime remains the private signaling transport; it does not carry the audio/video media stream.

Direct connectivity is not guaranteed on every carrier, NAT, or firewall. When a direct path cannot be established, the call should fail gracefully rather than switch to a relay path.
