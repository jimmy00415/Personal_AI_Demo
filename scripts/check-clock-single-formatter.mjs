import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {makeCompatibilityBundle,evaluateCompatibilityBundle} from './clock-compatibility-fixtures.mjs';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baselineDirectory=path.join(root,'docs/superpowers/evidence/2026-10-04/task-10/r60-one-formatter');
const args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--output-dir'),'Use no arguments (read-only), or --output-dir NEW_DIRECTORY');
let output;
if(args.length){
  const requested=path.resolve(args[1]);
  output=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
  const relative=path.relative(fs.realpathSync(baselineDirectory),output);
  assert(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Output must be outside the immutable baseline directory');
  fs.mkdirSync(output); // Exclusive: an existing output directory fails before assertions or writes.
  console.log(JSON.stringify({outputDirectory:output}));
}
const source=fs.readFileSync(root+'/src/lib/clock.ts','utf8');
const metrics={constructors:0,formatToParts:0,format:0};
const Counted=new Proxy(Intl.DateTimeFormat,{construct(target,args,newTarget){
  metrics.constructors++;
  const formatter=Reflect.construct(target,args,newTarget);
  return new Proxy(formatter,{get(instance,key){
    const value=Reflect.get(instance,key,instance);
    if(key==='formatToParts'||key==='format')return (...args)=>{metrics[key]++;return Reflect.apply(value,instance,args);};
    return typeof value==='function'?value.bind(instance):value;
  }});
}});
export function loadClock(text,dateTimeFormat=Intl.DateTimeFormat){
  const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,Intl:{DateTimeFormat:dateTimeFormat},Date,Number,String},{filename:'clock-module-under-test.js'});return exports;
}
const clock=loadClock(source,Counted);
const result=clock.clockParts('2026-09-21T08:45:00+08:00');
console.log(JSON.stringify({resourceMetrics:metrics,actualClockParts:result,scope:'Resource operation contract, not a performance measurement'}));
assert.deepEqual(metrics,{constructors:1,formatToParts:1,format:0},'One fixed formatter and one formatToParts; no dedicated weekday formatting');
assert.equal(result.dateKey,'2026-09-21');
assert.equal(result.weekdayEn,'Monday');
assert.equal(result.weekdayZh,'星期一');
assert.notEqual(clock.clockParts('2026-09-21T08:45:00+08:00'),clock.clockParts('2026-09-21T08:45:00+08:00'),'Per-call result object remains fresh');
console.log('PASS one-formatter resource and per-call result contract');
const baseline=fs.readFileSync(path.join(baselineDirectory,'clock-before-r60.ts.txt'),'utf8');
const bundle=makeCompatibilityBundle(root,baseline),comparison=evaluateCompatibilityBundle(bundle);
assert(comparison.freshPerCallObject);
if(output){
  fs.writeFileSync(path.join(output,'node-exact-differential.json'),JSON.stringify(comparison,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(output,'compatibility-bundle-pins.json'),JSON.stringify(bundle.pins,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({cases:comparison.cases,weekdays:comparison.weekdays,confirmedRecipients:comparison.currentGolden.map(g=>g.recipient),exactCompatible:comparison.exactCompatible,hostTimezone:comparison.hostTimezone,scope:comparison.scope}));
