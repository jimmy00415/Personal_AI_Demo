import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';

const workflow=await fs.readFile('.github/workflows/github-pages.yml','utf8');
const prefix='docs/superpowers/evidence/';
async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-ci-retention-'));
  execFileSync('git',['init','--quiet'],{cwd:root});
  await fs.mkdir(path.join(root,prefix,'historical'),{recursive:true});
  await fs.writeFile(path.join(root,prefix,'historical/bound.json'),'original\r\nhistory\n');
  execFileSync('git',['add','--',prefix],{cwd:root});
  execFileSync('git',['-c','user.name=Synthetic contract','-c','user.email=synthetic@example.invalid','commit','--quiet','-m','Historical tracked evidence'],{cwd:root});
  await fs.mkdir(path.join(root,prefix,'current'),{recursive:true});
  const binary=Buffer.from([0,255,128,1,13,10,222]),mixed=Buffer.from('partial gate failure\r\nexact raw\n');
  await fs.writeFile(path.join(root,prefix,'current/native.png'),binary);
  await fs.writeFile(path.join(root,prefix,'current/failed.log'),mixed);
  return{root,binary,mixed};
}
async function collect(root, syntheticInventory){
  const match=workflow.match(/          node --input-type=module <<'CAREMATE_CURRENT_EVIDENCE'\r?\n([\s\S]+?)\r?\n          CAREMATE_CURRENT_EVIDENCE/);
  if(match){let code=match[1].split(/\r?\n/).map(line=>line.slice(10)).join('\n');
    // Constructed untrusted Git-inventory boundary only; every path/copy guard remains exact workflow code.
    if(syntheticInventory){const line=code.split('\n').find(line=>line.startsWith('const names=execFileSync'));assert.ok(line);code=code.replace(line,()=>`const names=${JSON.stringify(syntheticInventory)};`);}
    const result=spawnSync(process.execPath,['--input-type=module'],{cwd:root,input:code,encoding:'utf8'});return result;}
  // Genuine old workflow selection: upload-artifact was pointed at the entire evidence tree.
  assert.match(workflow,/path: docs\/superpowers\/evidence\//);
  const out=path.join(root,'.ci-acceptance-evidence');await fs.cp(path.join(root,prefix),out,{recursive:true});return{status:0,stderr:''};
}
async function cleanup(root){const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'caremate-ci-retention-'));await fs.rm(resolved,{recursive:true,force:true});}
test('bounded dot-directory upload is explicit, nonempty and always retained after failure',()=>{
  assert.match(workflow,/name: Collect complete current acceptance evidence\r?\n        if: always\(\)/);
  assert.match(workflow,/name: Retain complete current acceptance evidence\r?\n        if: always\(\)/);
  assert.match(workflow,/path: \.ci-acceptance-evidence\/\r?\n          include-hidden-files: true\r?\n          if-no-files-found: error/);
});
test('current binary and mixed-EOL failure evidence retained without reuploading tracked history',async()=>{
  const f=await fixture();
  try{const r=await collect(f.root);assert.equal(r.status,0,r.stderr);const out=path.join(f.root,'.ci-acceptance-evidence');
    // This substantive selection predicate fails against the old broad workflow before any repair.
    const all=await fs.readdir(out,{recursive:true});assert.ok(!all.some(name=>name.includes('historical')),'Tracked history is duplicated by broad artifact selection');
    assert.deepEqual(await fs.readFile(path.join(out,prefix,'current/native.png')),f.binary);
    assert.deepEqual(await fs.readFile(path.join(out,prefix,'current/failed.log')),f.mixed);
    assert.equal(await fs.readFile(path.join(f.root,prefix,'historical/bound.json'),'utf8'),'original\r\nhistory\n');
    const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));assert.equal(manifest.files.length,2);assert.ok(manifest.files.every(row=>row.sha256===row.readbackSha256&&Number.isFinite(Date.parse(row.copiedAt))));
  }finally{await cleanup(f.root);}
});
test('unsafe evidence symlink fails rather than reading unrelated files',async()=>{
  if(!workflow.includes('CAREMATE_CURRENT_EVIDENCE'))return; // Original behavior RED is the first test; this is a new guard contract.
  const f=await fixture();try{const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret'),'outside evidence');await fs.symlink(outside,path.join(f.root,prefix,'current/junction'),process.platform==='win32'?'junction':'dir');const r=await collect(f.root);assert.notEqual(r.status,0);assert.match(r.stderr,/symlink|non-file|directory/i);}finally{await cleanup(f.root);}
});
for(const name of ['docs/superpowers/evidence/../outside','docs/superpowers/evidence/current\\other','/absolute','docs/superpowers/evidence/current/missing.png'])test('untrusted inventory fails closed: '+name,async()=>{const f=await fixture();try{const r=await collect(f.root,[name]);assert.notEqual(r.status,0);assert.match(r.stderr,/Unsafe evidence path|ENOENT/);}finally{await cleanup(f.root);}});
