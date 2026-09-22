# SPIKE Final Retest — 2026-09-22

## Result
Final static/database retest completed after the previous final package. Issues found were corrected and the package was rebuilt.

## Corrections
- Replaced a raw `alert()` collaboration action with SPIKE's existing toast/navigation flow.
- Added server-side Live moderation enforcement for chat, questions, and Live participation events.
- Added migration `20260922104500_spike_live_moderation_enforcement_v1.sql` so the enforcement is reproducible from migrations.
- Kept protocol-relative third-party CDN URLs as external resources; they are not missing local assets.

## Static tests
- JavaScript syntax check: PASS — 0 failures.
- HTML parsing: PASS — 30/30 pages parsed.
- Duplicate HTML IDs: PASS — 0 duplicates.
- Local asset/reference check: PASS — 0 missing local references.
- Final ZIP integrity: PASS.

## Supabase tests
- Live tables: 15 present.
- Live RLS: enabled on all 15.
- Live policies: present, including moderation-enforced INSERT policies.
- Live Realtime: required Live tables present in `supabase_realtime` publication.
- Live metrics trigger smoke test: PASS; Spark event incremented `spark_count` and momentum as expected.
- Live metrics function has fixed `search_path=public`.

## Browser/runtime limitation
A direct Chromium headless smoke run was attempted, but SPIKE pages maintain long-lived browser/runtime connections and did not terminate within the dump timeout. This is not treated as a page failure. A full interactive browser audit would require a dedicated automation harness such as Playwright/Selenium.

## Existing advisor findings
Supabase still reports pre-existing SECURITY DEFINER execution warnings across the broader SPIKE database. These include established policy/admin/safety functions and were not mass-modified because changing their authorization model could break existing security-sensitive flows. The newly added Live metrics function is hardened with an explicit search path.
