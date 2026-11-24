import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())return walk(full);
  return [full];
});
const htmlFiles=walk(root).filter(file=>file.endsWith('.html')&&!file.includes(`${path.sep}supabase${path.sep}`)&&!file.includes(`${path.sep}legacy_migrations${path.sep}`));
const cssFiles=walk(path.join(root,'css')).filter(file=>file.endsWith('.css'));
const jsFiles=walk(path.join(root,'js')).filter(file=>file.endsWith('.js'));
jsFiles.push(path.join(root,'worker.js'));
for(const file of jsFiles){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)errors.push(`JavaScript syntax: ${path.relative(root,file)}\n${result.stderr||result.stdout}`);
}
for(const file of htmlFiles){
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/gi)){
    const ref=match[1].trim();
    if(!ref||ref.includes('${')||/^(?:#|data:|javascript:|mailto:|tel:|https?:|\/\/)/i.test(ref))continue;
    const clean=ref.split(/[?#]/,1)[0];
    if(!clean)continue;
    const target=clean.startsWith('/')?path.join(root,clean.slice(1)):path.resolve(path.dirname(file),clean);
    if(!fs.existsSync(target))errors.push(`Missing local reference: ${path.relative(root,file)} -> ${ref}`);
  }
}
for(const file of cssFiles){
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)){
    const ref=match[2].trim();
    if(!ref||/^(?:data:|https?:|blob:|#|var\()/i.test(ref))continue;
    const clean=ref.split(/[?#]/,1)[0];
    const target=clean.startsWith('/')?path.join(root,clean.slice(1)):path.resolve(path.dirname(file),clean);
    if(!fs.existsSync(target))errors.push(`Missing CSS asset: ${path.relative(root,file)} -> ${ref}`);
  }
}
const wrangler=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
if(wrangler.main!=='worker.js')errors.push('Wrangler main must point to worker.js');
if(!fs.existsSync(path.join(root,wrangler.main||'worker.js')))errors.push('Worker entrypoint is missing');
if(wrangler.assets?.not_found_handling==='404-page'&&!fs.existsSync(path.join(root,'404.html')))errors.push('404-page handling requires 404.html');
if(wrangler.assets?.binding!=='ASSETS')errors.push('Wrangler assets binding must be ASSETS');
const migrationDir=path.join(root,'supabase','migrations');
const versions=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).map(name=>name.slice(0,14)).sort();
if(new Set(versions).size!==versions.length)errors.push('Duplicate active Supabase migration versions detected');
const expectedRemoteVersions=`
20261118182458 20261118182603 20261118182628 20261118182902 20261118183107 20261118183158 20261118183405 20261118183414 20261118183706 20261118183728 20261118183749 20261118183944 20261118184329 20261118184342 20261118184507 20261118205843 20261118205959 20261118211133 20261118224629 20261118230201 20261118230538 20261119044607 20261119044619 20261119050842 20261119063522 20261119064905 20261119065029 20261119065139 20261119074429 20261119074503 20261119074546 20261119075042 20261119081130 20261119090209 20261119091740 20261119095009 20261119095028 20261119095202 20261119100135 20261119100349 20261119100416 20261119101227 20261119101333 20261119101510 20261119110754 20261119111029 20261119111036 20261119112435 20261119112616 20261119113516 20261119113552 20261119113639 20261119113856 20261119130823 20261119130844 20261119131019 20261119131222 20261119131758 20261119131823 20261119173201 20261119174015 20261119174345 20261119174436 20261119174552 20261122114755 20261122162047 20261122162317 20261123230119 20261123230328 20261123230519 20261123230619 20261123231104 20261123231108 20261123231157 20261123231216 20261123231416 20261123231607 20261123232806 20261123232852
`.trim().split(/\s+/).sort();
const additiveLocalVersions=['20261123234241','20261124001015','20261124002203','20261124002243','20261124002409','20261124044627'];
const expectedLocalVersions=[...expectedRemoteVersions,...additiveLocalVersions].sort();
if(versions.length!==expectedLocalVersions.length||versions.some((version,index)=>version!==expectedLocalVersions[index]))errors.push('Local Supabase migration versions do not match the known production baseline plus explicitly reviewed additive migrations');
const messagingSource=fs.readFileSync(path.join(root,'js','spike-messages.js'),'utf8');
if(!/currentPeerId\s*=\s*!isGroup\s*&&\s*peerId/.test(messagingSource))errors.push('Direct-message setup must assign the resolved one-to-one call recipient');
const callSource=fs.readFileSync(path.join(root,'js','spike-call-engine.js'),'utf8');
if(callSource.includes('/api/call-ice'))errors.push('STUN-only call engine must not depend on the external TURN credential endpoint');
if(callSource.includes('await loadIceServers()'))errors.push('STUN-only ICE server selection must not perform an unnecessary async credential lookup');
if(fs.readFileSync(path.join(root,'worker.js'),'utf8').includes('call-ice'))errors.push('Unused TURN credential route must not remain in the Worker');
if(!callSource.includes("client().rpc(callerMissed?'spike_mark_call_missed':'spike_end_call'"))errors.push('Caller no-answer path must finalize the call as missed');
if(!callSource.includes('client().channel(`spike-call-events-${userId}`)'))errors.push('Call Postgres Changes listener must use the separate table-RLS-protected channel');
if(!callSource.includes('db.channel(`spike-call:${callId}`,{config:{private:true,broadcast:{ack:true,self:false}}})'))errors.push('SDP/ICE signaling channel must remain private with delivery acknowledgements');
const callMfaMigration=fs.readFileSync(path.join(migrationDir,'20261124001015_spike_call_sessions_mfa_enforcement_v1.sql'),'utf8');
if(!callMfaMigration.includes('private.mfa_access_allowed()')||!callMfaMigration.includes('private.enforce_mfa_for_opted_in_user()'))errors.push('Call-session migration must enforce the existing opt-in MFA policy and DML guard');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!pkg.scripts?.deploy||!pkg.devDependencies?.wrangler)errors.push('package.json must include a Wrangler deployment script and dependency');
const ignore=fs.readFileSync(path.join(root,'.assetsignore'),'utf8');
for(const required of ['worker.js','supabase','*.sql','package.json'])if(!ignore.split(/\r?\n/).includes(required))errors.push(`Missing .assetsignore entry: ${required}`);
if(errors.length){console.error(`SPIKE validation failed (${errors.length} issue(s))`);for(const error of errors)console.error(`\n- ${error}`);process.exit(1);}
console.log(`SPIKE validation passed: ${jsFiles.length} JavaScript files, ${htmlFiles.length} HTML pages and ${cssFiles.length} CSS files checked; local references, Worker config and known production migration baseline and additive migrations are consistent.`);
