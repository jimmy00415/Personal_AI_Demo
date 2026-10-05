import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {correlateAction,mainUpdateDrawProof,parseActionTrace} from './measure-demo-performance.mjs';
import {readArchives,parseCapturedActionTrace} from './verify-performance-evidence.mjs';
import {withConstructedCoordinateProof} from './input-coordinate-test-fixture.mjs';
const run=path.resolve('docs/superpowers/evidence/2026-10-04/task-10/performance-matrix-1791080828186'),dir=path.join(run,'action-appointment-confirm-1');
const {raw}=await readArchives(dir),trace=parseActionTrace(raw.get('trace.json')),events=trace.traceEvents,originalProvenance=JSON.parse(raw.get('dom-provenance.json')),provenance=withConstructedCoordinateProof(originalProvenance);
let passed=0;const test=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
const result=correlateAction(events,provenance,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata),c=result.candidates.find(v=>v.frameSequence===160)?.correlation;
test('genuine earlier160 complete causal chain passes diagnostically',()=>{assert.ok(c?.mainUpdateMapping);assert.equal(result.first.frameSequence,160);assert.equal(result.feedbackLatencyMs,null);assert.equal(c.mainUpdateMapping.mainFrameId,'6072488858809015697');});
const m=c.mainUpdateMapping,screen=events.find(e=>e.name==='Screenshot'&&e.args.frame_sequence===160);
const retained=[c.pipelineBegin,c.pipelineEnd,...Object.values(m.main),...m.mainFlows.flatMap(f=>[f.start,f.end]),...Object.values(m.graphics),...m.graphicsFlows.flatMap(f=>[f.start,f.end]),...Object.values(m.reporterStages).flatMap(s=>[s.start,s.end])];
const fixture={events:[...new Set(retained)],pair:{begin:c.pipelineBegin,end:c.pipelineEnd,reporter:c.pipelineBegin.args.frame_reporter},screen,input:result.input,draw:c.draw,activation:c.activation,beginFrame:c.beginFrame,commit:c.commit,metadata:trace.metadata};
const proof=f=>mainUpdateDrawProof(f.events,f.pair,f.screen,f.input,f.draw,f.activation,f.beginFrame,f.commit,f.metadata,provenance.traceTimestampContract);
const at=(f,e)=>f.events.find(v=>v.name===e.name&&v.ph===e.ph&&v.pid===e.pid&&v.tid===e.tid&&v.ts===e.ts);
const reject=(name,mutate)=>test(`${name} rejects`,()=>{const f=structuredClone(fixture);mutate(f);assert.equal(proof(f),null);});
const commit=m.reporterStages.commit,activation=m.reporterStages.activation,gap=m.reporterStages.endCommit,endActivate=m.reporterStages.endActivate;
const commitStart=(f,ts)=>{at(f,commit.start).ts=ts;};
const commitEnd=(f,ts)=>{at(f,commit.end).ts=ts;at(f,gap.start).ts=ts;};
const activationStart=(f,ts)=>{at(f,activation.start).ts=ts;at(f,gap.end).ts=ts;};
const activationEnd=(f,ts)=>{at(f,activation.end).ts=ts;at(f,endActivate.start).ts=ts;};
test('exact zero-prefix and zero-suffix source envelopes pass',()=>{const f=structuredClone(fixture);commitStart(f,m.main.commitImpl.ts);commitEnd(f,m.main.commitImpl.ts+m.main.commitImpl.dur);activationStart(f,m.main.activate.ts);activationEnd(f,m.main.activate.ts+m.main.activate.dur);assert.ok(proof(f));});
test('larger legitimate bookkeeping envelopes pass inside same-update anchors',()=>{const f=structuredClone(fixture);commitStart(f,m.main.commitImpl.ts-10);commitEnd(f,m.main.commitImpl.ts+m.main.commitImpl.dur+2);activationStart(f,m.main.activate.ts-2);activationEnd(f,m.main.activate.ts+m.main.activate.dur+10);assert.ok(proof(f));});
for(const [name,mutate] of [
 ['Commit start before same main Commit',f=>commitStart(f,f.commit.ts-1)],
 ['Commit start before COMMIT_ON_MAIN',f=>commitStart(f,m.main.commitMain.ts-1)],
 ['Commit start exceeds source-defined serialized precision',f=>commitStart(f,m.main.commitImpl.ts+2)],
 ['Commit end before inner scope end',f=>commitEnd(f,m.main.commitImpl.ts+m.main.commitImpl.dur-1)],
 ['Commit end beyond same main Commit',f=>commitEnd(f,f.commit.ts+f.commit.dur+1)],
 ['Commit end beyond COMMIT_COMPLETE',f=>commitEnd(f,m.main.complete.ts+1)],
 ['Activation start before READY_TO_ACTIVATE',f=>activationStart(f,m.main.ready.ts-1)],
 ['Activation start exceeds source-defined serialized precision',f=>activationStart(f,m.main.activate.ts+2)],
 ['Activation end before inner scope end',f=>activationEnd(f,m.main.activate.ts+m.main.activate.dur-1)],
 ['Activation end beyond first same-main Draw',f=>activationEnd(f,m.main.draw.ts+1)],
 ['Activation end beyond submission',f=>activationEnd(f,m.reporterStages.submission.start.ts+1)],
 ['broken EndCommit start adjacency',f=>at(f,gap.start).ts+=1],
 ['broken EndCommit end adjacency',f=>at(f,gap.end).ts-=1],
 ['broken EndActivate adjacency',f=>at(f,endActivate.start).ts+=1],
 ['inverted Commit interval',f=>commitStart(f,commit.end.ts+1)],
 ['inverted Activation interval',f=>activationStart(f,activation.end.ts+1)],
 ['nonfinite stage start',f=>commitStart(f,NaN)],
 ['infinite stage end',f=>activationEnd(f,Infinity)],
 ['unsafe stage time',f=>commitStart(f,Number.MAX_SAFE_INTEGER+1)],
 ['fractional stage time',f=>commitStart(f,commit.start.ts+.5)],
 ['negative main Commit duration',f=>f.commit.dur=-1],
 ['nonfinite main Commit duration',f=>f.commit.dur=Infinity],
 ['negative inner Commit duration',f=>at(f,m.main.commitImpl).dur=-1],
 ['nonfinite inner Commit duration',f=>at(f,m.main.commitImpl).dur=NaN],
 ['negative inner Activation duration',f=>at(f,m.main.activate).dur=-1],
 ['fractional inner Activation duration',f=>at(f,m.main.activate).dur=.5],
 ['missing EndCommit stage',f=>{f.events=f.events.filter(e=>e!==at(f,gap.end));}],
 ['duplicate EndCommit stage',f=>f.events.push(structuredClone(at(f,gap.start)))],
 ['wrong EndCommit reporter identity',f=>at(f,gap.end).id2.local='unrelated'],
 ['wrong EndCommit track',f=>at(f,gap.end).tid=-1],
 ['wrong commit main ID',f=>at(f,m.main.commitImpl).args.main_frame_pipeline.main_frame_id='6072488858809015698'],
 ['wrong own Begin sequence',f=>at(f,m.main.begin).args.begin_frame_id=121],
 ['wrong original MAIN state',f=>f.pair.reporter.state='STATE_PRESENTED_PARTIAL'],
 ['wrong first Draw source',f=>at(f,m.main.draw).args.main_frame_pipeline.last_begin_frame_id_during_first_draw.source_id=1],
 ['wrong aggregation display',f=>at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.display_trace_id='1600477468277179446'],
 ['duplicate original MAIN',f=>f.events.push(structuredClone(f.pair.begin))],
])reject(name,mutate);
const archived=await import(pathToFileURL(path.join(run,'captured-methods/measure-demo-performance.mjs')).href),oldTrace=parseCapturedActionTrace(archived,raw.get('trace.json'));
const oldResult=archived.correlateAction(oldTrace.traceEvents,originalProvenance,raw.get('before.jpg'),raw.get('after.jpg'),oldTrace.metadata);
test('archived method replays exact old raw and earlier160 remains NULL',()=>{assert.deepEqual(oldResult,JSON.parse(raw.get('correlation.json')));assert.equal(oldResult.candidates.find(v=>v.frameSequence===160).correlation,null);assert.equal(oldResult.feedbackLatencyMs,null);});
await fs.writeFile(path.resolve('docs/superpowers/evidence/2026-10-04/task-10/main-update-r42-constructed-stage-diagnostic-null.json'),JSON.stringify({scope:'Constructed R42 preflight/config metadata tests stage guards only; exact archived replay uses original raw; no new measurement or acceptance',firstFrame:result.first.frameSequence,candidateFeedbackLatencyMs:result.candidateFeedbackLatencyMs,feedbackLatencyMs:result.feedbackLatencyMs,chain:c,oldFirstFrame:oldResult.first.frameSequence,oldCandidateFeedbackLatencyMs:oldResult.candidateFeedbackLatencyMs,oldEarlier160Correlation:null,oldFeedbackLatencyMs:oldResult.feedbackLatencyMs},null,2));
console.log(JSON.stringify({passed,scope:'Finite source-defined same-update stage-envelope proof; no runtime, acceptance or source/product timing'},null,2));
