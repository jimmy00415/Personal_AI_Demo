import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
export const clockCases=[
  ...Array.from({length:7},(_,i)=>`2026-09-${20+i}T08:45:00+08:00`),
  '2026-09-16T00:00:00+08:00','2026-09-16T00:01:00+08:00','2026-09-16T12:00:00+08:00','2026-09-16T23:59:59+08:00',
  '2026-12-31T15:59:59Z','2026-12-31T16:00:00Z','2027-01-01T00:01:00+08:00',
  '2024-02-29T15:59:59Z','2024-02-29T16:00:00Z','2023-02-28T16:00:00Z',
  '2026-09-16T03:00:00-07:00','2026-09-16T10:00:00Z','2026-09-16T18:00:00+08:00',
  '0000-01-01T00:00:00Z','0001-01-01T00:00:00Z','-000001-12-31T16:00:00Z',
  '+010000-01-01T00:00:00Z','+275760-09-13T00:00:00.000Z','-271821-04-20T00:00:00.000Z',
  'invalid-date','','+275760-09-13T00:00:00.001Z','-271821-04-19T23:59:59.999Z',
];

export function clockModuleCode(text){return ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}

export function makeCompatibilityBundle(root,baselineClock){
  const code={},resolutions={},pins=[];
  const visit=file=>{
    const name=path.relative(root,file).replaceAll('\\','/');if(code[name])return name;
    const bytes=fs.readFileSync(file);pins.push({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    code[name]=clockModuleCode(bytes.toString('utf8'));resolutions[name]={};
    for(const m of code[name].matchAll(/require\("([^\"]+)"\)/g)){
      if(!m[1].startsWith('.'))throw Error(`Unexpected nonlocal fixture module ${name}: ${m[1]}`);
      const dependency=path.resolve(path.dirname(file),m[1]+'.ts');
      if(!dependency.startsWith(path.resolve(root,'src')+path.sep))throw Error('Fixture module outside src');
      resolutions[name][m[1]]=visit(dependency);
    }
    return name;
  };
  const entry={clock:visit(root+'/src/lib/clock.ts'),scenarios:visit(root+'/src/lib/demo/scenarios.ts'),brief:visit(root+'/src/lib/demo/brief.ts'),persistence:visit(root+'/src/lib/demo/persistence.ts')};
  return {code,resolutions,entry,baselineClockCode:clockModuleCode(baselineClock),cases:clockCases,pins};
}

// This function deliberately has no closure dependencies: it is run unchanged in Node and actual browser pages.
export function evaluateCompatibilityBundle(bundle){
  const graph=baseline=>{const cache={};const load=name=>{
    if(cache[name])return cache[name].exports;const fixtureModule={exports:{}};cache[name]=fixtureModule;
    const code=baseline&&name===bundle.entry.clock?bundle.baselineClockCode:bundle.code[name];
    new Function('exports','module','require',code)(fixtureModule.exports,fixtureModule,spec=>{const target=bundle.resolutions[name][spec];if(!target)throw Error(`Unknown synthetic require ${name}:${spec}`);return load(target);});
    return fixtureModule.exports;
  };return {clock:load(bundle.entry.clock),scenarios:load(bundle.entry.scenarios),brief:load(bundle.entry.brief),persistence:load(bundle.entry.persistence)};};
  const before=graph(true),after=graph(false);
  const probe=fn=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:{name:error.name,message:error.message}};}};
  const clockOutputs=lib=>bundle.cases.map(iso=>({iso,parts:probe(()=>lib.clockParts(iso)),formats:Object.fromEntries(['en','zh-HK'].map(locale=>[locale,Object.fromEntries(['formatDate','formatTime','formatDateTime','formatShortDate'].map(method=>[method,probe(()=>lib[method](iso,locale))]))])),ics:probe(()=>lib.formatIcsUtc(iso)),plusOneMinute:probe(()=>lib.addMinutes(iso,1)),sameDay:probe(()=>lib.isSameDay(iso,iso))}));
  const golden=lib=>['may','doctor-wong'].map(recipient=>{
    let state=lib.scenarios.createScenario('day-before-visit');
    if(recipient!=='may')state.grants.push({id:'synthetic-clock-doctor',patientId:'may',recipientId:recipient,level:'full',categories:['body','medication','appointments','measurements','mood'],status:'active',revision:1,updatedAt:state.clock});
    if(!lib.persistence.isDemoState(state))throw Error('Invalid synthetic compatibility fixture');
    const opened=lib.brief.openBriefDraft(state,'appt-gp',recipient==='may'?undefined:recipient);if(!opened.ok)throw Error(opened.code);state=opened.value;
    const draft=state.briefs.find(b=>b.recipientId===recipient);if(!draft)throw Error('Draft missing');
    const confirmed=lib.brief.confirmBrief(state,draft.id);if(!confirmed.ok)throw Error(confirmed.code);state=confirmed.value;
    const exported=lib.brief.prepareBriefExport(state,draft.id,recipient);if(!exported.ok)throw Error(exported.code);
    return {recipient,state,packet:exported.value,fullTexts:Object.fromEntries(['en','zh-HK'].map(locale=>[locale,lib.brief.briefToText(exported.value,locale)]))};
  });
  const oldGolden=golden(before),newGolden=golden(after);
  const persisted=oldGolden.map(g=>{const state=JSON.parse(JSON.stringify(g.state));const reconciled=after.brief.reconcileBriefs(state),result=after.brief.prepareBriefExport(reconciled,g.packet.id,g.recipient);if(!result.ok)throw Error(result.code);return {recipient:g.recipient,state:reconciled,packet:result.value,fullTexts:Object.fromEntries(['en','zh-HK'].map(locale=>[locale,after.brief.briefToText(result.value,locale)]))};});
  const oldClock=clockOutputs(before.clock),newClock=clockOutputs(after.clock);
  const compare=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${label} exact serialized output mismatch`);};
  compare(oldClock,newClock,'clock');compare(oldGolden,newGolden,'newlyconfirmed personal/shared packet');compare(oldGolden,persisted,'persisted confirmed packet/fingerprint/revision/status');
  const weekdays=oldClock.slice(0,7).map(c=>({en:c.parts.value.weekdayEn,zh:c.parts.value.weekdayZh}));if(new Set(weekdays.map(w=>w.en)).size!==7)throw Error('All seven weekdays not covered');
  const modern=['2026-12-31T23:59:00+08:00','2027-01-01T00:00:00+08:00'];
  const nativeValues=lib=>modern.map(iso=>{const p=lib.clockParts(iso);return `${p.dateKey}T${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;});
  compare(nativeValues(before.clock),nativeValues(after.clock),'datetime-local source values');
  return {scope:'Synthetic isolated actual-Intl/domain differential, not compiled-app UI or performance proof',hostTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,baseline:oldClock,current:newClock,weekdays,baselineGolden:oldGolden,currentGolden:newGolden,persistedGolden:persisted,nativeValues:{baseline:nativeValues(before.clock),current:nativeValues(after.clock)},freshPerCallObject:after.clock.clockParts(modern[0])!==after.clock.clockParts(modern[0]),cases:bundle.cases.length,exactCompatible:true};
}
