# SPIKE App Map — Canonical Flow

## Primary user journey
`index.html` → `feed.html` → `profile.html` / `friends.html` / `messages.html` / `rooms.html` / `spike_world.html`

## Activity and creator journey
`feed.html` → `notifications.html` for activity/alerts
`feed.html` → `engagement.html` for creator Insights
`profile.html` → private profile insights for the owner

## Policy journey
`feed.html` → `policy.html` for the rules
`feed.html` → `policy_appeals.html` for a user's enforcement cases and appeals
`notifications.html` → `policy_appeals.html` for policy notifications
`admin.html` → Policy & Moderation for case, appeal, and governed-term administration

## Navigation rule
The Feed header does not contain a notification bell. Activity is reached through the bottom navigation and the Notifications page itself.

## Data authority
- Policy rules: `spike_policy_rules` / `spike_policy_versions`
- Prohibited terms: `spike_prohibited_terms`
- Enforcement cases: `spike_policy_cases`
- Appeals: `spike_policy_appeals`
- Notifications: `notifications`
- Recommendation safety: `spike_recommendation_eligible_posts` / `spike_recommendation_eligibility`
- Creator analytics: `post_engagement_events` and the engagement RPC layer

## UI authority
- Themes: `js/theme.js`
- Shared theme tokens: `css/theme.css`
- Policy styling: `css/policy.css`
- Feed layout/features: `css/feed-core.css`, `css/feed-features.css`, mobile/polish layers

## Release rule
Source HTML/CSS/JS and the generated `dist/` output are kept in the same package so the source and deployable artifact remain easy to compare.
