import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
for(const file of ["message.html","messages.html"]){
  test(`${file}: final context-menu authority overrides legacy solid/text tokens`,()=>{
    const html=fs.readFileSync(path.join(root,file),"utf8");
    const marker=html.indexOf('<style id="spike-message-context-final-authority">');
    assert.notEqual(marker,-1);
    const block=html.slice(marker,html.indexOf('</style>',marker));
    assert.match(block,/html\[data-spike-style\] #context\.context/);
    assert.match(block,/background:\s*var\(--spike-surface-2/);
    assert.match(block,/color:\s*var\(--spike-text/);
    assert.match(block,/background-color:\s*var\(--spike-surface-2/);
    assert.doesNotMatch(block,/var\(--solid/);
    assert.doesNotMatch(block,/var\(--text/);
    assert.equal(html.lastIndexOf('spike-message-context-final-authority') > html.lastIndexOf('spike-global-page-authority-v2'), true);
  });
}
