# SPIKE Copyright & License Register

**Project:** SPIKE
**Review date:** 2026-09-08
**Evidence source:** `/mnt/data/SPIKE_.zip`
**Archive SHA-256:** `fd284e3804b8b93f9245175479abbf57784479e75ffb39888e065bd9ab10fc37`
**Scope:** source tree, `dist/`, local assets, HTML/JS/CSS, SQL migrations, docs, tests, build tooling, package manifest, and externally loaded resources identified in the archive.

> This is an engineering copyright/provenance register, not a legal opinion or a forensic court determination of authorship. "Unknown" means the project currently lacks enough provenance evidence to establish a license/ownership claim from the repository itself.

## Status legend

- **OWNED** — created for SPIKE by the project/team; no third-party license identified.
- **OPEN-SOURCE** — third-party software with an identifiable open-source license.
- **AI-GENERATED** — provenance explicitly identifies AI generation; commercial-use rights still depend on the generator/service terms and the user's account/use context.
- **LICENSED** — third-party material with a specific permission/license record.
- **PUBLIC-DOMAIN** — public-domain status established.
- **UNKNOWN** — provenance/license evidence is missing; clear before public/commercial distribution.
- **SERVICE** — external hosted service/API; not a bundled copyrighted asset, but use is subject to its terms.
- **PROJECT/BUILD ARTIFACT** — generated/duplicated project material; normally not an independent third-party copyright concern.

## Executive assessment

| Area | Assessment | Action before public launch |
|---|---|---|
| SPIKE application code | **OWNED / presumed first-party** | Keep repository history/provenance where possible |
| SPIKE HTML/CSS/JS/UI copy | **OWNED / presumed first-party** | No obvious third-party publisher/template markers found |
| SQL migrations / Edge Function code present in project history | **OWNED / presumed first-party** | Keep migration history and deployment records |
| Google Fonts | **OPEN-SOURCE** | Safe for commercial use; keep provider/license record |
| Supabase JS 2.112.4 | **OPEN-SOURCE, MIT** | Include attribution/license notice |
| Font Awesome Free 7.2.0 | **OPEN-SOURCE, component licenses** | Keep CC BY/OFL/MIT attribution notice |
| jsQR 1.4.0 | **OPEN-SOURCE, Apache-2.0** | Include license/NOTICE text when distributing copies |
| qrcode-generator 1.4.4 | **OPEN-SOURCE, MIT** | Preserve copyright/license notice |
| Local `me.jpg` | **AI-GENERATED (provenance explicit)** | Verify generator terms/account rights and retain original provenance |
| Local logo/icon | **UNKNOWN / likely project asset** | Record creator/source before launch |
| Ten badge images | **UNKNOWN** | Establish creator/source or replace |
| Three local audio files | **UNKNOWN** | Establish creator/source or replace; `notifications.mp3` has Mixcraft metadata |
| Cloudinary | **SERVICE** | Confirm account/plan terms and user-content/copyright process |
| Supabase | **SERVICE** | Confirm service terms/privacy/data processing obligations |
| Google Translate endpoint | **SERVICE / implementation risk** | Confirm API/service terms and replace with supported API if required |
| WhatsApp links | **SERVICE** | Normal outbound links; no bundled copyrighted asset identified |
| `example.com` reference | **TEST/PLACEHOLDER** | Remove from production if not intentional |
| Backup `.pre-*` files | **PROJECT ARTIFACT** | Exclude from public build/deployment |

---

# 1. First-party SPIKE source

The following groups are treated as **OWNED / presumed first-party** based on their role, naming, internal consistency, and absence of third-party copyright notices in the archive. This is not proof of authorship; preserve Git/history, design files, prompts, receipts, and contributor agreements where available.

## Application pages

`admin.html`, `chat_room.html`, `coffee.html`, `feed.html`, `friends.html`, `guide.html`, `help.html`, `index.html`, `leveling.html`, `message.html`, `messages.html`, `notifications.html`, `profile.html`, `reset-password.html`, `room.html`, `room_chat.html`, `rooms.html`, `settings.html`, `spike_predictor.html`, `spike_world.html`, `view_user.html`

**Status:** OWNED / presumed first-party.

## SPIKE EDU

`spike_edu.html` and its prior `spike_edu.html.pre-v2` version.

