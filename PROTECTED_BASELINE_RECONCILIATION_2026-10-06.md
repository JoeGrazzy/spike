# Protected baseline reconciliation — 2026-10-06

## Why the manifest was reconciled

The uploaded source archive's protected manifest was generated from `SPIKE_PROJECT_BEAUTIFUL_2026-09-22`, but 43 listed files already differed in hash and/or size in the untouched uploaded `SPIKE.zip`. The original archive SHA-256 is `5d2cc409ac405beab41b5a4ab8575becfce93eeca660d929b3033265ae89f67c`. These mismatches were not introduced by this remediation.

## Changes made in this remediation

- `bridge-harness.html`: document metadata and references needed for harness behavior.
- `js/audit/tests/navigation-restoration.test.mjs`: limit production-page checks to production pages; test fixtures are not production routes.
- `js/audit/tests/reaction-longpress-v4.test.mjs`: update stale assertions to current reaction-v4/v5 implementation.
- `js/audit/protected-baseline.json`: refresh integrity hashes only after confirming the original uploaded archive already contained the 43 mismatches. This makes the manifest describe the delivered package rather than the unrelated September snapshot.

The refreshed manifest does not change application code, backend state, migrations, RLS, RPCs, triggers, or storage policies. Future protected-file edits still require review and an intentional manifest refresh.

## Limitation

This reconciles byte-level integrity with the actual source archive; it does not claim a semantic review of every historical difference from the September snapshot. The original snapshot is not included in the uploaded archive, so the 43 differences cannot be reconstructed from the current source alone.
