import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
for(const file of ["message.html","messages.html"]){
  test(`${file}: context menu uses the message-page dark palette`,()=>{
    const html=fs.readFileSync(path.join(root,file),"utf8");
    const start=html.indexOf("/* Message context-menu visual authority.");
    assert.notEqual(start,-1);
    const end=html.indexOf("</style>",start);
    const block=html.slice(start,end);
    assert.match(block,/var\(--spk-surface/);
    assert.match(block,/var\(--spk-text/);
    assert.match(block,/var\(--spk-border/);
    assert.match(block,/var\(--spk-purple/);
    assert.doesNotMatch(block,/var\(--spike-surface/);
    assert.doesNotMatch(block,/var\(--spike-text/);
  });
}
