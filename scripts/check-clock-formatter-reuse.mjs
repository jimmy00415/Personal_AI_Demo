import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=await fs.readFile(new URL('../src/lib/clock.ts',import.meta.url),'utf8');
const load=(text,dateTimeFormat=Intl.DateTimeFormat)=>{
 const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,Intl:{DateTimeFormat:dateTimeFormat},Date,Number,String},{filename:'clock-module-under-test.js'});return exports;
};
let constructed=0;const configs=[];
const Counted=new Proxy(Intl.DateTimeFormat,{construct(target,args,newTarget){constructed++;configs.push(args);return Reflect.construct(target,args,newTarget);}});
const clock=load(source,Counted);
const baselineText=await fs.readFile(new URL('../docs/superpowers/evidence/2026-10-04/task-10/clock-before-r39.ts.txt',import.meta.url),'utf8'),baseline=load(baselineText);
let passed=0;const check=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
const dates=['2026-09-17T11:00:00+08:00','2026-09-16T20:15:00+08:00','2026-12-31T15:59:59Z','2026-12-31T16:00:00Z','2027-01-01T00:01:00+08:00','2026-09-16T00:00:00+08:00','2026-09-16T12:00:00+08:00','2026-09-16T23:59:00+08:00','2024-02-29T16:00:00Z','2026-09-16T03:00:00-07:00'];
for(const iso of dates){
 check(`clockParts preserves per-call HKT fields ${iso}`,()=>assert.deepEqual(JSON.parse(JSON.stringify(clock.clockParts(iso))),JSON.parse(JSON.stringify(baseline.clockParts(iso)))));
 for(const locale of ['en','zh-HK'])for(const method of ['formatDate','formatTime','formatDateTime','formatShortDate'])check(`${method} ${locale} ${iso}`,()=>assert.equal(clock[method](iso,locale),baseline[method](iso,locale)));
 check(`ICS stays exact UTC ${iso}`,()=>assert.equal(clock.formatIcsUtc(iso),baseline.formatIcsUtc(iso)));
}
check('Hong Kong midnight crosses year while UTC date remains prior year',()=>{assert.equal(clock.clockParts(dates[2]).dateKey,'2026-12-31');assert.equal(clock.clockParts(dates[3]).dateKey,'2027-01-01');});
check('distinct dates remain distinct after formatter reuse',()=>assert.notEqual(clock.formatDateTime(dates[0],'zh-HK'),clock.formatDateTime(dates[1],'zh-HK')));
check('same-day uses Hong Kong calendar for distinct UTC offsets',()=>assert.equal(clock.isSameDay('2026-09-16T16:00:00Z','2026-09-17T01:00:00+08:00'),true));
for(const method of ['clockParts','formatDate','formatTime','formatDateTime','formatShortDate'])check(`${method} preserves invalid-date RangeError`,()=>{assert.throws(()=>clock[method]('invalid-date','en'),{name:'RangeError'});assert.throws(()=>clock[method]('invalid-date','zh-HK'),{name:'RangeError'});});
check('repeated formatting has bounded formatter construction across dates/languages',()=>assert.equal(constructed,1,'Only the fixed date/time/long-weekday option set may be constructed for this module lifetime'));
check('formatter locale/timezone/configs remain exact',()=>assert.deepEqual(configs.map(v=>JSON.parse(JSON.stringify(v))),[['en-HK',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'numeric',day:'numeric',weekday:'long',hour:'numeric',minute:'2-digit',hour12:false}]]));
console.log(JSON.stringify({passed,formatterConstructors:constructed,scope:'Finite semantic and resource proof only; no browser timing or performance gate'},null,2));