**Status:** OWNED / presumed first-party.

The current educational titles/content found in SPIKE EDU were treated as SPIKE-authored project content. No obvious commercial publisher names, ISBN references, or copied textbook markers were found in the source scan.

Current named sample titles include:

- `Mastering English: Foundations`
- `Mathematics: Number & Algebra`
- `CSC 101: Introduction to Computing`
- `Biology: Cells & Life`

**Important:** This classification applies only to the material actually present in the repository. Future textbook/course content must be separately cleared.

## Stylesheets

`css/*.css` and corresponding `dist/css/*.css`.

**Status:** OWNED / presumed first-party, except third-party resources referenced by them (principally Google Fonts / Font Awesome where applicable).

## JavaScript / audit tooling

`js/*.js`, `js/audit/*.mjs`, `js/audit/tests/*.mjs`, `build.js`, and corresponding `dist/` copies.

**Status:** OWNED / presumed first-party.

No obvious third-party source header or copied-license block was identified in the source scan.

## SQL / database migrations

All project migrations under `supabase/migrations/` and `dist/supabase/migrations/`.

**Status:** OWNED / presumed first-party project migrations.

This register does **not** certify that every database object was originally authored by the current project team; it records the repository's current migration provenance.

## Documentation / tests / configuration

`docs/*.md`, `dom.txt`, `package.json`, `wrangler.jsonc`, `_headers`, audit tests, stories, and build configuration.

**Status:** OWNED / project/build artifacts unless a file explicitly embeds third-party material.

---

# 2. Local visual assets

## 2.1 `assets/icon/me.jpg`

**Status: AI-GENERATED — provenance explicitly present.**

Technical evidence:

- File extension: `.jpg`
- Actual file type: PNG image, 1024×1024 RGB.
- Embedded C2PA metadata is present.
- Embedded provenance contains `Created by Google Generative AI` and Google C2PA signing/provenance records.

**Risk:** YELLOW.

**Required action:** retain the original file and provenance metadata; record the Google account/tool used and the applicable terms in `asset-provenance/me.jpg.txt`. Confirm the intended commercial/public use is allowed by the relevant generator/service terms.

**SHA-256:** `0a35795cac675d2b3914228043d21c48d5337a15a865d605a7abfb59376486c8`

## 2.2 `assets/icon/icon.png`

**Status: LICENSED — Vecteezy Free License (provisional provenance; exact asset page not supplied).**

User-provided source: `https://www.vecteezy.com/free-png/logo` (Vecteezy logo PNG search page). Vecteezy states that free PNG downloads are available under its Free License and that the Free License requires attribution.

**Required evidence:** retain the exact individual Vecteezy asset page, creator name, download date, license indication, and attribution text supplied at download. If `icon.png` is intended as a trademark/brand identifier for SPIKE, obtain appropriate brand clearance or replace it with original artwork.

**SHA-256:** `015399988c9c7bc3c3213bd7b00fbce2c9e4d1ef7c7b566b8bbea8eced7a38c5`

## 2.4 Badge artwork

Files:

- `assets/badges/01-Newcomer-level-1-10.webp`
- `assets/badges/02-Exploer-level-11-20.webp`
- `assets/badges/03-Connector-level-21-30.webp`
- `assets/badges/04-Contributor-level-31-40.webp`
- `assets/badges/05-Influencer-level-41-50.webp`
- `assets/badges/06-elite-level-51-60.webp`
- `assets/badges/07-Leader-level-61-70.webp`
- `assets/badges/08-Pionner-level-71-80.webp`
- `assets/badges/09-trailblazer-level-81-90.webp`
- `assets/badges/10-spike-legend-level-91-100.webp`

**Status: UNKNOWN.**

The artwork looks like bespoke/possibly AI-assisted badge artwork, but visual appearance is not sufficient to establish provenance or rights. No license metadata was found in the files.

**Required action:** identify creator/source for each badge set. If generated by AI, record generator and terms. If made by a designer, retain the work-for-hire/assignment or license. If sourced externally, record the exact source/license.

SHA-256 hashes:

