import assert from 'node:assert/strict';
import path from 'node:path';
import { assessEndpointEpoch, endpointFrameWithinEpoch, correlateAction, pendingIdentityMatches, rootLayerCoordinates } from './measure-demo-performance.mjs';
import { readArchives } from './verify-performance-evidence.mjs';
import {withConstructedCoordinateProof} from './input-coordinate-test-fixture.mjs';
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`);};
const rect={x:20,y:100,width:120,height:24,right:140,bottom:124};
const good=at=>({at,same:true,textUnchanged:true,rangeStable:true,ancestorGeometryStable:true,viewportStable:true,scrollStable:true,current:{visible:true,hit:true,supported:true,rect,textRects:[rect]}});
const observation=(changes=[])=>({navigationPath:'/report',feedback:{at:10,markStart:10,rect,textRects:[rect],preInputIdentityMatched:true},endpointLifecycle:{version:1,checks:[good(10),good(30),good(50),...changes]}});
test('persistent glyph epoch includes later positive proof',()=>assert.deepEqual(assessEndpointEpoch(observation()),{valid:true,startMs:10,verifiedThroughMs:50,closedAtMs:null,closeReason:null}));
test('expected route unmount retains earlier proven epoch',()=>assert.equal(assessEndpointEpoch(observation([{at:70,reason:'expected-route-unmount',path:'/report',connected:false,matched:false}])).verifiedThroughMs,50));
test('later layout change closes epoch at last positive check',()=>assert.equal(assessEndpointEpoch(observation([{...good(70),rangeStable:false}])).verifiedThroughMs,50));
for(const [name,change] of Object.entries({replacement:{same:false},text:{textUnchanged:false},ancestor:{ancestorGeometryStable:false},viewport:{viewportStable:false},scroll:{scrollStable:false},hidden:{current:{visible:false,hit:true,supported:true}},occluded:{current:{visible:true,hit:false,supported:true}},transformed:{current:{visible:true,hit:true,supported:false}}})) {
  test(`${name} before presentation rejects`,()=>{const o=observation();o.endpointLifecycle.checks=[good(10),{...good(20),...change},good(60)];assert.equal(endpointFrameWithinEpoch(o,10000,15000,35000,36000),false);});
  test(`${name} after proven epoch cannot erase earlier frame or extend it`,()=>{const o=observation([{...good(70),...change}]);assert.equal(endpointFrameWithinEpoch(o,10000,15000,35000,36000),true);assert.equal(endpointFrameWithinEpoch(o,10000,15000,75000,76000),false);});
}
test('missing lifecycle rejects',()=>assert.equal(assessEndpointEpoch({}).valid,false));
test('missing exact text ranges rejects',()=>assert.equal(assessEndpointEpoch({...observation(),feedback:{at:10,markStart:10,rect}}).valid,false));
test('empty glyph rectangle rejects',()=>{const o=observation();o.feedback.textRects[0]={...rect,width:0};assert.equal(assessEndpointEpoch(o).valid,false);});
test('out of order samples reject',()=>assert.equal(assessEndpointEpoch(observation([good(40)])).valid,false));
test('no positive post-start observation rejects',()=>{const o=observation();o.endpointLifecycle.checks=[good(10)];assert.equal(assessEndpointEpoch(o).valid,false);});
test('no reopening after changed geometry',()=>assert.equal(assessEndpointEpoch(observation([{...good(70),rangeStable:false},good(90)])).verifiedThroughMs,50));
test('removal callback does not extend last positive observation',()=>assert.equal(endpointFrameWithinEpoch(observation([{at:70,reason:'expected-route-unmount',path:'/report',connected:false,matched:false}]),10000,15000,55000,56000),false));
test('exact screenshot also must precede positive bound',()=>assert.equal(endpointFrameWithinEpoch(observation(),10000,15000,45000,55000),false));
test('paint before epoch rejects',()=>assert.equal(endpointFrameWithinEpoch(observation(),10000,9000,35000,36000),false));
test('wrong route unmount rejects',()=>assert.equal(assessEndpointEpoch(observation([{at:70,reason:'expected-route-unmount',path:'/health',connected:false,matched:false}])).valid,false));
test('missing preinput identity rejects unmount',()=>{const o=observation([{at:70,reason:'expected-route-unmount',path:'/report',connected:false,matched:false}]);o.feedback.preInputIdentityMatched=false;assert.equal(assessEndpointEpoch(o).valid,false);});
const identity={inputNode:{backendNodeId:1,children:[{backendNodeId:2}]},feedbackNode:{backendNodeId:2},pendingIdentity:{backendNodeId:2,connected:true,selectorMatches:true},observation:{feedback:{preInputIdentityMatched:true}}};
test('resolved CDP and retained JS object binding agrees',()=>assert.equal(pendingIdentityMatches(identity),true));
for(const [name,mutate] of [['inter-capture selector replacement',p=>p.pendingIdentity.selectorMatches=false],['inter-capture detached object',p=>p.pendingIdentity.connected=false],['different backend object',p=>p.pendingIdentity.backendNodeId=3],['later JS object replacement',p=>p.observation.feedback.preInputIdentityMatched=false]])test(`${name} rejects`,()=>{const p=structuredClone(identity);mutate(p);assert.equal(pendingIdentityMatches(p),false);});
// Derive helper-only metadata around retained events to exercise integration.
// These invented Range/check rows are NOT new or repaired actual measurements.
const {raw}=await readArchives(path.resolve('docs/superpowers/evidence/2026-10-04/task-10/performance-smoke-1791051893513/action-checkin-save-1'));
const original=JSON.parse(raw.get('dom-provenance.json')),events=JSON.parse(raw.get('trace.json')).traceEvents;
const adapted=withConstructedCoordinateProof(original),f=adapted.observation.feedback;
f.markStart=f.at;f.textRects=[f.rect];
const current={visible:true,hit:true,supported:true,rect:f.rect,textRects:[f.rect]};
adapted.observation.endpointLifecycle={version:1,checks:[f.at,f.at+1000].map(at=>({...good(at),current}))};
const replay=p=>correlateAction(events,p,raw.get('before.jpg'),raw.get('after.jpg'),JSON.parse(raw.get('trace.json')).metadata);
test('constructed temporal metadata exercises actual strict frame chain',()=>assert.equal(replay(adapted).candidateFeedbackLatencyMs,50.875));
test('positive epoch ending before exact presentation rejects integrated chain',()=>{const p=structuredClone(adapted);p.observation.endpointLifecycle.checks[1].at=f.at+1;assert.equal(replay(p).valid,false);});
test('later removal callback cannot recover integrated missing positive proof',()=>{const p=structuredClone(adapted);p.observation.endpointLifecycle.checks[1].at=f.at+1;p.observation.endpointLifecycle.checks.push({...good(f.at+1000),same:false,current});assert.equal(replay(p).valid,false);});
const navigationArchive=await readArchives(path.resolve('docs/superpowers/evidence/2026-10-04/task-10/performance-smoke-1791057159617/action-navigate-report-1'));
const navRaw=navigationArchive.raw,navEvents=JSON.parse(navRaw.get('trace.json')).traceEvents,navProvenance=withConstructedCoordinateProof(JSON.parse(navRaw.get('dom-provenance.json')));
const navReplay=(events=navEvents,p=navProvenance)=>correlateAction(events,p,navRaw.get('before.jpg'),navRaw.get('after.jpg'),JSON.parse(navRaw.get('trace.json')).metadata);
test('diagnostic only: first meaningful frame168 must have its own strict chain',()=>assert.ok(navReplay().candidates.find(c=>c.frameSequence===168)?.correlation));
const navMetadata=JSON.parse(navRaw.get('trace.json')).metadata;
const rootLayer=navEvents.find(e=>e.name==='LayerTreeHostImpl:snapshot'&&e.ts===22344034482&&e.args.snapshot)?.args.snapshot.active_tree.layers.find(l=>l.layer_id===19);
const rootClip=navEvents.find(e=>e.name==='Paint'&&e.ts===22344030354).args.data.clip;
const projected={x:30,y:809.0000610351562,right:246,bottom:844.0000305175781};
const mapping=(layer=rootLayer,clip=rootClip,metadata=navMetadata,glyph=projected)=>rootLayerCoordinates(layer,glyph,clip,metadata);
test('actual retained translation maps viewport glyph to local invalidation once',()=>{const r=mapping();assert.equal(r.valid,true);assert.deepEqual(r.translation,{x:0,y:-568});assert.equal(r.localGlyph.y,1377.0000610351562);assert.equal(r.epsilonDevicePixels,1e-4);});
test('diagnostic selects168 and records rejected newer HTML paint in same commit',()=>{const r=navReplay();assert.equal(r.first.frameSequence,168);assert.equal(r.first.correlation.paint.ts,22344030354);assert.equal(r.first.correlation.beginFrame.args.data.frameId,16);assert.equal(r.first.correlation.commit.ts,22344033568);assert.ok(r.first.paintAttempts.some(a=>a.backendNodeId===22&&!a.selected&&a.reasons.includes('unsupported ancestor or endpoint epoch')));assert.equal(r.feedbackLatencyMs,null);});
const identityLayer=structuredClone(rootLayer);delete identityLayer.screen_space_transform;identityLayer.layer_quad=[0,0,562,0,562,1834,0,1834];identityLayer.invalidation=[30,809,216,35];
test('exact source-defined identity omission requires corroborating unit origin bounds quad scales',()=>assert.equal(mapping(identityLayer).kind,'source-defined-identity-omission'));
for(const [name,mutate] of [
  ['missing translated transform',l=>delete l.screen_space_transform],
  ['unknown scaling',l=>l.screen_space_transform[0]=2],
  ['rotation',l=>l.screen_space_transform[1]=1],
  ['skew',l=>l.screen_space_transform[4]=.01],
  ['perspective',l=>l.screen_space_transform[12]=.01],
  ['nonfinite translation',l=>l.screen_space_transform[7]=NaN],
  ['wrong quad translation',l=>l.layer_quad[1]-=1],
  ['wrong bounds',l=>l.bounds.width+=1],
  ['nonzero recording origin',l=>l.position[1]=1],
  ['nonunit recording scale',l=>l.geometry_contents_scale=2],
  ['nonunit raster scale',l=>l.raster_scales.contents_scale[1]=2],
  ['viewport coordinates incorrectly used as local',l=>l.invalidation=[30,809,216,35]],
  ['scroll translation applied twice',l=>{l.screen_space_transform[7]=-1136;l.layer_quad=[0,-1136,562,-1136,562,698,0,698];}],
  ['background-only invalidation',l=>l.invalidation=[0,0,20,20]],
  ['glyph clipped beyond precision bound',l=>l.invalidation=[30,1377,216,34.999]],
  ['missing invalidation',l=>delete l.invalidation],
  ['malformed invalidation',l=>l.invalidation=[30,1377,216]],
])test(`${name} mapping rejects`,()=>{const l=structuredClone(rootLayer);mutate(l);assert.equal(mapping(l).valid,false);});
test('unknown Chromium revision rejects identity omission',()=>assert.equal(mapping(identityLayer,rootClip,{revision:'unknown'}).valid,false));
test('missing Chromium metadata rejects explicit transform',()=>assert.equal(mapping(rootLayer,rootClip,{}).valid,false));
test('Paint clip in screen space is not accepted as root local space',()=>assert.equal(mapping(rootLayer,rootLayer.layer_quad).valid,false));
// R43: a local cull may be partial; this constructed negative now actually clips the complete glyph.
 test('local Paint cull clipping the glyph rejects despite larger bounds',()=>assert.equal(mapping(rootLayer,[0,0,562,0,562,1400,0,1400]).valid,false));
const frame168=(events,p=navProvenance)=>navReplay(events,p).candidates.find(c=>c.frameSequence===168)?.correlation;
for(const [name,mutate] of [
  ['wrong active source frame',events=>{for(const e of events)if(e.name==='LayerTreeHostImpl:snapshot'&&e.ts===22344034482&&e.args.snapshot)e.args.snapshot.active_tree.source_frame_number=-1;}],
  ['wrong committed tree',events=>{for(const e of events)if(e.name==='Commit'&&e.ts===22344033568)e.args.layerTreeId=-1;}],
  ['stale document paint outside committed source interval',events=>{events.find(e=>e.name==='Paint'&&e.ts===22344030354).ts=22344028000;}],
  ['wrong document backend',events=>{events.find(e=>e.name==='Paint'&&e.ts===22344030354).args.data.nodeId=-1;}],
  ['only partial presentation',events=>{for(const e of events)if(e.args?.frame_reporter?.frame_sequence===168)e.args.frame_reporter.state='STATE_PRESENTED_PARTIAL';}],
  ['wrong JPEG source',events=>{for(const e of events)if(e.name==='Screenshot'&&e.args.frame_sequence===168)e.args.source_id=-1;}],
])test(`${name} rejects168 rather than borrowing169 chain`,()=>{const events=structuredClone(navEvents);mutate(events);assert.equal(frame168(events),null);});
test('earlier meaningful168 is not retroactively accepted by diagnostic repair',()=>{assert.equal(JSON.parse(navRaw.get('correlation.json')).candidates.find(c=>c.frameSequence===168).correlation,null);assert.equal(JSON.parse(navRaw.get('correlation.json')).feedbackLatencyMs,null);});
console.log(`${checks} lifecycle checks passed; synthetic helper fixtures and offline diagnostic replay, no new browser timings or retroactive acceptance.`);
