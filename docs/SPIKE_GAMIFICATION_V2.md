# SPIKE Gamification V2

SPIKE Gamification V2 is the active server-verified progression system.

## Core rule
A member cannot award XP, complete a mission, complete a weekly challenge, or unlock an achievement from the browser. The database calculates progress from genuine application records and awards rewards only after the requirement is met.

## Daily missions
- Send 10 messages — verified from private + Room messages.
- Release 3 Signals — verified from real `app_documents` Signal records.
- Enter 3 different Rooms — verified from `room_members` joins.
- Send 3 messages in 3 different Rooms — verified from distinct `room_messages.room_id` values.
- Send 10 Room messages — verified from `room_messages`.
- Echo 3 Signals — verified from `comments`.
- Start a SPIKE — verified from one real Signal.

## Weekly challenges
Weekly progress is calculated from the same server metrics and stored idempotently in `gamification_weekly_completions` so a reward can only be awarded once per member/challenge.

## Achievements
Achievements are evaluated automatically from server metrics. The seeded catalog contains 13 verified milestones covering Signals, messaging, Rooms, Echoes, streaks, and XP.

## Automatic evaluation
Triggers evaluate gamification after genuine inserts into:
- `private_messages`
- `room_messages`
- `comments`
- Signal documents in `app_documents`
- `room_members`

The evaluation is idempotent: the same activity cannot award the same mission, weekly reward, or achievement twice.

## Leveling V3
- The level roadmap now uses a progressively harder curve from Level 1 through Level 100.
- Key milestones are Level 10 = 6,000 XP, Level 20 = 18,000 XP, Level 50 = 105,000 XP, and Level 100 = 310,000 XP.
- Existing member XP is never removed by the curve change, and existing levels cannot regress solely because thresholds were raised.
- Future XP awards remain server-authoritative and use the new thresholds.

## Admin Control Center
`admin.html` now exposes a premium V2 control surface for:
- engine health
- verified daily missions
- weekly challenges
- automatic achievements
- member XP corrections with audit reasons
- levels
- leaderboard
- rules

The admin UI exposes only server-verified configuration and audited corrections; members cannot manually complete missions or unlock achievements.

## Security
The reward/evaluation helpers are locked from direct Data API execution. User-facing RPCs are authenticated, and internal security-definer functions use a pinned search path.