```text
01-Newcomer-level-1-10.webp  bd90b0660ce70f9477b56ff3658bb36761d6d80fe6c89aab021900ab435c18ef
02-Exploer-level-11-20.webp   e0982680fe78bc81ce535a5078b83e545aeca7b18a0b79e42d00fbecf385da51
03-Connector-level-21-30.webp 113a52e2373505541db9e9c790f6223994f5a2d1151130cd47bee4b6c2b628a6
04-Contributor-level-31-40.webp 4766db71d7588083050fa01aa0aa996e522ac853b73cbdb18ff2ca85e2aee28b8
05-Influencer-level-41-50.webp febb6dff77f117d5f020da3011ad46c6153540f9549beeed801011a1a694aedd
06-elite-level-51-60.webp 861758785a8973d2de8d0f595681ffe6cd346d02fb5507ab8739e867262dd6de
07-Leader-level-61-70.webp 03c1c5aa83918f4d91bd06f3f73eb886ac3c7cb52af041bbfa3a74b1d9db8b
08-Pionner-level-71-80.webp 8eb5ff63229c7b56e3fa1e1d13bf0b4227b62d430a90d2738e8f4879a4ac4fa4
09-trailblazer-level-81-90.webp 43c17139e594f46c381a494a571bc4c27d4ad3d7140aaf7cc978bf897d609152
10-spike-legend-level-91-100.webp 28caca01b0281dd5169a37546c5a3ec9293c6747070c511ea180c98eba49b5ca
```

---

# 3. Local audio assets

Files:

- `assets/mp3/incoming.mp3`
- `assets/mp3/notifications.mp3`
- `assets/mp3/outgoing.mp3`

**Status: LICENSED — Pixabay License (user-confirmed source).**

The user confirmed these sounds were obtained from Pixabay's sound-effects library.
Source/search page recorded for provenance:

`https://pixabay.com/sound-effects/search/incoming%20call/`

Pixabay's current license permits free use, modification and commercial/non-commercial
use without mandatory attribution, subject to its prohibited-use rules. The sounds must
be used as part of the SPIKE application/creative work and not redistributed as standalone
audio files. citeturn0search0turn0search1turn0search5

**Evidence limitation:** the exact individual Pixabay asset pages/contributor names for the
three downloaded files were not supplied. For stronger audit evidence, retain the exact
asset-page URL, download date, and a screenshot/PDF of the license page for each sound.

Technical observations:

- `incoming.mp3`: MPEG Layer III; LAME 3.100 encoder markers.
- `outgoing.mp3`: MPEG Layer III; LAME 3.100 encoder markers.
- `notifications.mp3`: WAV/PCM content despite `.mp3` extension; embedded strings include `Mixcraft 7.5 64-Bit Build 292 (libsndfile-1.0.24)`.

The encoder/editor metadata does not establish ownership, but the user-provided Pixabay source now supplies a documented licensing path.

**Required action:** retain the exact individual Pixabay asset URLs and acquisition evidence when available. If an individual asset page shows terms materially different from the general Pixabay license, follow the asset-specific terms.

SHA-256:

```text
incoming.mp3       61924ef011f5b03e4ec49f0f9c9ac32361419607bd5c52f879bc8d0dd4938107
notifications.mp3  084b78463e30dae4aac5edbf9e9c93cdee5ece4a4a688352e6a2b6686f9b1f4a
outgoing.mp3       5f8e537f9cd8e31eb8572fd6a8a6e68fa4f9df09c94866c33638a939aa6b1335
```

---

# 4. Third-party software

## 4.1 Font Awesome Free 7.2.0

Observed URL:

`https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.2.0/css/all.min.css`

Fallback observed in `room_chat.html`:

`https://use.fontawesome.com/releases/v7.2.0/css/all.css`

**Status: OPEN-SOURCE.**

Font Awesome Free 7.2.0 is commercially usable. Its components have separate licenses:

- Icons: CC BY 4.0
- Fonts: SIL OFL 1.1
- Code: MIT

Font Awesome states attribution is required by these licenses. citeturn2search0turn2search9

**SPIKE action:** keep a Font Awesome notice in `docs/legal/THIRD_PARTY_NOTICES.txt`; do not strip upstream license/attribution comments if Font Awesome assets are ever bundled locally.

## 4.2 Supabase JavaScript 2.112.4

Observed URLs:

- `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4`
- `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.min.js`

**Status: OPEN-SOURCE — MIT.**

