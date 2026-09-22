# SPIKE Native Social Layer v2

This rebuild keeps the technical foundation and changes the social product layer around SPIKE-native concepts.

## Core language
- Story -> Pulse
- Reels -> Signal Stream
- Trending/Popular -> Momentum
- Comments -> Echoes
- Hashtags -> Topics
- Friends -> Connections
- Close Friends -> Circles
- Saved -> Signal Vault

## Native mechanics
### Pulses
A 24-hour live-state surface. The existing media pipeline is reused, while the product language and future persistence layer are native to SPIKE.

### Momentum
Ranks Signals using velocity, conversation depth, saves and passes rather than simple total popularity.

### Topics
Derived from active Signals and presented as living clusters. A Topic can become a discovery lens.

### Signal Lenses
Personal views with rules such as keywords/topics and a chosen sort mode.

### Signal Chains
Connect Signals into a continuing line of thought. Existing chain storage is preserved and the Feed now provides a native entry point.

### Echoes
Existing comments gain SPIKE-native intent metadata: add, challenge, support, question or context.

## Database
`supabase/migrations/20260922020000_spike_native_social_layer_v2.sql` adds:
- `spike_pulses`
- `spike_topics`
- `spike_topic_followers`
- `spike_signal_topics`
- `spike_signal_lenses`
- Echo metadata columns on `comments`

All new public tables have RLS and explicit authenticated grants.
