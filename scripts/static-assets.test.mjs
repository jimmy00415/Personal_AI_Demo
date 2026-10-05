import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {canonicalStaticAssets} from './build-static-demo.mjs';

test('canonical exported assets preserve exact bytes, reject conflicts, and are idempotent',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-static-assets-'));
  const original=path.join(root,'health','__next.health','__PAGE__.txt'),canonical=path.join(root,'health','__next.health.__PAGE__.txt');
  await fs.mkdir(path.dirname(original),{recursive:true});await fs.writeFile(original,Buffer.from([0,10,31,127,255]));await fs.writeFile(canonical,'conflict');
  await assert.rejects(canonicalStaticAssets(root),/Conflicting canonical/);assert.equal(await fs.readFile(canonical,'utf8'),'conflict');
  await fs.unlink(canonical);const first=await canonicalStaticAssets(root);assert.equal(first.aliases.length,1);assert.deepEqual(await fs.readFile(original),await fs.readFile(canonical));
  const again=await canonicalStaticAssets(root);assert.equal(again.aliases[0].created,false);assert.equal(again.aliases[0].sha256,first.aliases[0].sha256);
  const native=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-static-canonical-'));await fs.writeFile(path.join(native,'__next.health.__PAGE__.txt'),'already canonical');assert.deepEqual((await canonicalStaticAssets(native)).aliases,[]);
  await fs.symlink(native,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(canonicalStaticAssets(root),/symlink rejected/);
  await assert.rejects(canonicalStaticAssets(path.join(root,'escape')),/root symlink rejected/);
});
