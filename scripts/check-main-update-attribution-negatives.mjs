import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {correlateAction,mainUpdateDrawProof,parseActionTrace,actionTraceParserSchema,actionIds,routes} from './measure-demo-performance.mjs';
import {readArchives,parseCapturedActionTrace} from './verify-performance-evidence.mjs';
import {withConstructedCoordinateProof} from './input-coordinate-test-fixture.mjs';

// Diagnostic copies of retained evidence, never new timing or acceptance.
// Each negative breaks a causal edge which must not be inferred from proximity.
const run=path.resolve('docs/superpowers/evidence/2026-10-04/task-10/performance-matrix-1791058301425');
const {raw}=await readArchives(path.join(run,'action-time-change-8'));
const trace=parseActionTrace(raw.get('trace.json')),originalProvenance=JSON.parse(raw.get('dom-provenance.json')),provenance=withConstructedCoordinateProof(originalProvenance);
const replay=(events=trace.traceEvents,p=provenance)=>correlateAction(events,p,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata);
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`);};
const result=replay(),c=result.candidates.find(v=>v.frameSequence===169)?.correlation;
await test('diagnostic first meaningful169 has exact original MAIN165 ALL proof',()=>{
  assert.ok(c?.mainUpdateMapping);assert.equal(result.first.frameSequence,169);
  assert.equal(c.mainUpdateMapping.mainFrameId,'8353177651139177408');
  assert.equal(c.mainUpdateMapping.surfaceFrameId,'4076688458824723838');
  assert.equal(c.mainUpdateMapping.displayId,'4076688458824723834');
  assert.equal(c.mainUpdateMapping.originalSequence,165);assert.equal(result.candidateFeedbackLatencyMs,62.112);assert.equal(result.feedbackLatencyMs,null);
});
const m=c.mainUpdateMapping,screen=trace.traceEvents.find(e=>e.name==='Screenshot'&&e.args.frame_sequence===169);
const retained=[c.pipelineBegin,c.pipelineEnd,...Object.values(m.main),...m.mainFlows.flatMap(f=>[f.start,f.end]),...Object.values(m.graphics),...m.graphicsFlows.flatMap(f=>[f.start,f.end]),...Object.values(m.reporterStages).flatMap(s=>[s.start,s.end])];
const fixture={events:[...new Set(retained)],pair:{begin:c.pipelineBegin,end:c.pipelineEnd,reporter:c.pipelineBegin.args.frame_reporter},screen,input:result.input,draw:c.draw,activation:c.activation,beginFrame:c.beginFrame,commit:c.commit,metadata:trace.metadata};
const proof=f=>mainUpdateDrawProof(f.events,f.pair,f.screen,f.input,f.draw,f.activation,f.beginFrame,f.commit,f.metadata,provenance.traceTimestampContract);
const at=(f,e)=>f.events.find(v=>v.name===e.name&&v.ph===e.ph&&v.pid===e.pid&&v.tid===e.tid&&v.ts===e.ts);
const remove=(f,e)=>{f.events=f.events.filter(v=>v!==at(f,e));};
const reject=async(name,mutate)=>test(`${name} rejects exact mapping`,()=>{const f=structuredClone(fixture);mutate(f);assert.equal(proof(f),null);});
await test('bounded retained causal fixture proves original MAIN165',()=>assert.ok(proof(fixture)));
for(const [name,e] of [['begin',c.pipelineBegin],['end',c.pipelineEnd]]){
  await reject(`missing original MAIN reporter ${name}`,f=>remove(f,e));
  await reject(`duplicate original MAIN reporter ${name}`,f=>f.events.push(structuredClone(at(f,e))));
}
for(const [name,e] of Object.entries(m.main)){
  await reject(`missing main ${name}`,f=>remove(f,e));
  await reject(`duplicate main ${name}`,f=>f.events.push(structuredClone(at(f,e))));
  await reject(`wrong main ID at ${name}`,f=>at(f,e).args.main_frame_pipeline.main_frame_id='8353177651139177409');
}
for(const [i,flow] of [...m.mainFlows,...m.graphicsFlows].entries()){
  await reject(`missing causal flow ${i} endpoint`,f=>remove(f,flow.end));
  await reject(`duplicate causal flow ${i} endpoint`,f=>f.events.push(structuredClone(at(f,flow.end))));
  await reject(`wrong causal flow ${i} endpoint process`,f=>at(f,flow.end).pid=-1);
}
for(const [name,e] of Object.entries(m.graphics)){
  await reject(`missing graphics ${name}`,f=>remove(f,e));
  await reject(`duplicate graphics ${name}`,f=>f.events.push(structuredClone(at(f,e))));
}
for(const [name,s] of Object.entries(m.reporterStages)){
  await reject(`missing reporter ${name} stage`,f=>remove(f,s.end));
  await reject(`duplicate reporter ${name} stage`,f=>f.events.push(structuredClone(at(f,s.end))));
}
for(const [name,mutate] of [
  ['rounded unsafe main number',f=>{for(const e of f.events)if(e.args.main_frame_pipeline)e.args.main_frame_pipeline.main_frame_id=Number(e.args.main_frame_pipeline.main_frame_id);}],
  ['rounded unsafe surface number',f=>{for(const e of f.events)if(e.args.chrome_graphics_pipeline?.surface_frame_trace_id)e.args.chrome_graphics_pipeline.surface_frame_trace_id=Number(e.args.chrome_graphics_pipeline.surface_frame_trace_id);}],
  ['missing main identity',f=>delete at(f,m.main.draw).args.main_frame_pipeline.main_frame_id],
  ['zero main identity',f=>at(f,m.main.draw).args.main_frame_pipeline.main_frame_id='0'],
  ['wrong original main source',f=>at(f,m.main.send).args.main_frame_pipeline.begin_frame_id.source_id=1],
  ['wrong original main sequence',f=>at(f,m.main.send).args.main_frame_pipeline.begin_frame_id.sequence_number=164],
  ['contradictory BeginMainFrame original sequence',f=>at(f,m.main.begin).args.begin_frame_id=166],
  ['wrong first Draw source',f=>at(f,m.main.draw).args.main_frame_pipeline.last_begin_frame_id_during_first_draw.source_id=1],
  ['wrong first Draw sequence',f=>at(f,m.main.draw).args.main_frame_pipeline.last_begin_frame_id_during_first_draw.sequence_number=170],
  ['missing first Draw identity',f=>delete at(f,m.main.draw).args.main_frame_pipeline.last_begin_frame_id_during_first_draw],
  ['wrong renderer',f=>f.pair.begin.pid=-1],
  ['wrong reporter tree',f=>f.pair.reporter.layer_tree_host_id=-1],
  ['wrong commit sequence',f=>f.commit.args.frameSeqId=166],
  ['commit outside main update',f=>f.commit.ts=at(f,m.main.begin).ts-1],
  ['activation outside exact update',f=>f.activation.ts=at(f,m.main.activate).ts-1],
  ['Draw outside exact main draw',f=>f.draw.ts=at(f,m.main.draw).ts-1],
  ['noncausal ready before complete',f=>at(f,m.main.ready).ts=at(f,m.main.complete).ts-1],
  ['submit on wrong renderer',f=>at(f,m.graphics.submit).pid=-1],
  ['Viz receive on renderer',f=>at(f,m.graphics.receive).pid=f.input.pid],
  ['missing Viz sink',f=>delete at(f,m.graphics.receive).args.chrome_graphics_pipeline.frame_sink_id],
  ['invalid Viz sink',f=>at(f,m.graphics.receive).args.chrome_graphics_pipeline.frame_sink_id.frame_sink_id=0],
  ['wrong submit surface',f=>at(f,m.graphics.submit).args.chrome_graphics_pipeline.surface_frame_trace_id='4076688458824723824'],
  ['rounded aggregation array',f=>at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids=at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids.map(Number)],
  ['missing aggregation array',f=>delete at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids],
  ['unrelated browser169 surface',f=>at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids=['4076688458824723824']],
  ['duplicate target in aggregation',f=>at(f,m.graphics.aggregate).args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids.push('4076688458824723838')],
  ['wrong browser169 display',f=>f.pair.reporter.display_trace_id='4076688458824723777'],
  ['rounded unsafe display number',f=>f.pair.reporter.display_trace_id=Number(f.pair.reporter.display_trace_id)],
  ['missing display identity',f=>delete f.pair.reporter.display_trace_id],
  ['PARTIAL original reporter',f=>f.pair.reporter.state='STATE_PRESENTED_PARTIAL'],
  ['missing content original reporter',f=>f.pair.reporter.has_missing_content=true],
  ['FORKED reporter',f=>f.pair.reporter.frame_type='FORKED'],
  ['BACKFILL reporter',f=>f.pair.reporter.frame_type='BACKFILL'],
  ['unknown reporter type',f=>f.pair.reporter.frame_type='UNKNOWN'],
  ['wrong original reporter surface',f=>f.pair.reporter.surface_frame_trace_id='4076688458824723824'],
  ['unknown Chromium revision',f=>f.metadata.revision='unknown'],
  ['stage commit end breaks exact EndCommit adjacency',f=>at(f,m.reporterStages.commit.end).ts+=1],
  ['stage activation end breaks exact EndActivate adjacency',f=>at(f,m.reporterStages.activation.end).ts+=1],
  ['stage presentation completion mismatch',f=>at(f,m.reporterStages.submission.end).ts-=1],
])await reject(name,mutate);
await test('explicit MAIN preserves exact proof',()=>{const f=structuredClone(fixture);f.pair.reporter.frame_type='MAIN';assert.ok(proof(f));});
for(const [name,mutate] of [
  ['wrong active source',events=>{for(const e of events)if(e.name==='LayerTreeHostImpl:snapshot'&&e.ts===23745647620&&e.args.snapshot)e.args.snapshot.active_tree.source_frame_number=-1;}],
  ['wrong committed tree',events=>{events.find(e=>e.name==='Commit'&&e.ph==='X'&&e.ts===23745646196).args.layerTreeId=-1;}],
  ['stale document Paint',events=>{events.find(e=>e.name==='Paint'&&e.ts===23745642981).ts=23745635544;}],
  ['PARTIAL-only renderer evidence',events=>{for(const e of events)if(e.pid===4536&&e.args.frame_reporter)e.args.frame_reporter.state='STATE_PRESENTED_PARTIAL';}],
  ['browser169 ALL cannot substitute',events=>{for(const e of events)if(e.pid===4536&&e.name==='PipelineReporter'&&e.args.frame_reporter?.frame_sequence===165)e.args.frame_reporter.state='STATE_PRESENTED_PARTIAL';}],
  ['duplicate original MAIN reporter',events=>{events.push(structuredClone(c.pipelineBegin),structuredClone(c.pipelineEnd));}],
  ['wrong original reporter source',events=>{for(const e of events)if(e.name==='PipelineReporter'&&e.pid===4536&&e.args.frame_reporter?.frame_sequence===165)e.args.frame_reporter.frame_source=1;}],
])await test(`${name} rejects first meaningful169 integration`,()=>{const events=structuredClone(trace.traceEvents);mutate(events);assert.equal(replay(events).candidates.find(v=>v.frameSequence===169)?.correlation,null);});
await test('completion outside positive endpoint epoch rejects integration',()=>{const p=structuredClone(provenance);p.observation.endpointLifecycle.checks=p.observation.endpointLifecycle.checks.filter(v=>v.at<579);assert.equal(replay(trace.traceEvents,p).candidates.find(v=>v.frameSequence===169)?.correlation,null);});
const unsafe=Buffer.from('{"main_frame_id":8353177651139177408,"surfaces":[4076688458824723838,4076688458824723824],"safe":169}');
await test('new parser preserves distinct unsafe scalar and array lexemes',()=>assert.deepEqual(parseActionTrace(unsafe),{main_frame_id:'8353177651139177408',surfaces:['4076688458824723838','4076688458824723824'],safe:169}));
await test('new archived parser dispatch preserves exact array IDs',()=>assert.deepEqual(parseCapturedActionTrace({actionTraceParserSchema,parseActionTrace},unsafe).surfaces,['4076688458824723838','4076688458824723824']));
await test('old archived parser dispatch keeps historical Number behavior',()=>assert.deepEqual(parseCapturedActionTrace({},unsafe),JSON.parse(unsafe)));
await test('unknown and incomplete archived parser schemas reject',()=>{assert.throws(()=>parseCapturedActionTrace({actionTraceParserSchema:'unknown',parseActionTrace},unsafe));assert.throws(()=>parseCapturedActionTrace({actionTraceParserSchema},unsafe));});
await test('original archived invalid correlation replays exactly and remains null',async()=>{
  const archived=await import(pathToFileURL(path.join(run,'captured-methods/measure-demo-performance.mjs')).href),oldTrace=parseCapturedActionTrace(archived,raw.get('trace.json'));
  const oldResult=archived.correlateAction(oldTrace.traceEvents,originalProvenance,raw.get('before.jpg'),raw.get('after.jpg'),oldTrace.metadata);
  assert.deepEqual(oldResult,JSON.parse(raw.get('correlation.json')));assert.equal(oldResult.feedbackLatencyMs,null);assert.equal(oldResult.candidateFeedbackLatencyMs,null);
});
// Execute current selector/scope expressions offline, without main() or IO.
const source=await fs.readFile(new URL('./measure-demo-performance.mjs',import.meta.url),'utf8');
const selectors=source.slice(source.indexOf('  const navigationSmoke='),source.indexOf('  const output = path.resolve(process.env.CAREMATE_PERF_OUTPUT'));
const scopeLine=source.slice(source.indexOf('  const scope=actionGroup?'),source.indexOf("  await fs.writeFile(path.join(output, 'provenance.json')"));
const selectedLine=source.slice(source.indexOf('    const selected = actionGroup||actionsSmoke?'),source.indexOf('    for (const route of selected)'));
const select=argv=>vm.runInNewContext(`${selectors}\n${scopeLine}\n${selectedLine}\n({scope,selected,actions:actionGroup?[actionGroup]:actionsSmoke?[smokeAction]:actionIds})`,{process:{argv,env:{}},actionIds,routes});
await test('time-change smoke selects one action and zero navigation loads',()=>assert.deepEqual(JSON.parse(JSON.stringify(select(['node','script','--time-change-smoke']))),{scope:{kind:'bounded-smoke',action:'time-change',requestedActionSamples:1,requestedNavigationSamples:0,fullAcceptance:false},selected:[],actions:['time-change']}));
await test('full selector retains14 actions and17 routes,140 actions and340 loads',()=>{const r=select(['node','script']);assert.equal(r.actions.length,14);assert.equal(r.selected.length,17);assert.equal(r.scope.requestedActionSamples,140);assert.equal(r.scope.requestedNavigationSamples,340);});
await test('conflicting selectors reject before IO',()=>{assert.throws(()=>select(['node','script','--time-change-smoke','--navigation-smoke']));assert.throws(()=>select(['node','script','--time-change-smoke','--action-group','time-change']));});
console.log(JSON.stringify({passed,scope:'Offline R36 causal negatives and parser/archive/selector proofs; old INVALID/null preserved; no new timing, semantic acceptance, runtime or full matrix'},null,2));
