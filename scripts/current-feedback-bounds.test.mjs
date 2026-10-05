import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {actionIds} from './measure-demo-performance.mjs';
import {sha256} from './performance-source-binding.mjs';
import {COLLECTOR, STRICT_VERIFIER, canonicalHash,
  assertCompatibleSource, assertStrictResult, assessBoundGroups,
  assertBoundReview, stateChanges, pinnedBytes} from './verify-current-feedback-bounds.mjs';
const PENDING=['action-navigate-brief-3','action-navigate-brief-6','action-navigate-brief-10','action-brief-confirm-9'];
const CAPTURE_BINDING='b'.repeat(64);
const WORKFLOW={path:'.github/workflows/github-pages.yml',beforeRaw:'raw-before',beforeCanonical:'canonical-final',afterCanonical:'canonical-final'};
const context={run:'docs/superpowers/evidence/2026-10-04/task-10/performance-matrix-123456789',captureSourceBindingSha256:CAPTURE_BINDING,buildId:'Synthetic-current-build',earlierVisiblePending:PENDING};
const assertStrictPending=s=>assertStrictResult(s,PENDING);

// Finite constructed contract fixtures, not captured performance or semantic reviews.
const clone = v => structuredClone(v);
const rows = () => actionIds.flatMap(action => Array.from({length:10}, (_,i) =>
  ({id:`action-${action}-${i+1}`,action,iteration:i+1,feedbackUpperBoundMs:i+1})));
const strict = () => ({exitCode:2,status:'pending',failures:[],pending:[...PENDING],
  actions:rows().filter(r => !PENDING.includes(r.id)),
  actionGroups:actionIds.filter(a => !['navigate-brief','brief-confirm'].includes(a)).map(action => ({action,n:10,budgetMs:200,p95Ms:10})),
  navigationSampleCount:340,navigationGroups:Array.from({length:68}, () => ({errors:[],outliers:[]})),executedHarnessSha256:COLLECTOR,verifierSha256:STRICT_VERIFIER});
const source = () => ({schemaVersion:1,files:Array.from({length:108}, (_,i) => ({path:i===0?WORKFLOW.path:i===1?'src/lib/clock.ts':`src/synthetic-${i}.ts`,kind:i===0?'build/deployment':'runtime',normalization:'UTF-8; CRLF to LF only',rawSha256:i===0?WORKFLOW.beforeRaw:'a',canonicalSha256:i===0?WORKFLOW.beforeCanonical:'a'}))});
const sourcePair = () => {const before=source(),after=clone(before);after.files[0].canonicalSha256=WORKFLOW.afterCanonical;after.files[0].rawSha256='checkout LF raw differs';return {before,after};};
const visibleFrame = {frameSequence:166,frameSource:4294967296,screenshotTsUs:112270011473,jpegSha256:'9f24a2d7770bf881bb50bb1862843832aa526ba85e265e36ea071810ba3518e8'};
const disposition = () => ({...visibleFrame,meaningfulFeedbackVisible:true,reason:'Actually inspected complete earlier feedback; exact first timing remains inconclusive.'});
const facts = () => ({sample:PENDING[0],archiveManifestSha256:'archives',productSourceManifestSha256:'product',expectedText:'正在開啟就診摘要…',roi:{x:20,y:539,width:144,height:23},stateBeforeSha256:'before-state',stateAfterSha256:'after-state',beforeJpegSha256:'before-jpeg',afterJpegSha256:'after-jpeg',frameSequence:167,frameSource:4294967296,screenshotTsUs:112270021430,jpegSha256:visibleFrame.jpegSha256,earlierFrames:[clone(visibleFrame)]});
const review = () => ({...facts(),kind:'assistant-conservative-feedback-bound-review',decision:'accept-upper-bound',metric:'conservative-feedback-presentation-upper-bound',run:'performance-matrix-123456789',executedHarnessSha256:COLLECTOR,sourceBindingSha256:CAPTURE_BINDING,buildId:'Synthetic-current-build',reviewer:'Synthetic contract reviewer fixture',reviewedAt:'2026-10-05T00:00:00Z',fullFrameInspected:true,roiInspected:true,beforeVisiblyDiffers:true,persistedStateVerified:true,noOcclusionOrGeometryAmbiguity:true,earliestTiming:'inconclusive',laterFeedbackProofJustification:'A later original complete native presentation provides a bound, not exact first timing.',earlierFrames:[disposition()]});

