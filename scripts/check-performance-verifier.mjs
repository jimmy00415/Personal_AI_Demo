import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readArchives,verifyEvidence} from './verify-performance-evidence.mjs';
import {correlateAction,validateActionOutcome} from './measure-demo-performance.mjs';
import {withConstructedCoordinateProof} from './input-coordinate-test-fixture.mjs';

const run=path.resolve(process.argv[2]),sample='action-checkin-save-1',dir=path.join(run,sample);
const {raw}=await readArchives(dir),p=withConstructedCoordinateProof(JSON.parse(raw.get('dom-provenance.json'))),trace=JSON.parse(raw.get('trace.json'));
const review=JSON.parse(await fs.readFile(path.join(dir,'visual-review.json'),'utf8'));
const results=[];
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`);};
await check('accepted actual smoke verifies',async()=>assert.equal((await verifyEvidence(run,{smoke:true})).exitCode,0));
for(const [name,mutate] of [
  ['wrong JPEG hash',r=>r.jpegSha256='0'.repeat(64)],
  ['wrong state hash',r=>r.stateAfterSha256='0'.repeat(64)],
  ['missing earlier-frame inspection',r=>r.earlierFrames=[]],
  ['missing full-frame inspection',r=>r.fullFrameInspected=false],
  ['earlier meaningful frame without chain cannot be skipped',r=>r.earlierFrames[0].meaningfulFeedbackVisible=true],
  ['background-only frame cannot be accepted as feedback',r=>r.frameSequence=166],
  ['escaping review report',r=>r.supportingReports[0].path='../outside.md'],
  ['wrong frame sequence',r=>r.frameSequence=166],
])await check(name,async()=>{const r=structuredClone(review);mutate(r);assert.equal((await verifyEvidence(run,{smoke:true,reviewOverride:{[sample]:r}})).exitCode,1);});
const replay=provenance=>correlateAction(trace.traceEvents,provenance,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata);
await check('constructed preflight metadata retains current strict historical attribution fixture',async()=>assert.equal(replay(p).candidateFeedbackLatencyMs,50.875));
for(const [name,mutate] of [
  ['missing captured input identity',v=>delete v.inputNode],
  ['untrusted event',v=>v.observation.input.isTrusted=false],
  ['hidden endpoint',v=>v.observation.feedback.visible=false],
  ['unstable endpoint geometry',v=>v.observation.endpointIntegrity.valid=false],
  ['ROI outside ancestor paint',v=>v.observation.feedback.rect.right=10000],
  ['wrong locale feedback',v=>v.observation.feedback.text='Added to your health record'],
  ['false permission denial feedback',v=>v.observation.feedback.text='目前授權不允許匯出這份資料。'],
])await check(name,async()=>{const v=structuredClone(p);mutate(v);assert.equal(replay(v).valid,false);});
await check('wrong compositor active source frame rejects',async()=>{const events=structuredClone(trace.traceEvents);for(const e of events)if(e.name==='LayerTreeHostImpl:snapshot'&&e.args.snapshot?.active_tree)e.args.snapshot.active_tree.source_frame_number=-1;assert.equal(correlateAction(events,p,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata).valid,false);});
await check('stale pre-feedback paint rejects',async()=>{const events=structuredClone(trace.traceEvents);for(const e of events)if(e.name==='Paint')e.ts=0;assert.equal(correlateAction(events,p,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata).valid,false);});
await check('wrong persisted check-in rejects',async()=>{const o=structuredClone(p.observation);o.stateAfter.checkIns[0].mood='low';assert.ok(validateActionOutcome({...p.prepared,action:'checkin-save',expected:{}},o).length);});
await check('preserved wrong actor rejects',async()=>{const prepared={...structuredClone(p.prepared),action:'checkin-save',expected:{}},o=structuredClone(p.observation);prepared.stateBefore.context={actorId:'david',patientId:'may',perspective:'caregiver'};o.stateAfter.context=structuredClone(prepared.stateBefore.context);assert.ok(validateActionOutcome(prepared,o).length);});
await check('preserved wrong patient rejects',async()=>{const prepared={...structuredClone(p.prepared),action:'checkin-save',expected:{}},o=structuredClone(p.observation);prepared.stateBefore.context.patientId='another-patient';o.stateAfter.context.patientId='another-patient';assert.ok(validateActionOutcome(prepared,o).length);});
// Constructed offline fixtures test semantic guards only. They are not captured
// application state, timing samples, or evidence that any live action succeeded.
const eventBefore=structuredClone(p.prepared.stateBefore);eventBefore.context={actorId:'david',patientId:'may',perspective:'caregiver'};eventBefore.events=[{id:'event-fixture-attention',patientId:'may',recipientId:'david',taskId:'task-fixture-attention',status:'pending',revision:1}];eventBefore.tasks=[{id:'task-fixture-attention',patientId:'may',ownerId:'may',status:'pending'}];
const eventAfter=structuredClone(eventBefore);eventAfter.events[0].status='acknowledged';eventAfter.events[0].revision=2;eventAfter.tasks[0].ownerId='david';
const eventPrepared={action:'event-response',expected:{eventId:'event-fixture-attention',taskId:'task-fixture-attention'},expectedText:'David願意接手；尚未完成',stateBefore:eventBefore};
const eventObservation={stateAfter:eventAfter,feedback:{text:eventPrepared.expectedText}};
await check('constructed exact event transition accepted',async()=>assert.deepEqual(validateActionOutcome(eventPrepared,eventObservation),[]));
await check('swapped event-task relationship rejects',async()=>{const o=structuredClone(eventObservation);o.stateAfter.events[0].taskId='different-task';assert.ok(validateActionOutcome(eventPrepared,o).length);});
await check('wrong task patient rejects',async()=>{const o=structuredClone(eventObservation);o.stateAfter.tasks[0].patientId='another-patient';assert.ok(validateActionOutcome(eventPrepared,o).length);});
const briefBefore=structuredClone(p.prepared.stateBefore);briefBefore.clock='2026-09-21T08:45:00+08:00';briefBefore.briefs=[{id:'current-packet',patientId:'may',recipientId:'may',appointmentId:'appt-gp',status:'draft',confirmedAt:null,revision:4,contentFingerprint:'fixed-reviewed-content',sections:[],supplementsNeedReview:false}];
const packet=briefBefore.briefs[0],briefPrepared={action:'brief-confirm',expected:{packetId:packet.id,appointmentId:'appt-gp',packetBefore:structuredClone(packet)},expectedText:'已確認',stateBefore:briefBefore};
const briefAfter=structuredClone(briefBefore);briefAfter.briefs[0].status='confirmed';briefAfter.briefs[0].confirmedAt=briefAfter.clock;const briefObservation={stateAfter:briefAfter,feedback:{text:'已確認'}};
await check('constructed exact packet confirmation accepted',async()=>assert.deepEqual(validateActionOutcome(briefPrepared,briefObservation),[]));
await check('unrelated already-confirmed packet cannot satisfy action',async()=>{const o=structuredClone(briefObservation);o.stateAfter.briefs=[structuredClone(packet),{...structuredClone(briefAfter.briefs[0]),id:'unrelated-confirmed'}];assert.ok(validateActionOutcome(briefPrepared,o).length);});
await check('changed packet content/version rejects',async()=>{const o=structuredClone(briefObservation);o.stateAfter.briefs[0].revision=5;o.stateAfter.briefs[0].contentFingerprint='different-content';assert.ok(validateActionOutcome(briefPrepared,o).length);});
await check('original identity-invalid smoke stays invalid',async()=>{const original=path.join(path.dirname(run),'performance-smoke-1791051347525',sample),{raw:old}=await readArchives(original);const oldRun=path.dirname(original),archived=await import(pathToFileURL(path.join(oldRun,'executed-harness.mjs')).href);const result=archived.correlateAction(JSON.parse(old.get('trace.json')).traceEvents,JSON.parse(old.get('dom-provenance.json')),old.get('before.jpg'),old.get('after.jpg'));assert.equal(result.valid,false);assert.equal(result.feedbackLatencyMs,null);});
// Keep the isolated relocation/tamper fixtures as transparent verifier evidence.
// No historical evidence is edited and no browser is launched.
const fixtures=await fs.mkdtemp(path.join(path.dirname(run),'verifier-fixtures-'));
const relocated=path.join(fixtures,path.basename(run));await fs.cp(run,relocated,{recursive:true});
await check('self-contained evidence verifies after relocation',async()=>assert.equal((await verifyEvidence(relocated,{smoke:true})).exitCode,0));
const summaryFile=path.join(relocated,sample,'summary.json'),summaryBytes=await fs.readFile(summaryFile),summary=JSON.parse(summaryBytes);
for(const [field,value] of [['action','unknown-action'],['iteration',2],['id','action-checkin-save-2']])await check(`misclassified summary ${field} rejects`,async()=>{
  await fs.writeFile(summaryFile,JSON.stringify({...summary,[field]:value}));const result=await verifyEvidence(relocated,{smoke:true});assert.equal(result.exitCode,1);await fs.writeFile(summaryFile,summaryBytes);
});
await check('smoke cannot satisfy full gate',async()=>assert.equal((await verifyEvidence(relocated)).exitCode,1));
await check('changed compressed bytes reject',async()=>{const file=path.join(relocated,sample,'before.jpg.gz'),b=await fs.readFile(file);b[Math.floor(b.length/2)]^=1;await fs.writeFile(file,b);const result=await verifyEvidence(relocated,{smoke:true});assert.equal(result.exitCode,1);assert.match(result.failures.join(' '),/integrity|incorrect|invalid/i);});
console.log(JSON.stringify({passed:results.length,results,fixtures,scope:'Offline evidence/verifier negative checks; no product or new timing samples'},null,2));
