# Message Options Final Trace — v1-2

## Root cause
The context menu inherited the legacy page token `--solid:#fff` and `--text`, while the active SPIKE theme was using `--spike-surface-2` and `--spike-text`. The previous authority block used `--spk-*`, but the reliable final theme authority is `--spike-*` from `css/theme.css`.

## Fix
A final, last-in-document authority now targets `html[data-spike-style] #context.context` in both `message.html` and `messages.html`. It uses `--spike-surface-2` for the menu surface and `--spike-text` for labels, with explicit hover/focus/icon/danger states. It contains no dependency on `--solid` or `--text`.

## Verification
Static regression test verifies both pages contain the final authority after the global page authority and that the final block cannot fall back to legacy `--solid`/`--text` tokens.