test('truthful earlier-visible disposition is valid for the separate later bound', () => assert.doesNotThrow(() => assertBoundReview(review(),facts(),context)));
test('ordinary strict-reviewed sample retains earlier nonfeedback', () => {
  const f={...facts(),sample:'action-checkin-save-1',earlierFrames:[{...visibleFrame,jpegSha256:'other'}]};
  const r={...review(),...f,earliestTiming:'strict-reviewed',earlierFrames:[{...f.earlierFrames[0],meaningfulFeedbackVisible:false,reason:'Inspected original frame still shows the prior state.'}]};
  assert.doesNotThrow(() => assertBoundReview(r,f,context));
});
for (const [name, mutate] of [
  ['forged earlier absence',r=>r.earlierFrames[0].meaningfulFeedbackVisible=false],
  ['unknown earlier disposition',r=>r.earlierFrames[0].meaningfulFeedbackVisible=null],
  ['missing earlier frame',r=>r.earlierFrames=[]],
  ['duplicate earlier frame',r=>r.earlierFrames.push(clone(r.earlierFrames[0]))],
  ['changed earlier JPEG',r=>r.earlierFrames[0].jpegSha256='tampered'],
  ['false exact-first acceptance',r=>r.earliestTiming='strict-reviewed'],
  ['wrong bound metric',r=>r.metric='first-feedback'],
  ['wrong decision',r=>r.decision='accept'],
  ['changed selected timestamp',r=>r.screenshotTsUs++],
  ['changed selected frame source',r=>r.frameSource++],
  ['changed selected JPEG',r=>r.jpegSha256='tampered'],
  ['changed persisted state',r=>r.stateAfterSha256='tampered'],
  ['wrong source',r=>r.sourceBindingSha256='tampered'],
  ['wrong build',r=>r.buildId='other'],
  ['missing actual full-frame inspection',r=>r.fullFrameInspected=false],
  ['truthy nonboolean inspection',r=>r.roiInspected='yes'],
  ['missing occlusion inspection',r=>r.noOcclusionOrGeometryAmbiguity=false],
  ['missing justification',r=>r.laterFeedbackProofJustification=''],
]) test(`bound review rejects ${name}`, () => {const r=review();mutate(r);assert.throws(() => assertBoundReview(r,facts(),context));});
test('declared earlier-visible limitation cannot disappear from the bound review', () => {const r=review(),f=facts();r.earlierFrames=[];f.earlierFrames=[];assert.throws(()=>assertBoundReview(r,f,context));});
test('earlier-visible semantics require an exact pending complement', () => {const f={...facts(),sample:'action-checkin-save-1'};assert.throws(()=>assertBoundReview({...review(),...f},f,context));});

test('original strict result must remain pending, never relabeled accepted', () => assert.doesNotThrow(() => assertStrictPending(strict())));
for (const [name,mutate] of [
  ['accepted exit with remaining pending',s=>{s.exitCode=0;s.status='verified';}],
  ['extra pending sample',s=>s.pending.push('action-time-change-1')],
  ['lost pending sample',s=>s.pending.pop()],
  ['extra strict failure',s=>s.failures.push('invalid trace')],
  ['reviewed four inserted',s=>s.actions.push(rows().find(r=>r.id===PENDING[0]))],
  ['duplicate strict action',s=>s.actions[1]=s.actions[0]],
  ['foreign strict action',s=>s.actions[0].id='action-unknown-1'],
  ['missing complete action group',s=>s.actionGroups.pop()],
  ['missing navigation sample',s=>s.navigationSampleCount=339],
  ['missing navigation group',s=>s.navigationGroups.pop()],
  ['navigation budget failure',s=>s.navigationGroups[0].errors.push('score below 90')],
  ['unresolved navigation outlier',s=>s.navigationGroups[0].outliers.push('sample')],
  ['changed original verifier',s=>s.verifierSha256='changed'],
]) test(`strict prerequisite rejects ${name}`, () => {const s=strict();mutate(s);assert.throws(() => assertStrictPending(s));});

