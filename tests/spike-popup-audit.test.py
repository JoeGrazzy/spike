#!/usr/bin/env python3
"""Static regression checks for SPIKE's shared popup and long-press UI."""
from pathlib import Path
import re, sys
ROOT = Path(__file__).resolve().parents[1]
errors=[]
def check(ok, message):
    if not ok: errors.append(message)

dialog=(ROOT/'js/spike-dialog.js').read_text(encoding='utf8')
check('aria-modal' in dialog and "role','dialog" in dialog, 'Shared dialog must expose modal semantics.')
check("e.key==='Escape'" in dialog and "e.key==='Tab'" in dialog, 'Shared dialog must support Escape and focus trapping.')
check('prefers-reduced-motion:reduce' in dialog, 'Shared dialog must respect reduced motion.')
check('max-height:min(88dvh' in dialog and 'align-items:center' in dialog, 'Shared dialog must stay centered and viewport-bounded.')
message=(ROOT/'message.html').read_text(encoding='utf8')
check('js/spike-dialog.js' in message, 'Private-message page must load the shared dialog system.')
check('align-items:center' in message and 'messageMenuShade' in message, 'Private-message long-press menu must be centered.')
for action in ['reply','copy','like','share','archive','delete','close']:
    check(f'data-msg-action="{action}"' in message, f'Private-message menu action missing: {action}')
check('SPIKEPremiumDialog.confirm' in message and 'if(!confirm(' not in message, 'Message deletion must use branded confirmation.')
feed=(ROOT/'feed.html').read_text(encoding='utf8')
check('spike-centered-popup-final' in feed and '#menuOverlay.spike-menu-overlay.open' in feed, 'Feed command/long-press menu must use centered override.')
roomchat=(ROOT/'room_chat.html').read_text(encoding='utf8')
check('spike-centered-action-menus' in roomchat and '.actionSheetShade{align-items:center!important' in roomchat, 'Room chat action menu must be centered.')
# Catch actual bare native calls; ignore the shared API method declarations themselves.
pat=re.compile(r'(?<![.\w$])(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(', re.I)
for p in ROOT.rglob('*'):
    if p.suffix not in ('.html','.js') or p.name=='spike-dialog.js' or 'node_modules' in p.parts: continue
    source=p.read_text(encoding='utf8',errors='ignore')
    for m in pat.finditer(source):
        # Ignore comments and quoted source examples conservatively by flagging all remaining hits for review.
        errors.append(f'Possible native browser popup call: {p.relative_to(ROOT)}:{source.count(chr(10),0,m.start())+1}')
# Every HTML page that calls the shared API should load the shared script.
for p in ROOT.rglob('*.html'):
    source=p.read_text(encoding='utf8',errors='ignore')
    if 'SPIKEPremiumDialog.' in source:
        check('js/spike-dialog.js' in source, f'{p.relative_to(ROOT)} uses shared dialog API without loading it.')
if errors:
    print(f'FAIL: {len(errors)} popup regression check(s) failed')
    print('\n'.join(errors));sys.exit(1)
print('PASS: shared dialog accessibility, centered viewport layout, long-press actions, native-popup scan, and script includes.')