The official Supabase JS repository identifies the project as MIT licensed. citeturn0search1turn0search3

**SPIKE action:** retain MIT copyright/license notice when distributing copies of the SDK. CDN-only use does not turn the SDK into SPIKE-owned code.

## 4.3 jsQR 1.4.0

Observed URL:

`https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js`

**Status: OPEN-SOURCE — Apache-2.0.**

The official jsQR repository identifies its license as Apache-2.0. citeturn0search5

**SPIKE action:** retain Apache-2.0 license/NOTICE text if the library is redistributed locally or bundled.

## 4.4 qrcode-generator 1.4.4

Observed URL:

`https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js`

**Status: OPEN-SOURCE — MIT.**

The upstream project is Kazuhiko Arase's `qrcode-generator`, and its license is MIT. The upstream source also identifies the QR Code trademark notice for DENSO WAVE. citeturn0search0turn0search7

**SPIKE action:** preserve the MIT notice if redistributed locally; do not imply ownership of the QR Code trademark.

## 4.5 Google Fonts

Observed families include Abril Fatface, Anton, Archivo Black, Bebas Neue, Caveat, Dancing Script, DM Sans, Fira Code, Inter, Lato, Lobster, Manrope, Merriweather, Montserrat, Nunito, Open Sans, Oswald, Pacifico, Playfair Display, Poppins, Raleway, Roboto, Source Serif 4, Space Grotesk, and other Google-hosted families.

**Status: OPEN-SOURCE.**

Google states that Google Fonts are released under open-source licenses and may be used in commercial or non-commercial projects. citeturn1search0turn1search2

**SPIKE action:** record the exact families actually used in production and retain each font's license metadata if fonts are later self-hosted.

---

# 5. Third-party hosted services / external resources

These are not automatically copyright infringements, but SPIKE's use is governed by provider terms and applicable law.

| Service/resource | Use in SPIKE | Status | Required action |
|---|---|---|---|
| Supabase | Auth/database/realtime/Edge Functions | SERVICE | Maintain service/privacy/DPA review |
| Cloudinary | User media upload/delivery | SERVICE | Maintain user-content rules and copyright takedown process |
| Google Fonts | Web fonts | SERVICE + OPEN-SOURCE CONTENT | Keep license record |
| Google Translate endpoint | Translation | SERVICE | Confirm supported API/terms before production reliance |
| WhatsApp `wa.me` | Outbound contact/share links | SERVICE | Normal outbound linking; verify number/business ownership |
| jsDelivr | CDN for open-source libraries | SERVICE/CDN | Pin versions, keep license records |
| Font Awesome CDN | Font Awesome fallback | SERVICE/CDN | Keep Font Awesome attribution |
| `example.com` | Placeholder/test reference found in source | TEST/PLACEHOLDER | Remove if not intentionally required |

---

# 6. Educational content / copyright-sensitive material

## Current SPIKE EDU content

**Status: OWNED / presumed first-party.**

No obvious commercial textbook publisher names, ISBNs, or recognizable publisher attribution were found during the repository scan.

However, educational facts/ideas themselves are not automatically copyrighted merely because they appear in a textbook. The risky activity is copying protected expression, such as substantial textbook wording, diagrams, exercises, tables, answer keys, or scans.

### Rules for future SPIKE content

1. Do not upload scanned commercial textbooks without permission.
2. Do not copy textbook chapters verbatim.
3. Do not copy commercial question banks.
4. Do not copy WAEC/JAMB/university examination papers unless the necessary rights/permission are established.
5. Prefer SPIKE-original explanations and questions.
6. For OER/public-domain content, record the exact source and license.
7. For licensed content, store the permission/license evidence in `legal/licenses/`.
8. For AI-assisted content, retain generation/provenance records and independently review for accidental reproduction.

---

# 7. User-generated content risk

SPIKE supports user profiles, posts, media, rooms, messages and uploads. This creates a **future copyright exposure channel** even if the current codebase contains no infringing material.

Required production controls:

- copyright/content rules in Terms of Service
- copyright complaint/takedown mechanism
- report workflow
- repeat-infringer policy where appropriate
- ability to remove infringing content
- preservation of evidence for disputes
- clear statement that users must have rights to uploaded media
- moderation/escalation procedure

