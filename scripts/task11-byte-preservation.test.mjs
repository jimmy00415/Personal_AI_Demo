import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('Windows autocrlf checkout preserves hash-bound Task11 fixture, helper and mixed historical bytes', async () => {
  const root=process.cwd();
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-task11-checkout-contract-'));
  const git=(...args)=>execFileSync('git',['-c','core.autocrlf=true','-c','user.name=CareMate synthetic checkout','-c','user.email=synthetic@example.invalid',...args],{cwd:temporary,encoding:'utf8'});
  const names=[
    'docs/superpowers/evidence/2026-10-04/task-11/researcher/assets/snapshots/U1-zh-HK.json',
    'docs/superpowers/evidence/2026-10-04/task-11/researcher/assets/prepare-load.mjs',
    'docs/superpowers/evidence/2026-10-04/task-11/researcher/assets/generation-validation.json',
  ];
  git('init','--quiet');
  await fs.copyFile(path.join(root,'.gitattributes'),path.join(temporary,'.gitattributes'));
  const original=new Map();
  for(const name of names){const b=await fs.readFile(path.join(root,name));original.set(name,b);await fs.mkdir(path.dirname(path.join(temporary,name)),{recursive:true});await fs.writeFile(path.join(temporary,name),b,{flag:'wx'});}
  git('add','--','.gitattributes',...names);
  git('commit','--quiet','-m','Synthetic byte-preservation checkout contract');
  const checkout=path.join(temporary,'checkout');await fs.mkdir(checkout);
  git('checkout-index','--all',`--prefix=${checkout.replaceAll('\\','/')}/`);
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const checks=[];
  for(const name of names){const b=await fs.readFile(path.join(checkout,name));checks.push({name,originalSha256:sha(original.get(name)),checkoutSha256:sha(b),originalBytes:original.get(name).length,checkoutBytes:b.length});}
  console.log(JSON.stringify({scope:'Synthetic local temporary repository; actual branch/index/global Git settings untouched',temporary,coreAutocrlf:true,checks}));
  for(const name of names)assert.deepEqual(await fs.readFile(path.join(checkout,name)),original.get(name),`Hash-bound ${name} changed during checkout`);
});
