# SPIKE World — implementation

Implemented as a new `spike_world.html` surface and integrated into the Feed menu.

## Features
- SPIKE Battles: friend-to-friend challenges, community voting, automatic closing, winner notifications.
- Signal Chains: create an idea chain and append linked entries.
- Community Missions: create/join missions, server-side progress, completion XP.
- Seasons: live 30-day season with shared leaderboard and server-controlled points.
- Circles: private/discoverable small communities, friend invitations, invite acceptance, and Circle chat.

## Database
The feature schema/RPCs were applied to the connected Supabase project. New tables use RLS and feature mutations are exposed through authenticated RPCs. Season rewards are rate-limited by source/day and the generic reward RPC is not executable by clients.

## Frontend
`spike_world.html` is mobile-responsive, uses the existing SPIKE theme/back-navigation layers, authenticates with the existing PKCE Supabase client, and is linked from the Feed menu.

## Validation
The existing project syntax/static audits were run after the implementation. The historical full-suite contains two pre-existing baseline failures unrelated to SPIKE World: the Feed core CSS size budget and the theme-registry count assertion. Inline JavaScript and the new World page itself pass syntax/UI checks.

### Production hardening note
Season-point issuance is server-authoritative, includes `mission_progress` in the approved source set, and serializes reward issuance per user/source/day so concurrent requests cannot bypass the 100-point daily source cap.
