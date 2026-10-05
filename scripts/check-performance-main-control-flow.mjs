import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'scripts/measure-demo-performance.mjs');
const source=await fs.readFile(file,'utf8');
const start=source.indexOf('async function main()'),end=source.indexOf('\nif (process.argv[1]',start);
assert(start>0&&end>start,'Actual main boundaries');
const main=source.slice(start,end).replaceAll('import.meta.url','harnessURL');
const {assessGroup,actionIds,routes}=await import(pathToFileURL(file));
const hash=b=>createHash('sha256').update(b).digest('hex');
const output=[];
for(const model of ['first-group-budget-failure','full-valid-pending-review','invalid-first-navigation']){
 const files=new Map(),navigation=[],actions=[],logs=[],server=new EventEmitter();server.stdout=new EventEmitter();server.stderr=new EventEmitter();server.pid=123;server.exitCode=null;server.signalCode=null;let killed=false,closed=false;
 server.kill=()=>{killed=true;server.signalCode='SIGTERM';queueMicrotask(()=>{closed=true;server.emit('close');});};
 const fakeProcess={argv:['node',file],env:{CAREMATE_PERF_OUTPUT:'/sandbox/retained'},execPath:'sandbox-node',version:'sandbox',platform:'sandbox',exitCode:undefined};
 const io={mkdir:async()=>{},writeFile:async(f,b)=>{files.set(path.basename(f),Buffer.from(b));},readFile:async(f,encoding)=>{const b=String(f).endsWith('measure-demo-performance.mjs')?Buffer.from(source):Buffer.from('sandbox-build');return encoding?b.toString():b;}};
 const context=vm.createContext({fs:io,path,process:fakeProcess,Buffer,ROOT:root,harnessURL:pathToFileURL(file).href,fileURLToPath,methodFiles:[],captureSourceBinding:async()=>({files:[]}),sha256:hash,execFileSync:(_bin,args,options)=>options?.encoding?'':Buffer.from(''),os:{release:()=>'',cpus:()=>[{}],totalmem:()=>1},chromium:{executablePath:()=>'/sandbox/unused-chrome'},freePort:async(port)=>{assert.equal(port,3100);return port;},spawn:()=>server,fetch:async()=>({ok:true}),setTimeout,console:{log:x=>logs.push(String(x))},actionIds,routes,assessGroup,
 measureAction:async(_origin,action,iteration)=>{actions.push({action,iteration});return {id:action+'-'+iteration,candidateFeedbackLatencyMs:1,validationErrors:[]};},
 measure:async(_origin,route,device,cache,iteration)=>{const id=route+'-'+device+'-'+cache+'-'+iteration;navigation.push(id);return {id,route,device,cache,iteration,auditLcpMs:1000,observerLcpMs:1000,auditCls:0,observerCls:0,score:model==='first-group-budget-failure'&&navigation.length<=5?89:100,validationErrors:model==='invalid-first-navigation'&&navigation.length===1?['synthetic invalid input']:[]};}});
 let actualError=null;try{await vm.runInContext(main+'\nmain()',context);}catch(error){actualError=error.message;}
 const retained=files.has('results.json')?JSON.parse(files.get('results.json')):null,cleanup=files.has('cleanup.json')?JSON.parse(files.get('cleanup.json')):null;
 const report={model,navigationCalls:navigation.length,actionCalls:actions.length,retainedNavigationSamples:retained?.samples.length??0,retainedGroups:retained?.groups.length??0,retainedGroupErrors:retained?.groups[0]?.errors??[],actualError,pendingExitCode:fakeProcess.exitCode??null,serverKilled:killed,serverClosed:closed,cleanup,failures:[]};
 try{
  assert(killed&&closed&&cleanup?.serverClosed,'Every model closes the owned server');
  assert.equal(actions.length,140,'Original full action model count');
  if(model==='first-group-budget-failure'){assert.equal(navigation.length,5,'First failed group must stop before any following measure');assert.equal(retained?.samples.length,5,'Failed group samples must be retained');assert.equal(retained?.groups.length,1);assert.deepEqual(retained?.groups[0].errors,['Lighthouse score median 89 < 90']);assert.equal(actualError,'Performance budget failed; inspect retained group results and all raw samples');assert(files.has('failure.json'));}
  if(model==='full-valid-pending-review'){assert.equal(navigation.length,340);assert.equal(retained?.samples.length,340);assert.equal(retained?.groups.length,68);assert.equal(actualError,null);assert.equal(fakeProcess.exitCode,2);const status=JSON.parse(files.get('capture-status.json'));assert.equal(status.actionSamples,140);assert.equal(status.navigationSamples,340);assert.equal(status.gatePassed,false);}
  if(model==='invalid-first-navigation'){assert.equal(navigation.length,1);assert(actualError?.startsWith('Instrumentation failed for '));assert(files.has('failure.json'));assert.equal(retained,null);}
 }catch(error){report.failures.push(error.message);}
 output.push(report);
}
const result={scope:'Actual main function control flow with synthetic IO/server/measure boundaries; zero app/browser/network/performance samples',collectorSha256:hash(Buffer.from(source)),mainExtraction:{startByte:Buffer.byteLength(source.slice(0,start)),endByte:Buffer.byteLength(source.slice(0,end)),importMetaOnlyReplacedWithActualFileURL:true},models:output,failures:output.flatMap(m=>m.failures)};
console.log(JSON.stringify(result,null,2));process.exitCode=result.failures.length?1:0;
