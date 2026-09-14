# SPIKE Local Language Build

Base: Original `CLEAN PROJECT.zip` supplied for this build.
Language architecture: local/offline-first JSON packs; no Supabase translation table or API dependency.

Languages:
- en — English
- fr — Français
- ig — Igbo
- yo — Yorùbá
- ha — Hausa
- pcm — Nigerian Pidgin

Each pack contains 2,138 matching keys.

Runtime:
- `js/spike-i18n.js`
- `assets/i18n/{en,fr,ig,yo,ha,pcm}.json`

The language selector is injected into Settings. The selected language is stored in localStorage/cookie.
English is the fallback when a key or language pack is unavailable.
User-entered fields and contenteditable/code elements are excluded.
Dynamic DOM changes are translated when they match a known English key.

Safety:
This build was created by extracting the supplied clean project and modifying only the intended language integration. Existing project files were not sourced from the previous language/realtime builds.
