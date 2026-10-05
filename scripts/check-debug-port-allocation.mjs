import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as method from './measure-demo-performance.mjs';

const source=await fs.readFile(new URL('./measure-demo-performance.mjs',import.meta.url),'utf8');
if(process.argv.includes('--old-contract-red')) {
  // Constructed OS-return fixture, not a browser measurement. The retained
  // actual1719 failure and isolated real Fetch denial provide the live evidence.
  const helperStart=source.indexOf('export async function freeDebugPort(');
  const original=source.slice(source.indexOf('async function freePort('),helperStart>=0?helperStart:source.indexOf('async function saveRaw('));
  const lifecycle=[];
  const net={createServer:()=>({once(){return this;},listen(port,host,resolve){lifecycle.push({port,host});resolve();},address(){return {port:1719};},close(resolve){lifecycle.push('closed');resolve();}})};
  const old=vm.runInNewContext(`(${original.trim()})`,{net});
  const port=await old();
  assert.deepEqual(lifecycle,[{port:0,host:'127.0.0.1'},'closed']);
  console.log('SYNTHETIC old OS allocation returned1719 after close; retained actual Fetch denial is separate evidence');
  assert.ok(Number.isSafeInteger(port)&&port>=49152&&port<=49215,'Navigation debug port must be requested from the bounded Fetch-permitted private range');
  process.exit(0);
}

let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
const allocate=method.freeDebugPort;
assert.equal(typeof allocate,'function');
await test('first requested port is returned only after allocation closes',async()=>{
  const events=[];
  const result=await allocate(async port=>{events.push(['bound',port]);await Promise.resolve();events.push(['closed',port]);return port;});
  events.push(['returned',result]);assert.deepEqual(events,[['bound',49152],['closed',49152],['returned',49152]]);
});
await test('only pre-browser occupied first port advances once',async()=>{
  const attempts=[];let browserStarted=false;
  const result=await allocate(async port=>{assert.equal(browserStarted,false);attempts.push(port);if(port===49152)throw Object.assign(Error('occupied'),{code:'EADDRINUSE'});return port;});
  browserStarted=true;assert.equal(result,49153);assert.deepEqual(attempts,[49152,49153]);
});
await test('all64 occupied exhaust without a65th attempt',async()=>{
  const attempts=[];await assert.rejects(allocate(async port=>{attempts.push(port);throw Object.assign(Error('occupied'),{code:'EADDRINUSE'});}),/exhaust/i);
  assert.deepEqual(attempts,Array.from({length:64},(_,i)=>49152+i));
});
for(const code of ['EACCES','EINVAL','EADDRNOTAVAIL','ECONNRESET',undefined])await test(`non-occupancy error ${code} propagates unchanged without another attempt`,async()=>{
  const error=Object.assign(Error('failure'),code?{code}:{}),attempts=[];
  await assert.rejects(allocate(async port=>{attempts.push(port);throw error;}),e=>e===error);assert.deepEqual(attempts,[49152]);
});
for(const value of [0,1719,49151,49153,49216,65536,NaN,Infinity,-Infinity,49152.5,Number.MAX_SAFE_INTEGER+1,'49152',null,undefined])await test(`invalid or mismatched allocated return ${String(value)} rejects immediately`,async()=>{
  const attempts=[];await assert.rejects(allocate(async port=>{attempts.push(port);return value;}),/debug.port|allocated.port/i);assert.deepEqual(attempts,[49152]);
});
await test('last64th permitted candidate succeeds without stepping beyond49215',async()=>{
  const attempts=[];const result=await allocate(async port=>{attempts.push(port);if(port<49215)throw Object.assign(Error('occupied'),{code:'EADDRINUSE'});return port;});
  assert.equal(result,49215);assert.equal(attempts.length,64);
});
await test('all64 candidates absent from the exact pinned installed Fetch bad-port list',async()=>{
  const builtin=process.binding('natives')['internal/deps/undici/undici'];
  const section=builtin.slice(builtin.indexOf('var badPorts ='),builtin.indexOf('var badPortsSet ='));
  assert.ok(section.includes('"1719"'));const blocked=new Set([...section.matchAll(/"(\d+)"/g)].map(m=>Number(m[1])));
  for(let port=49152;port<=49215;port++)assert.equal(blocked.has(port),false);
});
await test('all64 candidates absent from the archived primary WHATWG bad-port table',async()=>{
  const html=await fs.readFile(new URL('../docs/superpowers/evidence/2026-10-04/task-10/performance-matrix-1791102766734/bad-port-diagnosis/fetch-port-blocking.excerpt.html.txt',import.meta.url),'utf8');
  const blocked=new Set([...html.matchAll(/<td>\s*(\d+)\s*(?:<td>|<\/td>)/g)].map(m=>Number(m[1])));
  assert.ok(blocked.has(1719));assert.ok(blocked.has(10080));
  for(let port=49152;port<=49215;port++)assert.equal(blocked.has(port),false);
});
await test('navigation allocator occurs before browser startup and never in post-start catch',async()=>{
  const body=source.slice(source.indexOf('async function measure('),source.indexOf('export const actionTraceStartRequest'));
  assert.equal((body.match(/freeDebugPort\(/g)||[]).length,1);
  assert.ok(body.indexOf('freeDebugPort(')<body.indexOf('chromium.launchPersistentContext'));
  assert.ok(source.includes('await freePort(3100);'));
});
console.log(`PASS ${checks} finite debug-port checks; constructed allocator guards, no performance acceptance`);