test('all 10 per 14 action groups use nearest rank p95 bounds', () => {
  const groups=assessBoundGroups(rows());assert.equal(groups.length,14);assert.ok(groups.every(g=>g.n===10&&g.p95UpperBoundMs===10&&g.budgetMs===200));
});
test('200ms boundary passes and one 200.001ms retained maximum fails', () => {
  const r=rows();r[0].feedbackUpperBoundMs=200;assert.doesNotThrow(()=>assessBoundGroups(r));r[0].feedbackUpperBoundMs=200.001;assert.throws(()=>assessBoundGroups(r),/200ms/);
});
for(const [name,mutate] of [
  ['missing sample',r=>r.pop()],['duplicate sample',r=>r[1]=r[0]],['nonfinite bound',r=>r[0].feedbackUpperBoundMs=Infinity],
  ['negative bound',r=>r[0].feedbackUpperBoundMs=-1],['wrong action',r=>r[0].action='unknown'],['wrong iteration',r=>r[0].iteration=2],
]) test(`complete bound coverage rejects ${name}`,()=>{const r=rows();mutate(r);assert.throws(()=>assessBoundGroups(r));});

test('entire current inventory equals capture including final workflow; raw checkout CRLF is portable',()=>{const{before,after}=sourcePair();assert.equal(assertCompatibleSource(before,after).matchedFiles,108);});
for(const[name,mutate]of[
  ['different workflow',p=>p.after.files[0].canonicalSha256='other'],['before workflow canonical mismatch',p=>p.before.files[0].canonicalSha256='other'],
  ['product change',p=>p.after.files[2].canonicalSha256='other'],['method classification change',p=>p.after.files[1].kind='method'],
  ['inventory addition',p=>p.after.files.push(clone(p.after.files[1]))],['inventory omission',p=>p.after.files.pop()],['renamed input',p=>p.after.files[1].path='src/new.ts'],
])test(`source compatibility rejects ${name}`,()=>{const p=sourcePair();mutate(p);assert.throws(()=>assertCompatibleSource(p.before,p.after));});
test('canonical source pins normalize only CRLF, preserving all other characters',()=>{
  assert.equal(canonicalHash(Buffer.from('a\r\nb\n')),canonicalHash(Buffer.from('a\nb\n')));
  assert.notEqual(canonicalHash(Buffer.from('a\nb\n')),canonicalHash(Buffer.from('a\nb')));
  assert.notEqual(canonicalHash(Buffer.from('a\nb\n')),canonicalHash(Buffer.from('a\n b\n')));
});
test('state proof preserves exact array content/order and additions/removals',()=>{
  assert.deepEqual(stateChanges({records:[{id:'a',value:1}],status:'draft'},{records:[{id:'b',value:2}],status:'confirmed'}),
    [{path:'/records',before:[{id:'a',value:1}],after:[{id:'b',value:2}]},{path:'/status',before:'draft',after:'confirmed'}]);
  assert.deepEqual(stateChanges({a:1},{}),[{path:'/a',before:1,after:{absent:true}}]);
});
test('real file pins detect tampering and reject traversal',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-bound-negative-'));
  try{
    const original=Buffer.from('synthetic supporting evidence');await fs.writeFile(path.join(dir,'support.json'),original,{flag:'wx'});
    const pin={path:'support.json',sha256:sha256(original)};assert.deepEqual(await pinnedBytes(dir,pin),original);
    await fs.writeFile(path.join(dir,'support.json'),'tampered');await assert.rejects(pinnedBytes(dir,pin),/hash mismatch/);
    for(const name of ['../support.json','nested/../../support.json','nested\\support.json','/support.json'])await assert.rejects(pinnedBytes(dir,{...pin,path:name}),/path/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('strict actual0 accepts only complete140/14/340/68 with no pending',()=>{const s=strict();s.exitCode=0;s.status='verified';s.pending=[];s.actions=rows();s.actionGroups=actionIds.map(action=>({action,n:10,budgetMs:200,p95Ms:10}));assert.doesNotThrow(()=>assertStrictResult(s,[]));s.actions.pop();assert.throws(()=>assertStrictResult(s,[]));});
test('a different truthfully declared pending complement works without hardcoded historical sample IDs',()=>{const pending=['action-time-change-2'],s=strict();s.pending=pending;s.actions=rows().filter(r=>!pending.includes(r.id));s.actionGroups=actionIds.filter(a=>a!=='time-change').map(action=>({action,n:10,budgetMs:200,p95Ms:10}));assert.doesNotThrow(()=>assertStrictResult(s,pending));assert.throws(()=>assertStrictResult(s,[...pending,pending[0]]));});
test('no workflow exemption even for a historically reviewed before/after pair',()=>{const {before,after}=sourcePair();after.files[0].canonicalSha256='historical-waiver-after';assert.throws(()=>assertCompatibleSource(before,after));});
test('false earlier absence with a declared inconclusive complement rejects',()=>{const r=review();r.earlierFrames[0].meaningfulFeedbackVisible=false;assert.throws(()=>assertBoundReview(r,facts(),context));});