Cloudinary is a storage/delivery service; its existence does not grant SPIKE rights in user-uploaded material.

---

# 8. Duplicate/generated build artifacts

The original archive contains both source and `dist/` copies of many files.

Examples:

- source HTML + `dist/*.html`
- source CSS + `dist/css/*.css`
- source JS + `dist/js/*.js`
- source migrations + `dist/supabase/migrations/*.sql`
- source assets + `dist/assets/*`

**Status:** PROJECT/BUILD ARTIFACT.

These duplicates do not represent additional third-party works. The deployment process should publish only the intended production build.

The archive also contains development/backup variants such as:

- `*.pre-rebuild.html`
- `leveling.pre-safeurl-fix.html`
- `spike_edu.html.pre-v2`

**Required action:** keep these outside the public deployment artifact.

---

# 9. Files requiring provenance before launch

These are the current **must-clear** items:

### YELLOW / brand-clearance priority

2. `assets/icon/icon.png` — Vecteezy source identified; retain exact asset-page/license evidence and do not treat as exclusive trademark-cleared artwork.
3. All 10 badge `.webp` files — **AI-generated by ChatGPT; user-confirmed provenance record retained.**
4. `assets/mp3/incoming.mp3` — **Pixabay-sourced; retain exact asset-page URL/download evidence.**
5. `assets/mp3/notifications.mp3` — **Pixabay-sourced; retain exact asset-page URL/download evidence.** Mixcraft metadata is evidence of editing software only, not rights.
6. `assets/mp3/outgoing.mp3` — **Pixabay-sourced; retain exact asset-page URL/download evidence.**
7. `assets/icon/me.jpg` — AI provenance is explicit; verify applicable generator/account commercial-use terms and retain provenance evidence.

### Production hygiene

8. Remove `example.com` placeholder references unless intentional.
9. Exclude all backup `.pre-*` files from public deployment.
10. Add this register and `docs/legal/THIRD_PARTY_NOTICES.txt` to the repository.
11. If a library is ever vendored locally, include its complete license/NOTICE text.

---

# 10. Provenance evidence to keep

For every third-party or uncertain asset, retain one or more of:

- original download URL
- original file
- license text/PDF
- purchase receipt
- creator invoice
- written permission
- work-for-hire/assignment agreement
- AI generation record/prompt/export metadata where relevant
- C2PA provenance where available
- date obtained
- SHA-256 hash
- screenshots of license terms at acquisition time

Recommended structure:

```text
legal/
  docs/legal/COPYRIGHT_REGISTER.md
  docs/legal/THIRD_PARTY_NOTICES.txt
  licenses/
  permissions/
  asset-provenance/
```

---

# 11. Machine-auditable asset hashes

```text
assets/icon/icon.png
015399988c9c7bc3c3213bd7b00fbce2c9e4d1ef7c7b566b8bbea8eced7a38c5

444781d98eaa8ed40b7bf72454661bd02d5d9d61e6c9a73a0ed2e90e02d15303

assets/icon/me.jpg
0a35795cac675d2b3914228043d21c48d5337a15a865d605a7abfb59376486c8

assets/mp3/incoming.mp3
61924ef011f5b03e4ec49f0f9c9ac32361419607bd5c52f879bc8d0dd4938107

assets/mp3/notifications.mp3
084b78463e30dae4aac5edbf9e9c93cdee5ece4a4a688352e6a2b6686f9b1f4a

assets/mp3/outgoing.mp3
5f8e537f9cd8e31eb8572fd6a8a6e68fa4f9df09c94866c33638a939aa6b1335
```

Badge hashes are listed in §2.4.

---

# 12. Final clearance status

**Current repository clearance:** 🟡 **NOT YET FULLY CLEARED**

The software dependency side is substantially clear: the identified major open-source dependencies have permissive/open licenses. Google Fonts are explicitly permitted for commercial use. citeturn1search0turn0search1turn0search5turn0search0turn2search0

The remaining blocker is **asset provenance**, not evidence of known infringement. The three local audio files now have a documented Pixabay licensing source, but their exact individual asset-page records should still be retained. The remaining unresolved items are the local logo/icon and the AI-generated `me.jpg` terms check.

**Recommended launch gate:** do not label SPIKE's entire asset set "copyright cleared" until all UNKNOWN items are resolved.
