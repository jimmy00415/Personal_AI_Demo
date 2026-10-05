import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {ProcessedNavigation} from 'lighthouse/core/computed/processed-navigation.js';
import {actionIds, routes, strictCls, assessGroup, validateActionOutcome} from './measure-demo-performance.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const require = (value, message) => { if (!value) throw Error(message); };
function child(root, name) {
  require(typeof name === 'string' && name.length > 0 && !path.isAbsolute(name), 'Invalid evidence-relative filename');
  const result = path.resolve(root, name);
  require(result.startsWith(path.resolve(root) + path.sep), 'Evidence path escapes its directory');
  return result;
}
async function bytes(root, name) {
  const file = child(root,name), resolved = await fs.realpath(file), actualRoot = await fs.realpath(root);
  require(resolved.startsWith(actualRoot + path.sep), 'Evidence symlink escapes its directory');
  return fs.readFile(file);
}
export async function readArchives(dir) {
  const manifest = await json(path.join(dir,'archive-manifest.json')), raw = new Map();
  require(Array.isArray(manifest) && manifest.length > 0, 'Archive manifest absent');
  for (const row of manifest) {
    require(row.file.endsWith('.gz') && !raw.has(row.file.slice(0,-3)), 'Duplicate or non-gzip archive entry');
    const compressed = await bytes(dir,row.file), unpacked = gunzipSync(compressed);
    require(compressed.length === row.compressedBytes && hash(compressed) === row.compressedSha256, `Compressed integrity failed: ${row.file}`);
    require(unpacked.length === row.rawBytes && hash(unpacked) === row.rawSha256 && row.roundTripVerified === true, `Raw integrity failed: ${row.file}`);
    raw.set(row.file.slice(0,-3),unpacked);
  }
  return {manifest,raw};
}
const readRaw = (raw,name) => {require(raw.has(name),`Required raw evidence missing: ${name}`);return JSON.parse(raw.get(name));};
export function parseCapturedActionTrace(archived,bytes) {
  if(archived.actionTraceParserSchema===undefined&&archived.parseActionTrace===undefined)return JSON.parse(bytes);
  require(archived.actionTraceParserSchema==='unsafe-integer-lexemes-v1'&&typeof archived.parseActionTrace==='function','Unknown archived action trace parser schema');
  return archived.parseActionTrace(bytes);
}

