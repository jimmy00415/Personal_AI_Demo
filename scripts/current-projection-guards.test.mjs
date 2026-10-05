import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(file){const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute).exports;const fixtureModule={exports:{}};cache.set(absolute,fixtureModule);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','module','require',code)(fixtureModule.exports,fixtureModule,spec=>{assert.ok(spec.startsWith('.'));return load(path.resolve(path.dirname(absolute),spec+'.ts'));});return fixtureModule.exports;}
const {createScenario}=load('src/lib/demo/scenarios.ts');
const {selectSharingProjection,setConsent}=load('src/lib/demo/sharing.ts');
const {selectEpisodeObservation}=load('src/lib/demo/episode-facts.ts');
test('equal occurredAt ties use declared code-unit IDs rather than host collation',()=>{
  let d=createScenario('dizziness');const o=d.observations.find(o=>o.id==='bp-16');
  d.observations=[{...o,id:'B-tie',systolic:125},{...o,id:'a-tie',systolic:160}];d.episodes[0].sourceRecordIds=['B-tie','a-tie'];
  assert.equal(selectEpisodeObservation(d,d.episodes[0]).id,'B-tie');
  d.checkIns=[{id:'B-tie',draftId:'draft-B',patientId:'may',occurredAt:d.clock,enteredAt:d.clock,mood:'good',body:'well',note:'',revision:1},{id:'a-tie',draftId:'draft-a',patientId:'may',occurredAt:d.clock,enteredAt:d.clock,mood:'low',body:'tired',note:'',revision:1}];
  const r=setConsent(d,{patientId:'may',recipientId:'david',level:'summary',categories:['body','mood']});assert.ok(r.ok);d=r.value;
  assert.ok(selectSharingProjection(d,'may','david').summary.some(t=>t.en==='Feeling well'));
  assert.deepEqual(selectSharingProjection(d,'may','david').summary,selectSharingProjection({...d,checkIns:[...d.checkIns].reverse()},'may','david').summary);
});
