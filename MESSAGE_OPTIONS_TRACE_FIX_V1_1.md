# Message Options Contrast Trace — v1.1

## Root cause
The message page has two palette systems. The actual page presentation is driven by `css/spike-beauty-v1.css` and its `--spk-*` variables, while the previous context-menu authority consumed `css/theme.css` `--spike-*` variables. Themes 6/8 can define the latter as light surfaces, so the context menu could become white while the message page remained dark.

## Fix
Updated the existing context-menu authority in `message.html` and `messages.html` to consume the authoritative message-page `--spk-*` palette:
- `--spk-surface`
- `--spk-surface-2`
- `--spk-text`
- `--spk-border`
- `--spk-purple`
- `--spk-danger`

No additional competing menu handler was added. No Supabase/backend files were changed.

## Verification
- Focused context-menu contrast tests: PASS (3/3 test cases; 4/4 assertions in the existing contrast test)
- Full project audit: 344 passed / 10 failed / 1 skipped. The 10 failures are pre-existing unrelated failures.
- The prior invalid download path was corrected; this package is created at the exact sandbox path reported in the final response.