// This is deliberately an offline, second phase. No browser or server is started.
export async function verifyEvidence(directory, {smoke=false, reviewOverride}={}) {
  const dir=path.resolve(directory), failures=[],pending=[],actions=[],navigation=[],reviewBindings=[];
  try {
    const provenance=await json(path.join(dir,'provenance.json'));
    const harness=await bytes(dir,'executed-harness.mjs');
    require(hash(harness)===provenance.hashes['scripts/measure-demo-performance.mjs'],'Executed harness hash differs from capture provenance');
    require((await json(path.join(dir,'cleanup.json'))).serverClosed===true,'Owned server closure not recorded');
    require(provenance.smoke===smoke,'Smoke/full verification scope mismatch');
    const smokeAction=provenance.scope?.action||'checkin-save';
    if(smoke)require(['checkin-save','navigate-report','time-change'].includes(smokeAction),'Unknown single smoke action');
    const archivedFile=provenance.sourceBindingSha256?path.join(dir,'captured-methods','measure-demo-performance.mjs'):path.join(dir,'executed-harness.mjs');
    require(hash(await fs.readFile(archivedFile))===hash(harness),'Archived adapter differs from executed harness');
    const archived=await import(pathToFileURL(archivedFile).href);
    require(typeof archived.correlateAction==='function','Archived correlation adapter absent');
    const entries=await fs.readdir(dir,{withFileTypes:true});
    const actionDirs=entries.filter(e=>e.isDirectory()&&/^action-/.test(e.name)).map(e=>e.name).sort();
    const expected=smoke?[`action-${smokeAction}-1`]:actionIds.flatMap(a=>Array.from({length:10},(_,i)=>`action-${a}-${i+1}`)).sort();
    require(equal(actionDirs,expected),`Action sample coverage incomplete: ${actionDirs.length}/${expected.length}`);
    for(const name of actionDirs){
      const sampleDir=child(dir,name),{raw,manifest}=await readArchives(sampleDir);
      require((await json(path.join(sampleDir,'cleanup.json'))).contextClosed===true,`${name}: browser closure missing`);
      const summary=await json(path.join(sampleDir,'summary.json')),p=readRaw(raw,'dom-provenance.json'),observation=readRaw(raw,'observation.json'),setup=readRaw(raw,'setup.json'),trace=parseCapturedActionTrace(archived,raw.get('trace.json')),network=readRaw(raw,'all-network.json');
      require(summary.id===name&&summary.validationErrors.length===0,`${name}: captured instrumentation failure`);
      const identified=expected.map(id=>({id,match:id.match(/^action-(.+)-(\d+)$/)})).find(v=>v.id===name);
      require(identified&&summary.action===identified.match[1]&&summary.iteration===Number(identified.match[2]),'Action name/iteration differs from required sample identity');
      require(smoke?summary.action===smokeAction&&(smokeAction==='checkin-save'?p.prepared.trigger==='checkin-save':p.prepared.action===smokeAction&&p.prepared.trigger===(smokeAction==='time-change'?'reminder-save':'assistant-next')):p.prepared.action===summary.action,'Raw prepared action differs from sample identity');
      require(equal(p.observation,observation)&&equal(p.prepared,setup.prepared),'Provenance/setup/observation diverge');
      require(setup.cpu===4&&setup.latencyMs===150&&setup.downloadBytesPerSecond===200000&&setup.uploadBytesPerSecond===93750&&setup.viewport.width===390&&setup.viewport.height===844,'Action throttle or viewport mismatch');
      require(observation.focused&&observation.visibility.every(v=>v==='visible')&&(observation.endpointLifecycle?archived.assessEndpointEpoch(observation).valid:observation.endpointIntegrity.valid),'Action foreground/endpoint continuity failed');
      if(!smoke||observation.endpointLifecycle){
        require(readRaw(raw,'tracing-completion.json').dataLossOccurred!==true,'Trace data loss reported');
        const reference=readRaw(raw,'after-reference-geometry.json');
        if(observation.endpointLifecycle)require(reference.viewport.width===observation.viewport.width&&reference.viewport.height===observation.viewport.height&&(reference.present||p.prepared.navigation&&reference.path===p.prepared.navigation.path),'Post-trace destination/reference provenance differs');
        else require(reference.text===observation.feedback.text&&['x','y','width','height'].every(k=>Math.abs(reference.rect[k]-observation.feedback.rect[k])<=.1)&&reference.viewport.width===observation.viewport.width&&reference.viewport.height===observation.viewport.height,'Post-trace reference geometry differs');
      }
      require(network.forbidden.length===0&&network.errors.length===0,'Action browser/network errors');
      const replay=archived.correlateAction(trace.traceEvents,p,raw.get('before.jpg'),raw.get('after.jpg'),trace.metadata);
      require(equal(replay,readRaw(raw,'correlation.json')),'Archived correlation replay differs from retained raw result');
      require(replay.valid&&replay.errors.length===0,`${name}: trace attribution invalid`);
      // The historical accepted smoke predates the explicit action field. Its
      // recorded trigger and summary identify this one action without altering raw.
      const prepared=p.prepared.action?p.prepared:{...p.prepared,action:summary.action,expected:{}};
      require(smoke||!!p.prepared.action,'Full capture lacks declared action');
      require(validateActionOutcome(prepared,observation).length===0,`${name}: exact persisted outcome failed`);
      if(prepared.navigation){
        const n=readRaw(raw,'navigation-readiness.json');
        require(n.cacheCleared&&n.destinationRequests.length>0&&n.destinationResponses.length>0&&n.destinationReady.path===prepared.navigation.path,'Navigation readiness/cache provenance missing');
        require(n.destinationRequests.every(e=>e.params.timestamp*1e6>=replay.input.ts),'Destination requested before activation');
        require(n.destinationResponses.every(e=>e.params.response.status===200&&!e.params.response.fromDiskCache&&!e.params.response.fromPrefetchCache&&!e.params.response.fromServiceWorker),'Destination was cached/unsuccessful');
        require(n.destinationDomReadyLatencyMs===observation.destinationReady.at-observation.input.eventTimeStamp,'Destination-ready latency clock mismatch');
      }
      const screens=trace.traceEvents.filter(e=>e.name==='Screenshot');
      for(const [index,screen] of screens.entries())require(Buffer.from(screen.args.snapshot,'base64').equals(raw.get(`trace-screen-${index}.jpg`)),`Trace JPEG archive differs: ${name}/${index}`);
      let review;
      try { review=reviewOverride?.[name]??await json(path.join(sampleDir,'visual-review.json')); }
      catch(error){if(error.code==='ENOENT'){pending.push(name);continue;}throw error;}
      require(review.kind==='assistant-technical-visual-review'&&review.decision==='accept','Explicit technical visual acceptance absent');
      require(review.run===path.basename(dir)&&review.sample===name&&review.executedHarnessSha256===hash(harness)&&review.archiveManifestSha256===hash(await bytes(sampleDir,'archive-manifest.json')),'Review run/sample/source/raw binding mismatch');
      require(review.productSourceManifestSha256===hash(await bytes(dir,'product-source-hashes.json'))&&review.buildId===provenance.buildId.trim(),'Review product/build binding mismatch');
      if(provenance.sourceBindingSha256)require(review.sourceBindingSha256===provenance.sourceBindingSha256&&review.sourceBindingSha256===hash(await bytes(dir,'runtime-source-binding.json')),'Review complete runtime/config/method source binding mismatch');
      require(review.reviewer&&Number.isFinite(Date.parse(review.reviewedAt))&&review.expectedText===p.prepared.expectedText&&equal(review.roi,observation.feedback.rect),'Reviewer/time/text/ROI missing or different');
      require(review.fullFrameInspected&&review.roiInspected&&review.beforeVisiblyDiffers&&review.persistedStateVerified&&review.noOcclusionOrGeometryAmbiguity,'Required explicit semantic inspection missing');
      require(review.stateBeforeSha256===hash(Buffer.from(JSON.stringify(p.prepared.stateBefore)))&&review.stateAfterSha256===hash(Buffer.from(JSON.stringify(observation.stateAfter))),'Review state binding mismatch');
      require(review.beforeJpegSha256===hash(raw.get('before.jpg'))&&review.afterJpegSha256===hash(raw.get('after.jpg')),'Reference image binding mismatch');
      const accepted=replay.candidates.find(c=>c.frameSequence===review.frameSequence&&c.frameSource===review.frameSource&&c.screenshotTsUs===review.screenshotTsUs);
      require(accepted?.correlation,'Reviewed frame has no strict attribution chain');
      const screen=screens.find(e=>e.args.frame_sequence===review.frameSequence&&e.args.source_id===review.frameSource&&e.ts===review.screenshotTsUs);
      require(screen&&hash(Buffer.from(screen.args.snapshot,'base64'))===review.jpegSha256,'Accepted JPEG identity mismatch');
      require(typeof review.earliestEligibleFrameJustification==='string'&&review.earliestEligibleFrameJustification.length>20,'Earliest eligible frame justification absent');
      // Every earlier screenshot needs an explicit disposition. Pixel similarity
      // is corroboration only and cannot silently discard a meaningful earlier frame.
      const earlier=screens.filter(e=>e.ts<screen.ts);
      require(review.earlierFrames.length===earlier.length,'Earlier frame inspection incomplete');
      for(const e of earlier){const r=review.earlierFrames.find(r=>r.frameSequence===e.args.frame_sequence&&r.frameSource===e.args.source_id&&r.screenshotTsUs===e.ts);require(r&&r.jpegSha256===hash(Buffer.from(e.args.snapshot,'base64'))&&r.meaningfulFeedbackVisible===false&&r.reason?.length>10,'Earlier frame semantic rejection absent');}
      require(Array.isArray(review.supportingReports)&&review.supportingReports.length>0,'Review report reference absent');
      for(const report of review.supportingReports){require(!report.path.includes('\\'),'Report paths must use portable forward slashes');require(hash(await bytes(sampleDir,report.path))===report.sha256,'Visual review report hash mismatch');}
      const latency=(accepted.correlation.presentationTsUs-replay.input.ts)/1000;
      require(Number.isFinite(latency)&&latency>=0,'Invalid presented latency');
      actions.push({id:name,action:summary.action,iteration:summary.iteration,feedbackLatencyMs:latency,frameSequence:review.frameSequence,jpegSha256:review.jpegSha256,rawArchives:manifest.length,separateEventTiming:summary.eventTiming,destinationDomReadyLatencyMs:prepared.navigation?readRaw(raw,'navigation-readiness.json').destinationDomReadyLatencyMs:null});
      reviewBindings.push({id:name,reviewSha256:hash(Buffer.from(JSON.stringify(review))),archiveManifestSha256:review.archiveManifestSha256});
    }
    const navDirs=entries.filter(e=>e.isDirectory()&&!/^action-/.test(e.name)&&e.name!=='captured-methods').map(e=>e.name);
    if(!smoke){
      const expectedNav=routes.flatMap(route=>['mobile','desktop'].flatMap(device=>['cold','warm'].flatMap(cache=>Array.from({length:5},(_,i)=>`${route==='/'?'today':route.slice(1)}-${device}-${cache}-${i+1}`)))).sort();
      require(equal([...navDirs].sort(),expectedNav),`Navigation sample coverage incomplete: ${navDirs.length}/340`);
      for(const name of navDirs){
        const sampleDir=child(dir,name),{raw}=await readArchives(sampleDir),s=await json(path.join(sampleDir,'summary.json'));
        require(s.id===name&&`${s.route==='/'?'today':s.route.slice(1)}-${s.device}-${s.cache}-${s.iteration}`===name&&Number.isInteger(s.iteration)&&s.iteration>=1&&s.iteration<=5,'Navigation summary identity differs from required sample');
        const setup=readRaw(raw,'setup.json'),lhr=readRaw(raw,'lhr.json'),o=readRaw(raw,'observer.json'),trace=readRaw(raw,'trace.json'),log=readRaw(raw,'devtools-log.json'),network=readRaw(raw,'all-network.json'),lifecycle=readRaw(raw,'lifecycle.json');
        require((await json(path.join(sampleDir,'cleanup.json'))).contextClosed,'Navigation browser closure absent');
        require(s.validationErrors.length===0&&!lhr.runtimeError&&network.forbidden.length===0&&network.errors.length===0,'Navigation capture invalid');
        const processed=await ProcessedNavigation.request(trace,{computedCache:new Map()}),mark=trace.traceEvents.find(e=>e.name==='caremate-primary-trace-end');
        require(mark&&Math.abs((mark.ts-processed.timestamps.timeOrigin)/1000-o.boundaryMs)<=1,'Navigation timing boundary mismatch');
        require(!trace.traceEvents.some(e=>['LayoutShift','largestContentfulPaint::Candidate','largestContentfulPaint::Invalidate'].includes(e.name)&&e.ts>mark.ts)&&![...o.observer.lcp,...o.observer.shifts].some(e=>e.startTime>o.boundaryMs),'Unobserved late navigation tail');
        require(o.url===lhr.finalDisplayedUrl&&o.marker===setup.marker&&o.hasFocus&&o.observer.visibility.every(e=>e.state==='visible'),'Timed document/foreground mismatch');
        require(!network.internal.length||lifecycle.find(e=>e.phase==='snapshot')?.at<network.internal[0].at,'Observer snapshot followed ancillary document');
        const seed=JSON.parse(setup.seed.demo);
        require(equal(o.state.context,seed.context)&&o.state.clock===seed.clock&&o.preferences.locale==='zh-HK','Navigation coherent actor/clock/locale mismatch');
        require(o.primaryLcp.length&&s.lcpText&&!/loading|載入/i.test(s.lcpText),'Meaningful final LCP absent');
        const cached=log.filter(e=>e.method==='Network.responseReceived'&&(e.params.response.fromDiskCache||e.params.response.fromPrefetchCache));
        require(s.cache==='cold'?cached.length===0:cached.length>0,'Cold/warm cache provenance failed');
        const computed={auditLcpMs:lhr.audits['largest-contentful-paint'].numericValue,observerLcpMs:o.primaryLcp.at(-1).startTime,auditCls:lhr.audits['cumulative-layout-shift'].numericValue,observerCls:strictCls(o.primaryShifts),score:lhr.categories.performance.score*100};
        require(Object.entries(computed).every(([k,v])=>s[k]===v),'Readable navigation metrics differ from raw');
        const throttle=setup.flags.throttling;
        require(setup.flags.throttlingMethod==='devtools'&&throttle.requestLatencyMs===150&&throttle.downloadThroughputKbps===1562.5&&throttle.uploadThroughputKbps===732.421875&&throttle.cpuSlowdownMultiplier===4,'Navigation throttle mismatch');
        require(o.innerWidth===(s.device==='mobile'?390:1440)&&o.innerHeight===(s.device==='mobile'?844:900),'Navigation viewport mismatch');
        navigation.push(s);
      }
    }else require(navDirs.length===0,'Single-action smoke contains unexpected navigation samples');
    const actionGroups=[];
    for(const action of smoke?[smokeAction]:actionIds){
      const samples=actions.filter(s=>s.action===action),n=smoke?1:10;
      if(samples.length!==n){
        const expectedIds=Array.from({length:n},(_,i)=>`action-${action}-${i+1}`),unreviewed=expectedIds.filter(id=>pending.includes(id));
        require(samples.length+unreviewed.length===n&&expectedIds.every(id=>samples.some(s=>s.id===id)||unreviewed.includes(id)),`Required action group incomplete: ${action}`);
        continue;
      }
      require(new Set(samples.map(s=>s.iteration)).size===n,'Duplicate action iteration');
      const p95=[...samples].sort((a,b)=>a.feedbackLatencyMs-b.feedbackLatencyMs)[Math.ceil(.95*n)-1].feedbackLatencyMs;
      actionGroups.push({action,n,...(smoke?{singleSampleFeedbackMs:p95}:{p95Ms:p95}),budgetMs:200});if(p95>200)failures.push(`${action}: ${smoke?'single sample':'p95'} ${p95}ms exceeds 200ms`);
    }
    require(actions.length+pending.filter(id=>expected.includes(id)).length===expected.length,'Reviewed action coverage is incomplete');
    if(!pending.length)require(actionGroups.length===(smoke?1:14),'Required action group budget coverage missing');
    const navigationGroups=[];
    if(!smoke)for(const route of routes)for(const device of ['mobile','desktop'])for(const cache of ['cold','warm']){
      const samples=navigation.filter(s=>s.route===route&&s.device===device&&s.cache===cache);
      require(samples.length===5&&new Set(samples.map(s=>s.iteration)).size===5,`Navigation group incomplete: ${route}/${device}/${cache}`);
      const group={route,device,cache,...assessGroup(samples)};navigationGroups.push(group);failures.push(...group.errors);
      if(group.outliers.length){
        let report;try{report=await json(path.join(dir,'outlier-analysis.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
        for(const id of group.outliers)if(!report?.samples?.some(s=>s.id===id&&s.analysis?.length>40&&s.evidence?.length))pending.push(`Outlier analysis: ${id}`);
      }
    }
    const exitCode=failures.length?1:pending.length?2:0;
    return {scope:smoke?'One actual-action method smoke only; no matrix/p95 acceptance':'140 reviewed actions and 340 direct navigation samples',exitCode,status:exitCode===0?'verified':exitCode===2?'pending':'failed',failures,pending,actions,actionGroups,navigationSampleCount:navigation.length,navigationGroups,reviewBindings,executedHarnessSha256:hash(harness),verifierSha256:hash(await fs.readFile(new URL(import.meta.url))),verifiedAt:new Date().toISOString()};
  } catch(error){return {scope:smoke?'single-action-smoke':'full-matrix',status:'failed',exitCode:1,failures:[...failures,error.message],pending,verifiedAt:new Date().toISOString()};}
}
