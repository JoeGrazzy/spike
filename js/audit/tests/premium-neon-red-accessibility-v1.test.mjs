import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css=await readFile('css/spike-three-theme-authority.css','utf8');
function luminance(hex){const values=hex.replace('#','').match(/.{2}/g).map(value=>parseInt(value,16)/255);const rgb=values.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(values[0]+.05)/(values[1]+.05);}
test('Cosmic Pulse primary action endpoints meet WCAG AA for white text',()=>{assert.ok(contrast('#ffffff','#9d35b4')>=4.5);assert.ok(contrast('#ffffff','#7c2792')>=4.5);assert.match(css,/--spike-action-bg-2:#7c2792/);});
test('Cosmic Pulse selection and outgoing bubbles use readable foreground colors',()=>{assert.ok(contrast('#110b19','#e879f9')>=4.5);assert.match(css,/html\[data-spike-style="5"\] ::selection\{background:#e879f9;color:#110b19;\}/);assert.match(css,/linear-gradient\(135deg,#9d35b4,#7c2792\)!important;color:#fff!important/);});
test('Cosmic Pulse glow remains decorative and focus indicators stay explicit',()=>{assert.match(css,/--spike-accent:#e879f9/);assert.match(css,/--spike-focus:#f0abff/);assert.match(css,/focus-visible\{outline:3px solid var\(--spike-focus\)!important/);});
