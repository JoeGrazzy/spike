import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();

test("Feature Suite collaboration RPC is shipped in the local migration",()=>{
  const files=fs.readdirSync(path.join(root,"supabase","migrations"));
  const migrations=files.filter(x=>x.endsWith(".sql"));
  const found=migrations.some(x=>fs.readFileSync(path.join(root,"supabase","migrations",x),"utf8").includes("spike_signal_collaboration_respond"));
  assert.equal(found,true,"Missing collaboration response RPC migration");
  const suite=fs.readFileSync(path.join(root,"js","spike-feature-suite.js"),"utf8");
  assert.match(suite,/rpc\([\'\"]spike_signal_collaboration_respond[\'\"]/);
});
