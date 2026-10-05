import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import lighthouse from 'lighthouse';
import defaultConfig from 'lighthouse/core/config/default-config.js';
import {userAgents} from 'lighthouse/core/config/constants.js';
import {ProcessedNavigation} from 'lighthouse/core/computed/processed-navigation.js';
import BaseGatherer from 'lighthouse/core/gather/base-gatherer.js';
import Trace from 'lighthouse/core/gather/gatherers/trace.js';
import {Audit} from 'lighthouse/core/audits/audit.js';
import jpeg from 'jpeg-js';
import {captureSourceBinding,methodFiles} from './performance-source-binding.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const END_MARK = 'caremate-primary-trace-end';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const routes = ['/welcome', '/', '/check-in', '/ask', '/help', '/health', '/care', '/book', '/brief', '/report', '/print', '/family', '/sharing', '/notifications', '/memory', '/settings', '/about'];

// Pinned Lighthouse 13.5.0 lifecycle adapter; proven synthetic predecessor is
// documented in performance-observer-alignment.md. No early observer deadline.
class BoundaryTrace extends Trace {
  async stopSensitiveInstrumentation(context) {
    await context.driver.executionContext.evaluate(name => performance.mark(name), {args: [END_MARK], useIsolation: false});
    await super.stopSensitiveInstrumentation(context);
  }
}
class AlignedObservers extends BaseGatherer {
  meta = {supportedModes: ['navigation']};
  snapshot = null;
  events = [];
  async startInstrumentation({driver, page}) {
    this.events.push({phase: 'start', at: new Date().toISOString()});
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.events.push({phase: 'navigation', url: frame.url(), at: new Date().toISOString()}); });
    await driver.executionContext.evaluateOnNewDocument(() => {
      const state = {timeOrigin: performance.timeOrigin, installedAtMs: performance.now(), documentToken: crypto.randomUUID(), lcp: [], shifts: [], visibility: [{time: performance.now(), state: document.visibilityState}]};
      const record = (key, entries) => { for (const e of entries) state[key].push({...e.toJSON(), ...(key === 'lcp' ? {elementText: e.element?.textContent, elementTag: e.element?.tagName} : {})}); };
      const lcp = new PerformanceObserver(list => record('lcp', list.getEntries())); lcp.observe({type: 'largest-contentful-paint', buffered: true});
      const shifts = new PerformanceObserver(list => record('shifts', list.getEntries())); shifts.observe({type: 'layout-shift', buffered: true});
      document.addEventListener('visibilitychange', () => state.visibility.push({time: performance.now(), state: document.visibilityState}));
      window.__caremateObserver = {flush: () => {record('lcp', lcp.takeRecords()); record('shifts', shifts.takeRecords()); lcp.disconnect(); shifts.disconnect(); return state;}};
    }, {args: []});
  }
  async stopInstrumentation({driver}) {
    this.snapshot = await driver.executionContext.evaluate(name => {
      const mark = performance.getEntriesByName(name, 'mark').at(-1);
      if (!mark || !window.__caremateObserver) throw Error('Primary document observer or trace marker missing');
      const observer = window.__caremateObserver.flush();
      return {url: location.href, marker: localStorage.getItem('caremate-acceptance-marker'), state: JSON.parse(localStorage.getItem('caremate-v4')), preferences: JSON.parse(localStorage.getItem('caremate-v4-preferences')), bodyText: document.body.innerText, visibility: document.visibilityState, hasFocus: document.hasFocus(), ua: navigator.userAgent, innerWidth, innerHeight, dpr: devicePixelRatio, boundaryMs: mark.startTime, capturedAtMs: performance.now(), observer, primaryLcp: observer.lcp.filter(e => e.startTime <= mark.startTime), primaryShifts: observer.shifts.filter(e => e.startTime <= mark.startTime), resources: performance.getEntriesByType('resource').map(e => e.toJSON())};
    }, {args: [END_MARK], useIsolation: false});
    this.events.push({phase: 'snapshot', at: new Date().toISOString(), documentToken: this.snapshot.observer.documentToken});
  }
  getArtifact() { this.events.push({phase: 'saved-artifact', at: new Date().toISOString()}); return this.snapshot; }
}
class ObserverProvenance extends Audit {
  static get meta() { return {id: 'caremate-observer-provenance', title: 'Independent primary-document observer', description: 'Retained primary document and observation boundary.', scoreDisplayMode: Audit.SCORING_MODES.INFORMATIVE, supportedModes: ['navigation'], requiredArtifacts: ['AlignedObservers']}; }
  static audit(artifacts) { return {score: null, details: {type: 'debugdata', items: [artifacts.AlignedObservers]}}; }
}
export function strictCls(entries) {
  let max = 0, sum = 0, first = -Infinity, last = -Infinity;
  for (const e of entries.filter(e => !e.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
    if (e.startTime - first > 5000 || e.startTime - last > 1000) {first = e.startTime; sum = 0;}
    last = e.startTime; sum += e.value; max = Math.max(max, sum);
  }
  return max;
}
export const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
export function assessGroup(samples, expectedCount = 5) {
  const errors = [];
  if (samples.length !== expectedCount) errors.push(`Expected ${expectedCount} samples, received ${samples.length}`);
  for (const field of ['auditLcpMs', 'observerLcpMs', 'auditCls', 'observerCls', 'score']) if (samples.some(s => !Number.isFinite(s[field]))) errors.push(`Missing/nonfinite ${field}`);
  const medians = Object.fromEntries(['auditLcpMs', 'observerLcpMs', 'auditCls', 'observerCls', 'score'].map(k => [k, median(samples.map(s => s[k]))]));
  for (const k of ['auditLcpMs', 'observerLcpMs']) if (medians[k] > 2500) errors.push(`${k} median ${medians[k]} > 2500ms`);
  for (const k of ['auditCls', 'observerCls']) if (medians[k] > .1) errors.push(`${k} median ${medians[k]} > 0.1`);
  if (medians.score < 90) errors.push(`Lighthouse score median ${medians.score} < 90`);
  return {medians, errors, outliers: samples.filter(s => s.auditLcpMs > 4000 || s.observerLcpMs > 4000 || s.auditCls > .25 || s.observerCls > .25).map(s => s.id)};
}
async function freePort(port = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const actual = server.address().port; await new Promise(resolve => server.close(resolve)); return actual;
}
export async function freeDebugPort(allocate = freePort) {
  for (let requested = 49152; requested <= 49215; requested++) {
    let actual;
    try { actual = await allocate(requested); }
    catch (error) { if (error?.code === 'EADDRINUSE') continue; throw error; }
    if (!Number.isSafeInteger(actual) || actual !== requested) throw Error(`Invalid allocated debug port: ${actual}`);
    return actual;
  }
  throw Error('Debug port allocation exhausted all64 permitted candidates');
}
async function saveRaw(dir, name, value, manifest) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  const compressed = gzipSync(raw, {level: 9});
  if (!gunzipSync(compressed).equals(raw)) throw Error(`Lossless verification failed: ${name}`);
  const file = `${name}.gz`; await fs.writeFile(path.join(dir, file), compressed);
  const reread = await fs.readFile(path.join(dir, file));
  if (sha256(gunzipSync(reread)) !== sha256(raw)) throw Error(`Written archive hash mismatch: ${name}`);
  manifest.push({file, rawBytes: raw.length, compressedBytes: reread.length, rawSha256: sha256(raw), compressedSha256: sha256(reread), roundTripVerified: true});
}
async function seedScenario(page, origin, route, selectedScenario) {
  await page.goto(`${origin}/dev`);
  await page.evaluate(() => localStorage.setItem('caremate-v4-preferences', JSON.stringify({locale: 'zh-HK', liteMode: false, introComplete: true})));
  await page.reload();
  const scenario = selectedScenario || (route === '/welcome' ? 'first-use' : ['/brief', '/print'].includes(route) ? 'day-before-visit' : route === '/help' ? 'urgent-help' : route === '/ask' ? 'dizziness' : ['family', 'notifications'].includes(route.slice(1)) ? 'caregiver-alert' : 'routine-day');
  await page.getByTestId(`scenario-${scenario}`).click();
  if (route === '/print') { await page.goto(`${origin}/brief`); await page.getByTestId('brief-confirm').click(); }
  const seed = await page.evaluate(() => ({demo: localStorage.getItem('caremate-v4'), preferences: localStorage.getItem('caremate-v4-preferences'), emergency: sessionStorage.getItem('caremate-v4-emergency')}));
  if (JSON.parse(seed.demo).schemaVersion !== 4) throw Error('Invalid scenario schema');
  return {...seed, scenario};
}
async function measure(origin, route, device, cache, iteration, output) {
  const id = `${route === '/' ? 'today' : route.slice(1)}-${device}-${cache}-${iteration}`;
  const dir = path.join(output, id); await fs.mkdir(dir);
  const manifest = [], network = [], forbidden = [], internal = [], errors = [];
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), `caremate-perf-${id}-`));
  const port = await freeDebugPort(); let context;
  try {
    const viewport = device === 'mobile' ? {width: 390, height: 844} : {width: 1440, height: 900};
    context = await chromium.launchPersistentContext(profile, {headless: false, executablePath: chromium.executablePath(), viewport, deviceScaleFactor: 1, serviceWorkers: 'block', args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1']});
    const page = context.pages()[0];
    context.on('request', request => {
      const entry = {url: request.url(), method: request.method(), at: new Date().toISOString()}; network.push(entry);
      if (entry.url === 'chrome://terms/') internal.push(entry);
      else if (new URL(entry.url).origin !== origin || /\/api(?:\/|$)/.test(new URL(entry.url).pathname) || !['GET', 'HEAD'].includes(entry.method)) forbidden.push(entry);
    });
    context.on('page', p => {p.bringToFront().catch(e => errors.push(String(e))); p.on('pageerror', e => errors.push(String(e))); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());}); p.on('websocket', socket => forbidden.push({url:socket.url(),type:'websocket'}));});
    context.on('serviceworker', worker => forbidden.push({url:worker.url(),type:'serviceworker'}));
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const seed = await seedScenario(page, origin, route);
    const marker = `${id}:${sha256(seed.demo)}`;
    const restore = async () => page.evaluate(({seed, marker}) => {localStorage.setItem('caremate-v4', seed.demo); localStorage.setItem('caremate-v4-preferences', seed.preferences); localStorage.setItem('caremate-acceptance-marker', marker); if(seed.emergency) sessionStorage.setItem('caremate-v4-emergency', seed.emergency);}, {seed, marker});
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
    const prime = []; cdp.on('Network.responseReceived', e => prime.push(e));
    if (cache === 'warm') {await restore(); await page.goto(origin + route); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(6500);}
    await restore();
    if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: false});
    const gatherer = new AlignedObservers();
    const config = {...defaultConfig, artifacts: [...defaultConfig.artifacts.map(a => a.id === 'Trace' ? {id: 'Trace', gatherer: {instance: new BoundaryTrace()}} : a), {id: 'AlignedObservers', gatherer: {instance: gatherer}}], audits: [...defaultConfig.audits, ObserverProvenance], categories: {...defaultConfig.categories, performance: {...defaultConfig.categories.performance, auditRefs: [...defaultConfig.categories.performance.auditRefs, {id: 'caremate-observer-provenance', weight: 0}]}}};
    const flags = {hostname: '127.0.0.1', port, logLevel: 'error', output: ['json', 'html'], onlyCategories: ['performance'], formFactor: device, screenEmulation: {mobile: device === 'mobile', ...viewport, deviceScaleFactor: 1, disabled: false}, emulatedUserAgent: userAgents[device], throttlingMethod: 'devtools', throttling: {requestLatencyMs: 150, downloadThroughputKbps: 1562.5, uploadThroughputKbps: 732.421875, cpuSlowdownMultiplier: 4}, disableStorageReset: true, pauseAfterFcpMs: 6000, pauseAfterLoadMs: 6000, maxWaitForLoad: 60000, maxWaitForFcp: 45000};
    await saveRaw(dir, 'setup.json', {seed, flags, profile, browser: context.browser().version(), marker}, manifest);
    const result = await lighthouse(origin + route, flags, config);
    const {lhr, artifacts} = result;
    for (const [name, value] of Object.entries({'lhr.json': lhr, 'lhr.html': result.report[1], 'trace.json': artifacts.Trace, 'devtools-log.json': artifacts.DevtoolsLog, 'observer.json': artifacts.AlignedObservers, 'prime-network.json': prime, 'lifecycle.json': gatherer.events})) await saveRaw(dir, name, value, manifest);
    const s = artifacts.AlignedObservers;
    const processed = await ProcessedNavigation.request(artifacts.Trace, {computedCache: new Map()});
    const raw = artifacts.Trace.traceEvents, mark = raw.find(e => e.name === END_MARK);
    const afterBoundary = raw.filter(e => ['LayoutShift', 'largestContentfulPaint::Candidate', 'largestContentfulPaint::Invalidate'].includes(e.name) && e.ts > mark?.ts);
    const bufferedTail = [...(s?.observer.lcp || []), ...(s?.observer.shifts || [])].filter(e => e.startTime > s?.boundaryMs);
    const cached = artifacts.DevtoolsLog.filter(e => e.method === 'Network.responseReceived' && (e.params.response.fromDiskCache || e.params.response.fromPrefetchCache));
    const boundary = {traceRelativeMs: (mark?.ts - processed.timestamps.timeOrigin) / 1000, observerRelativeMs: s?.boundaryMs, snapshotMs: s?.capturedAtMs, traceTailUs: raw.reduce((max,e)=>e.ph==='M'?max:Math.max(max,e.ts),0) - mark?.ts, afterBoundary, bufferedTail};
    const summary = {id, route, device, cache, iteration, scenario: seed.scenario, auditLcpMs: lhr.audits['largest-contentful-paint'].numericValue, observerLcpMs: s?.primaryLcp.at(-1)?.startTime, auditCls: lhr.audits['cumulative-layout-shift'].numericValue, observerCls: s ? strictCls(s.primaryShifts) : null, score: lhr.categories.performance.score * 100, cachedResponseCount: cached.length, lcpText: s?.primaryLcp.at(-1)?.elementText, boundary, forbidden, errors, runtimeError: lhr.runtimeError, warnings: lhr.runWarnings, configSettings: lhr.configSettings, profile, validationErrors: []};
    if (lhr.runtimeError || !mark || !s || s.url !== origin + route || s.marker !== marker || s.state?.schemaVersion !== 4 || s.state?.context.patientId !== 'may' || !s.hasFocus || s.observer.visibility.some(e => e.state !== 'visible') || s.innerWidth !== viewport.width || s.innerHeight !== viewport.height || afterBoundary.length || bufferedTail.length || Math.abs(boundary.traceRelativeMs - s.boundaryMs) > 1) summary.validationErrors.push('Timed document/boundary/foreground/state provenance failed');
    if (internal.length && gatherer.events.find(e => e.phase === 'snapshot')?.at >= internal[0].at) summary.validationErrors.push('Snapshot followed ancillary navigation');
    const intended=JSON.parse(seed.demo);
    if (JSON.stringify(s?.state?.context)!==JSON.stringify(intended.context)||s?.state?.clock!==intended.clock||s?.preferences?.locale!=='zh-HK') summary.validationErrors.push('Measured actor/patient/clock/locale differs from the initial snapshot');
    if (cache === 'warm' && cached.length === 0) summary.validationErrors.push('Warm navigation has no verified disk/prefetch cache response');
    if (cache === 'cold' && cached.length > 0) summary.validationErrors.push('Cold navigation unexpectedly used a cached response');
    if (forbidden.length || errors.length) summary.validationErrors.push('Forbidden request or browser error');
    if (!s?.primaryLcp.length || !summary.lcpText || /loading|載入/i.test(summary.lcpText)) summary.validationErrors.push('No meaningful product LCP');
    await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({id, auditLcpMs: summary.auditLcpMs, observerLcpMs: summary.observerLcpMs, auditCls: summary.auditCls, observerCls: summary.observerCls, score: summary.score, cached: cached.length, validationErrors: summary.validationErrors}));
    return summary;
  } catch(error) {
    await fs.writeFile(path.join(dir, 'failure.json'), JSON.stringify({message: error.message, stack: error.stack}, null, 2)); throw error;
  } finally {
    await context?.close();
    await saveRaw(dir, 'all-network.json', {network, forbidden, internal, errors}, manifest);
    await fs.writeFile(path.join(dir, 'archive-manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(dir, 'cleanup.json'), JSON.stringify({contextClosed: true, profilePreserved: profile, finishedAt: new Date().toISOString()}, null, 2));
  }
}
export const actionIds = ['navigate-report','navigate-brief','checkin-save','checkin-edit','dose-save','time-change','appointment-confirm','permission-confirm','permission-revoke','event-response','brief-confirm','task-accept','task-complete','aftervisit-save'];
export const actionTraceParserSchema='unsafe-integer-lexemes-v1';
export const actionTraceStartRequest=Object.freeze({transferMode:'ReturnAsStream',categories:['-*','devtools.timeline','disabled-by-default-devtools.timeline','disabled-by-default-devtools.timeline.frame','disabled-by-default-devtools.timeline.layers','disabled-by-default-devtools.screenshot','blink.user_timing','loading','latencyInfo','input','cc','benchmark','viz','disabled-by-default-cc.debug','disabled-by-default-lighthouse'].join(','),options:'sampling-frequency=10000'});
export function assessTraceTimestampContract(metadata,proof) {
  const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.toSorted().join(',');
  const valid=metadata?.revision==='971a7443b0c9b0a9b2860529b33331b76077ec62-refs/branch-heads/8010@{#343}'&&metadata['clock-domain']==='WIN_QPC'&&metadata['os-arch']==='x86_64'&&metadata['process-os-arch']==='x86_64'&&exactKeys(proof,['version','platform','tracingStartRequest'])&&proof.version==='explicit-stage-implicit-scope-start-v1'&&proof.platform==='win32'&&exactKeys(proof.tracingStartRequest,Object.keys(actionTraceStartRequest))&&Object.entries(actionTraceStartRequest).every(([key,value])=>proof.tracingStartRequest[key]===value);
  return {valid:!!valid,kind:'pinned-legacy-trace-config-incremental-1000ns-integer-json',maxSerializedStartDifferenceUs:1};
}
export function reporterStageStartCompatible(explicitStart,implicitStart,metadata,proof) {
  // Exact pinned source: the earlier explicit TimeTicks stage R and later
  // implicit scoped S can serialize as R<=S+1 after fixed 1000ns incremental
  // truncation and integer JSON export. No clock phase/timestamp is recovered.
  return assessTraceTimestampContract(metadata,proof).valid&&[explicitStart,implicitStart].every(v=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER)&&explicitStart<=implicitStart+1;
}
export function parseActionTrace(bytes) {
  return JSON.parse(bytes.toString(),(_key,value,context)=>{
    if(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value)){
      if(typeof context?.source!=='string')throw Error('Lossless JSON numeric source context unavailable');
      return context.source;
    }
    return value;
  });
}
const selector = id => `[data-testid="${id}"]`;
// Pinned Chromium method demonstrated in action-feedback-method.md. The endpoint
// is a Chromium-reported presented frame, not physical display scan-out.
function pairPipelineReporters(events) {
  const stacks=new Map(),pairs=[];
  for(const e of events.filter(e=>e.name==='PipelineReporter')){
    const key=[e.pid,e.name,e.id2?.local||e.id2?.global||e.id].join(':');const stack=stacks.get(key)||[];
    if(e.ph==='b')stack.push(e);
    else if(e.ph==='e'&&stack.length){const begin=stack.pop();pairs.push({begin,end:e,reporter:begin.args.frame_reporter||begin.args.chrome_frame_reporter});}
    stacks.set(key,stack);
  }
  return pairs;
}
function backendPath(root, id, ancestors=[]) {
  if(root.backendNodeId===id)return [...ancestors,root];
  for(const child of [...(root.children||[]),...(root.shadowRoots||[]),...(root.contentDocument?[root.contentDocument]:[])]){const found=backendPath(child,id,[...ancestors,root]);if(found)return found;}
  return null;
}
// Exact original MAIN update -> submitted compositor draw association. This is
// not a PARTIAL fallback: the original same-renderer reporter must be ALL.
export function mainUpdateDrawProof(events,pair,screen,input,draw,activation,beginFrame,commit,metadata,traceTimestampContract) {
  if(!metadata?.revision?.startsWith(ROOT_SPACE_REVISION+'-'))return null;
  if(!assessTraceTimestampContract(metadata,traceTimestampContract).valid)return null;
  const one=items=>items.length===1?items[0]:null;
  const id=value=>typeof value==='string'&&/^-?\d+$/.test(value)?value:Number.isSafeInteger(value)?String(value):null;
  const sameId=(a,b)=>id(a)!==null&&id(a)===id(b);
  const within=(time,event)=>Number.isFinite(event.dur)&&time>=event.ts&&time<=event.ts+event.dur;
  const report=pair.reporter;
  if(report.state!=='STATE_PRESENTED_ALL'||report.has_missing_content||report.frame_type!==undefined&&report.frame_type!=='MAIN'||pair.begin.pid!==input.pid||report.layer_tree_host_id!==draw.args.layerTreeId||report.frame_sequence>=screen.args.frame_sequence)return null;
  const track=pair.begin.id2?.local||pair.begin.id2?.global||pair.begin.id;
  const originalReports=events.filter(e=>{const r=e.args.frame_reporter||e.args.chrome_frame_reporter;return e.name==='PipelineReporter'&&e.ph==='b'&&e.pid===input.pid&&r?.frame_sequence===report.frame_sequence&&r.frame_source===report.frame_source&&r.layer_tree_host_id===report.layer_tree_host_id&&(r.frame_type===undefined||r.frame_type==='MAIN');});
  const originalEnds=events.filter(e=>e.name==='PipelineReporter'&&e.ph==='e'&&e.pid===input.pid&&e.tid===pair.begin.tid&&(e.id2?.local||e.id2?.global||e.id)===track&&e.ts>=pair.begin.ts&&e.ts<=pair.end.ts);
  if(track===undefined||one(originalReports)!==pair.begin||one(originalEnds)!==pair.end)return null;
  const mainDraw=one(events.filter(e=>e.name==='MainFrame.Draw'&&e.ph==='X'&&e.pid===input.pid&&e.tid===draw.tid&&e.args.main_frame_pipeline?.step==='DRAW'&&e.args.main_frame_pipeline.last_begin_frame_id_during_first_draw?.sequence_number===screen.args.frame_sequence&&e.args.main_frame_pipeline.last_begin_frame_id_during_first_draw?.source_id===screen.args.source_id));
  if(!mainDraw||!within(draw.ts,mainDraw))return null;
  const mainId=mainDraw.args.main_frame_pipeline.main_frame_id;if(!id(mainId)||id(mainId)==='0')return null;
  const step=(name,thread)=>one(events.filter(e=>['I','X'].includes(e.ph)&&e.pid===input.pid&&e.tid===thread&&e.args.main_frame_pipeline?.step===name&&sameId(e.args.main_frame_pipeline.main_frame_id,mainId)));
  const send=step('SEND_BEGIN_MAIN_FRAME',draw.tid),begin=step('BEGIN_MAIN_FRAME',input.tid),commitMain=step('COMMIT_ON_MAIN',input.tid),commitImpl=step('COMMIT_ON_IMPL',draw.tid),complete=step('COMMIT_COMPLETE',draw.tid),ready=step('READY_TO_ACTIVATE',draw.tid),activate=step('ACTIVATE',draw.tid);
  if(!send||!begin||!commitMain||!commitImpl||!complete||!ready||!activate)return null;
  if(send.args.main_frame_pipeline.begin_frame_id?.sequence_number!==report.frame_sequence||begin.args.begin_frame_id!==report.frame_sequence||send.args.main_frame_pipeline.begin_frame_id?.source_id!==screen.args.source_id||commit.args.frameSeqId!==report.frame_sequence||!within(beginFrame.ts,begin)||!within(commit.ts,begin)||!within(commitMain.ts,commit)||!within(commitImpl.ts,commit)||!within(complete.ts,commit)||!within(activation.ts,activate))return null;
  if(!(send.ts<=begin.ts&&begin.ts<commitMain.ts&&commitMain.ts<=commitImpl.ts&&commitImpl.ts<complete.ts&&complete.ts<ready.ts&&ready.ts<=activate.ts&&activate.ts<mainDraw.ts))return null;
  const flow=(from,to,name)=>{
    const starts=events.filter(e=>e.ph==='s'&&e.name===name&&e.pid===from.pid&&e.tid===from.tid&&e.ts===from.ts);
    const matches=starts.flatMap(start=>{const linked=events.filter(e=>['s','t','f'].includes(e.ph)&&e.name===start.name&&e.cat===start.cat&&sameId(e.id,start.id));const end=linked.find(e=>e.ph==='f'&&e.pid===to.pid&&e.tid===to.tid&&e.ts===to.ts);return linked.length===2&&end&&linked.filter(e=>e.ph==='s').length===1?[{start,end}]:[];});
    return one(matches);
  };
  const mainFlows=[flow(send,begin,'SendBeginMainFrame'),flow(complete,ready,'LayerTreeHostImpl::CommitComplete'),flow(ready,activate,'ProxyImpl::ReadyToActivate'),flow(activate,mainDraw,'LayerTreeHostImpl::ActivateSyncTree')];
  if(mainFlows.some(v=>!v))return null;
  const graphics=events.filter(e=>e.name==='Graphics.Pipeline'&&e.ph==='X'&&e.args.chrome_graphics_pipeline);
  const receiveBegin=one(graphics.filter(e=>e.pid===input.pid&&e.tid===draw.tid&&e.args.chrome_graphics_pipeline.step==='STEP_RECEIVE_BEGIN_FRAME'&&e.args.chrome_graphics_pipeline.frame_sequence===screen.args.frame_sequence));
  if(!receiveBegin)return null;const surface=receiveBegin.args.chrome_graphics_pipeline.surface_frame_trace_id;if(!id(surface))return null;
  const graphic=step=>one(graphics.filter(e=>e.args.chrome_graphics_pipeline.step===step&&sameId(e.args.chrome_graphics_pipeline.surface_frame_trace_id,surface)));
  const generate=graphic('STEP_GENERATE_COMPOSITOR_FRAME'),submit=graphic('STEP_SUBMIT_COMPOSITOR_FRAME'),receive=graphic('STEP_RECEIVE_COMPOSITOR_FRAME');
  if(!generate||!submit||!receive||generate.pid!==input.pid||submit.pid!==input.pid||generate.tid!==draw.tid||submit.tid!==draw.tid||receive.pid===input.pid||!within(generate.ts,mainDraw)||!within(submit.ts,generate)||!within(draw.ts,mainDraw)||!(receiveBegin.ts<=generate.ts&&submit.ts<receive.ts))return null;
  const sink=receive.args.chrome_graphics_pipeline.frame_sink_id;if(!sink||!Number.isSafeInteger(sink.frame_sink_client_id)||!Number.isSafeInteger(sink.frame_sink_id)||sink.frame_sink_client_id<=0||sink.frame_sink_id<=0)return null;
  const aggregate=one(graphics.filter(e=>e.pid===receive.pid&&e.tid===receive.tid&&e.args.chrome_graphics_pipeline.step==='STEP_SURFACE_AGGREGATION'&&sameId(e.args.chrome_graphics_pipeline.display_trace_id,report.display_trace_id)&&Array.isArray(e.args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids)&&e.args.chrome_graphics_pipeline.aggregated_surface_frame_trace_ids.filter(v=>sameId(v,surface)).length===1));
  if(!aggregate||aggregate.ts<receive.ts||aggregate.ts>=pair.end.ts)return null;
  const graphicsFlows=[flow(receiveBegin,generate,'Graphics.Pipeline'),flow(generate,submit,'Graphics.Pipeline'),flow(submit,receive,'Graphics.Pipeline'),flow(receive,aggregate,'Graphics.Pipeline')];
  if(graphicsFlows.some(v=>!v))return null;
  const originalReceive=one(graphics.filter(e=>e.pid===input.pid&&e.tid===draw.tid&&e.args.chrome_graphics_pipeline.step==='STEP_RECEIVE_BEGIN_FRAME'&&e.args.chrome_graphics_pipeline.frame_sequence===report.frame_sequence&&sameId(e.args.chrome_graphics_pipeline.surface_frame_trace_id,report.surface_frame_trace_id)));
  if(!originalReceive||originalReceive.ts>send.ts||originalReceive.ts<pair.begin.ts)return null;
  const stage=name=>{
    const rows=events.filter(e=>e.name===name&&e.pid===input.pid&&e.tid===pair.begin.tid&&(e.id2?.local||e.id2?.global||e.id)===track&&e.ts>=pair.begin.ts&&e.ts<=pair.end.ts&&['b','e'].includes(e.ph));
    const start=one(rows.filter(e=>e.ph==='b')),end=one(rows.filter(e=>e.ph==='e'));return start&&end&&start.ts<=end.ts?{start,end}:null;
  };
  const commitStage=stage('Commit'),endCommit=stage('EndCommitToActivation'),activationStage=stage('Activation'),submissionStage=stage('SubmitCompositorFrameToPresentationCompositorFrame'),endActivate=stage('EndActivateToSubmitCompositorFrame');
  if(!commitStage||!endCommit||!activationStage||!submissionStage||!endActivate)return null;
  const scopes=[commit,commitMain,commitImpl,activate,mainDraw,generate];
  const stages=[commitStage,endCommit,activationStage,endActivate,submissionStage];
  if(scopes.some(e=>!Number.isSafeInteger(e.ts)||!Number.isSafeInteger(e.dur)||e.dur<0||!Number.isSafeInteger(e.ts+e.dur))||[complete,ready].some(e=>!Number.isSafeInteger(e.ts))||stages.some(s=>!Number.isSafeInteger(s.start.ts)||!Number.isSafeInteger(s.end.ts)))return null;
  // Pinned Scheduler calls WillCommit/WillActivate before the client scopes,
  // and DidCommit/DidActivate after them. Serialized START enclosure uses only
  // the pinned precision predicate; END containment and exact neighbors stay
  // strict, with bookkeeping bounded by this same update's causal neighbors.
  const commitLower=Math.max(commit.ts,commitMain.ts),commitUpper=Math.min(commit.ts+commit.dur,complete.ts);
  if(!(commitLower<=commitStage.start.ts&&reporterStageStartCompatible(commitStage.start.ts,commitImpl.ts,metadata,traceTimestampContract)&&commitImpl.ts+commitImpl.dur<=commitStage.end.ts&&commitStage.end.ts<=commitUpper&&commitStage.start.ts<commitStage.end.ts&&ready.ts<=activationStage.start.ts&&reporterStageStartCompatible(activationStage.start.ts,activate.ts,metadata,traceTimestampContract)&&activate.ts+activate.dur<=activationStage.end.ts&&activationStage.end.ts<=mainDraw.ts&&activationStage.start.ts<activationStage.end.ts)||endCommit.start.ts!==commitStage.end.ts||endCommit.end.ts!==activationStage.start.ts||endActivate.start.ts!==activationStage.end.ts||endActivate.end.ts!==submissionStage.start.ts||!within(submissionStage.start.ts,generate)||submissionStage.start.ts>submit.ts||submissionStage.end.ts!==pair.end.ts)return null;
  const envelope=(kind,s,scope,lower,upper)=>({kind,precedingBoundTsUs:lower,followingBoundTsUs:upper,prefixUs:scope.ts-s.start.ts,suffixUs:s.end.ts-(scope.ts+scope.dur),startPrecision:assessTraceTimestampContract(metadata,traceTimestampContract)});
  return {kind:'exact-original-main-update-to-draw',revision:metadata.revision,mainFrameId:id(mainId),originalSequence:report.frame_sequence,drawSequence:screen.args.frame_sequence,frameSource:screen.args.source_id,surfaceFrameId:id(surface),displayId:id(report.display_trace_id),main:{send,begin,commitMain,commitImpl,complete,ready,activate,draw:mainDraw},mainFlows,graphics:{originalReceive,receiveBegin,generate,submit,receive,aggregate},graphicsFlows,reporterStages:{commit:commitStage,endCommit,activation:activationStage,endActivate,submission:submissionStage},sourceStageEnvelopes:{commit:envelope('same-main-commit-encloses-impl-scope',commitStage,commitImpl,commitLower,commitUpper),activation:envelope('same-main-ready-to-first-draw-encloses-activate-scope',activationStage,activate,ready.ts,mainDraw.ts)}};
}
function subtreeBackendIds(node) {
  return [node.backendNodeId,...(node.children||[]).flatMap(subtreeBackendIds),...(node.shadowRoots||[]).flatMap(subtreeBackendIds)];
}
export function deriveInputCoordinates(s) {
  const errors=[],fail=message=>errors.push(message),finite=value=>typeof value==='number'&&Number.isFinite(value);
  const r=s?.rect,c=s?.clientPoint,scroll=s?.scroll,v=s?.viewport,visual=s?.visual;
  if(!r||!c||!scroll||!v||!visual||![r.x,r.y,r.width,r.height,c.x,c.y,scroll.x,scroll.y,v.width,v.height,v.clientWidth,v.clientHeight,v.dpr,visual.width,visual.height,visual.offsetLeft,visual.offsetTop,visual.scale].every(finite))fail('Missing or nonfinite input geometry');
  if(errors.length)return {valid:false,errors};
  if(s.topFrame!==true||s.defaultRoot!==true||s.supportedStyles!==true||s.connected!==true||s.sameElement!==true)fail('Unsupported frame/root/styles or changed input element');
  if(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0)fail('Unsupported visual viewport scale/offset');
  if(r.width<=0||r.height<=0||v.width<=0||v.height<=0||v.clientWidth<=0||v.clientHeight<=0||v.dpr<=0||visual.width<=0||visual.height<=0||v.clientWidth>v.width||v.clientHeight>v.height||visual.width>v.width||visual.height>v.height)fail('Empty or inconsistent input bounds');
  const inside=p=>p.x>=r.x&&p.x<r.x+r.width&&p.y>=r.y&&p.y<r.y+r.height&&p.x>=0&&p.y>=0&&p.x<Math.min(v.width,v.clientWidth,visual.width)&&p.y<Math.min(v.height,v.clientHeight,visual.height);
  if(c.x!==r.x+r.width/2||c.y!==r.y+r.height/2||!inside(c)||s.nativeHit!==true)fail('Native client center is not inside visible expected input');
  const documentPoint={x:Math.round(c.x+scroll.x),y:Math.round(c.y+scroll.y)};
  const inverseClientPoint={x:documentPoint.x-scroll.x,y:documentPoint.y-scroll.y};
  if(!Number.isSafeInteger(documentPoint.x)||!Number.isSafeInteger(documentPoint.y)||documentPoint.x<-2147483648||documentPoint.x>2147483647||documentPoint.y<-2147483648||documentPoint.y>2147483647)fail('Unsafe CDP integer document point');
  if(!inside(inverseClientPoint)||s.integerHit!==true)fail('Rounded document point leaves expected visible input');
  return {valid:errors.length===0,errors,nativePoint:{...c},documentPoint,inverseClientPoint};
}
export function assessInputCoordinateProof(p) {
  const proof=p?.inputCoordinateProof,errors=[],fail=message=>errors.push(message);
  const expectedStages=['before-screenshot','after-screenshot','after-DOM-reads','after-CDP-hit','before-dispatch'];
  if(proof?.version!=='document-hit-client-input-v1'||!Array.isArray(proof.checkpoints)||proof.checkpoints.length!==expectedStages.length)return {valid:false,errors:['Missing mandatory versioned pre-input coordinate proof']};
  const first=proof.checkpoints[0],contract=deriveInputCoordinates(first);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const attrs=p.inputNode?.attributes||[],triggerIndex=attrs.indexOf('data-testid');
  if(typeof p.frame?.id!=='string'||!p.frame.id||p.frame.parentId||typeof p.frame.loaderId!=='string'||!p.frame.loaderId||!p.inputNode||triggerIndex<0||triggerIndex%2||attrs[triggerIndex+1]!==p.prepared?.trigger)fail('Missing exact top frame or captured input trigger');
  for(const [i,s] of proof.checkpoints.entries()){
    if(s.stage!==expectedStages[i]||!deriveInputCoordinates(s).valid)fail('Invalid pre-input geometry checkpoint');
    if(s.frameId!==p.frame?.id||s.loaderId!==p.frame?.loaderId||s.url!==p.frame?.url||s.trigger!==p.prepared?.trigger||!s.documentToken||s.documentToken!==first.documentToken||!Number.isFinite(s.timeOrigin)||s.timeOrigin!==first.timeOrigin||!Number.isFinite(s.at)||s.at<first.at||(i&&s.at<proof.checkpoints[i-1].at))fail('Pre-input frame/document/clock identity changed');
    for(const key of ['rect','clientPoint','scroll','viewport','visual'])if(!same(s[key],first[key]))fail(`Pre-input ${key} changed`);
  }
  if(!contract.valid||!same(proof.documentPoint,contract.documentPoint)||!same(proof.inverseClientPoint,contract.inverseClientPoint)||!same(p.clickPoint,contract.nativePoint))fail('Distinct document/native points are inconsistent');
  const ids=p.inputNode?subtreeBackendIds(p.inputNode):[];
  if(!Number.isSafeInteger(p.hitNode?.backendNodeId)||p.hitNode.backendNodeId<=0||!ids.includes(p.hitNode.backendNodeId)||p.hitNode.frameId!==p.frame?.id)fail('CDP hit is outside exact expected backend subtree/frame');
  return {valid:errors.length===0,errors};
}
async function captureInputGeometry(page,cdp,trigger,stage,initial=false) {
  const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame;
  const geometry=await page.evaluate(({trigger,initial})=>{
    const el=document.querySelector(`[data-testid="${trigger}"]`);
    if(initial){window.__caremateInputElement=el;window.__caremateInputDocumentToken=crypto.randomUUID();}
    if(!el)throw Error('Pre-input expected element missing');
    const r=el.getBoundingClientRect(),clientPoint={x:r.x+r.width/2,y:r.y+r.height/2},scroll={x:scrollX,y:scrollY};
    const integerClient={x:Math.round(clientPoint.x+scroll.x)-scroll.x,y:Math.round(clientPoint.y+scroll.y)-scroll.y};
    let supportedStyles=true;for(let node=el;node instanceof Element;node=node.parentElement){const style=getComputedStyle(node);if(style.transform!=='none'||!['1','normal'].includes(style.zoom))supportedStyles=false;}
    const vv=visualViewport;
    return {at:performance.now(),timeOrigin:performance.timeOrigin,documentToken:window.__caremateInputDocumentToken,url:location.href,trigger:el.getAttribute('data-testid'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},clientPoint,scroll,viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,dpr:devicePixelRatio},visual:vv?{width:vv.width,height:vv.height,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,scale:vv.scale}:null,topFrame:window===window.top,defaultRoot:document.scrollingElement===document.documentElement&&(!('rootScroller' in document)||document.rootScroller===document||document.rootScroller===document.documentElement),supportedStyles,connected:el.isConnected,sameElement:el===window.__caremateInputElement,nativeHit:el.contains(document.elementFromPoint(clientPoint.x,clientPoint.y)),integerHit:el.contains(document.elementFromPoint(integerClient.x,integerClient.y))};
  },{trigger,initial});
  return {...geometry,stage,frameId:frame.id,loaderId:frame.loaderId};
}
function quadContains(quad, rect) {
  if(!Array.isArray(quad)||quad.length!==8)return false;
  const [x,y,right,y2,right2,bottom,x2,bottom2]=quad;
  return x===x2&&y===y2&&right===right2&&bottom===bottom2&&rect.x>=x&&rect.y>=y&&rect.right<=right&&rect.bottom<=bottom;
}
export function assessEndpointEpoch(observation) {
  const feedback=observation.feedback,checks=observation.endpointLifecycle?.checks;
  if(observation.endpointLifecycle?.version!==1||!feedback?.textRects?.length||!feedback.textRects.every(r=>['x','y','width','height','right','bottom'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0)||!Number.isFinite(feedback.markStart)||!Array.isArray(checks)||!checks.length)return {valid:false};
  let previous=-Infinity,verifiedThroughMs=feedback.at,closedAtMs=null,closeReason=null;
  for(const c of checks){
    if(!Number.isFinite(c.at)||c.at<previous||c.at<feedback.at)return {valid:false};previous=c.at;
    if(c.reason==='expected-route-unmount'){
      if(!observation.navigationPath||c.path!==observation.navigationPath||c.connected!==false||c.matched!==false||!feedback.preInputIdentityMatched)return {valid:false};
      if(closedAtMs===null){closedAtMs=c.at;closeReason=c.reason;}continue;
    }
    const reason=!c.same?'identity-change':!c.textUnchanged?'text-change':!c.viewportStable?'viewport-change':!c.scrollStable?'scroll-change':!c.current?.visible?'hidden':!c.current?.hit?'occluded':!c.current?.supported?'unsupported-style-or-clip':!c.current.textRects?.length?'empty-range':!c.rangeStable||!c.ancestorGeometryStable?'semantic-geometry-change':null;
    if(reason){if(closedAtMs===null){closedAtMs=c.at;closeReason=reason;}continue;}
    if(closedAtMs===null)verifiedThroughMs=c.at;
  }
  return {valid:verifiedThroughMs>feedback.at,startMs:feedback.markStart,verifiedThroughMs,closedAtMs,closeReason};
}
export function endpointFrameWithinEpoch(observation,readyTsUs,paintTsUs,presentationTsUs,screenshotTsUs) {
  const epoch=assessEndpointEpoch(observation),offset=readyTsUs-observation.feedback?.markStart*1000;
  return epoch.valid&&[offset,paintTsUs,presentationTsUs,screenshotTsUs].every(Number.isFinite)&&paintTsUs>offset+epoch.startMs*1000&&Math.max(presentationTsUs,screenshotTsUs)<offset+epoch.verifiedThroughMs*1000;
}
export function pendingIdentityMatches(provenance) {
  const binding=provenance.pendingIdentity;
  return !!(binding&&provenance.inputNode&&binding.backendNodeId===provenance.feedbackNode?.backendNodeId&&binding.connected&&binding.selectorMatches&&provenance.observation.feedback?.preInputIdentityMatched&&subtreeBackendIds(provenance.inputNode).includes(binding.backendNodeId));
}
const ROOT_SPACE_REVISION='971a7443b0c9b0a9b2860529b33331b76077ec62';
// Only serialized float error, in device pixels; never CSS padding/antialias slack.
const ROOT_SPACE_EPSILON=1e-4;
export function rootLayerCoordinates(layer, projected, paintClip, metadata) {
  const reject=reason=>({valid:false,reason});
  if(!metadata?.revision?.startsWith(ROOT_SPACE_REVISION+'-'))return reject('unknown Chromium coordinate serialization revision');
  const {width:w,height:h}=layer.bounds||{};
  if(![w,h].every(v=>Number.isFinite(v)&&v>0))return reject('missing positive layer bounds');
  const unit=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const omitted=layer.screen_space_transform===undefined;
  const matrix=omitted?unit:layer.screen_space_transform;
  if(!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite)||matrix.some((v,i)=>i!==3&&i!==7&&v!==unit[i]))return reject('unsupported non-unit/axis-aligned transform');
  if(JSON.stringify(layer.position)!=='[0,0]'||layer.geometry_contents_scale!==1||JSON.stringify(layer.raster_scales?.contents_scale)!=='[1,1]'||layer.raster_scales?.device_scale!==1||layer.raster_scales?.page_scale!==1||JSON.stringify(layer.raster_scales?.source_scale)!=='[1,1]')return reject('root origin or unit recording/raster scale unproven');
  const tx=matrix[3],ty=matrix[7],quad=[tx,ty,tx+w,ty,tx+w,ty+h,tx,ty+h];
  if(!Array.isArray(layer.layer_quad)||layer.layer_quad.length!==8||!layer.layer_quad.every((v,i)=>Number.isFinite(v)&&Math.abs(v-quad[i])<=ROOT_SPACE_EPSILON))return reject('transform/bounds/quad disagree');
  // PaintTimelineReporter emits the root PaintLayer-local contents cull rect.
  // This bounded adapter supports a positive zero-origin rectangular local
  // cull within the proven RootScroller bounds; the cull need not equal them.
  if(!Array.isArray(paintClip)||paintClip.length!==8||!paintClip.every(v=>Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER))return reject('root Paint clip coordinate extent unproven');
  const localClip={x:paintClip[0],y:paintClip[1],right:paintClip[2],bottom:paintClip[5]};
  const clipQuad=[0,0,localClip.right,0,localClip.right,localClip.bottom,0,localClip.bottom];
  if(localClip.right<=0||localClip.bottom<=0||!paintClip.every((v,i)=>Math.abs(v-clipQuad[i])<=ROOT_SPACE_EPSILON))return reject('root Paint clip coordinate extent unproven');
  if(!['x','y','right','bottom'].every(k=>Number.isFinite(projected[k]))||projected.right<=projected.x||projected.bottom<=projected.y)return reject('invalid projected glyph extent');
  const local={x:projected.x-tx,y:projected.y-ty,right:projected.right-tx,bottom:projected.bottom-ty};
  const contains=(r,t)=>t.x>=r.x-ROOT_SPACE_EPSILON&&t.y>=r.y-ROOT_SPACE_EPSILON&&t.right<=r.right+ROOT_SPACE_EPSILON&&t.bottom<=r.bottom+ROOT_SPACE_EPSILON;
  const localBounds={x:0,y:0,right:w,bottom:h};
  if(!contains(localBounds,localClip))return reject('root local Paint cull outside proven layer bounds');
  if(!contains(localBounds,local))return reject('glyph outside proven root local clip/bounds');
  if(!contains(localClip,local))return reject('glyph outside proven root local Paint cull');
  if(!Array.isArray(layer.invalidation)||!layer.invalidation.length||layer.invalidation.length%4||!layer.invalidation.every(Number.isFinite))return reject('invalid layer-local invalidation');
  const invalidations=[];for(let i=0;i<layer.invalidation.length;i+=4){const [x,y,width,height]=layer.invalidation.slice(i,i+4);if(width<=0||height<=0)return reject('nonpositive invalidation');invalidations.push({x,y,right:x+width,bottom:y+height});}
  if(!invalidations.some(r=>contains(r,local)))return reject('layer-local invalidation does not contain complete glyph');
  return {valid:true,kind:omitted?'source-defined-identity-omission':'explicit-unit-translation',revision:metadata.revision,matrix,translation:{x:tx,y:ty},localGlyph:local,localClip,localBounds,localCoverage:{clipContainsGlyph:true,boundsContainGlyph:true,clipContainedInBounds:true},localInvalidations:invalidations,paintClipSpace:'root PaintLayer-local zero-origin rectangular contents cull within RootScroller bounds; complete glyph in both; unit recording/raster scales',epsilonDevicePixels:ROOT_SPACE_EPSILON};
}
function rootPaintAttribution(events, paint, beginFrame, activation, draw, provenance, metadata, rejections) {
  const endpoint=provenance.observation.feedback;
  const ancestor=provenance.feedbackPath?.find(n=>n.backendNodeId===paint.args.data.nodeId);
  if(!ancestor||ancestor.nodeName!=='#document'||!(provenance.observation.endpointLifecycle?assessEndpointEpoch(provenance.observation).valid:provenance.observation.endpointIntegrity?.valid)){rejections.push('unsupported ancestor or endpoint epoch');return null;}
  const snapshots=events.filter(e=>e.name==='LayerTreeHostImpl:snapshot'&&e.pid===paint.pid&&e.ts>=activation.ts&&e.ts<=draw.ts&&e.args.snapshot?.active_tree?.source_frame_number===beginFrame.args.data.frameId);
  for(const snapshot of snapshots){
    const value=snapshot.args.snapshot,viewport=value.device_viewport_size,css=provenance.observation.viewport;
    const sx=viewport.width/css.width,sy=viewport.height/css.height;
    if(!Number.isFinite(sx)||sx<=0||Math.abs(sx-sy)>.001)continue;
    const projected={x:endpoint.rect.x*sx,y:endpoint.rect.y*sy,right:endpoint.rect.right*sx,bottom:endpoint.rect.bottom*sy};
    const layers=value.active_tree.layers;
    for(const layer of layers.filter(l=>l.owner_node===ancestor.backendNodeId&&l.draws_content===1&&l.opacity===1&&l.compositing_reason_ids?.includes('RootScroller'))){
      const coordinates=rootLayerCoordinates(layer,projected,paint.args.data.clip,metadata);
      if(!coordinates.valid){rejections.push(coordinates.reason);continue;}
      if(!quadContains(layer.layer_quad,projected)||!quadContains([0,0,viewport.width,0,viewport.width,viewport.height,0,viewport.height],projected)){rejections.push('glyph outside screen layer/viewport');continue;}
      const covering=layers.filter(l=>l!==layer&&l.draws_content===1&&l.opacity>0&&l.layer_quad&&Math.min(...l.layer_quad.filter((_,i)=>i%2===0))<projected.right&&Math.max(...l.layer_quad.filter((_,i)=>i%2===0))>projected.x&&Math.min(...l.layer_quad.filter((_,i)=>i%2===1))<projected.bottom&&Math.max(...l.layer_quad.filter((_,i)=>i%2===1))>projected.y);
      if(covering.length){rejections.push('covering drawn layer');continue;}
      return {kind:'guarded-document-ancestor',snapshotTsUs:snapshot.ts,activeSourceFrame:value.active_tree.source_frame_number,viewport,cssViewport:css,scale:{x:sx,y:sy},projected,coordinates,ancestor,layer:{ownerNode:layer.owner_node,pictureLayerId:layer.layer_id,quad:layer.layer_quad,opacity:layer.opacity,drawsContent:layer.draws_content,invalidation:layer.invalidation},paintClip:paint.args.data.clip,coveringLayers:[]};
    }
  }
  return null;
}
function compareFeedbackPixels(frame, before, after, rect, viewport) {
  const decoded=jpeg.decode(frame,{useTArray:true});const sample=(image,x,y)=>{const px=Math.min(image.width-1,Math.max(0,Math.floor(x/viewport.width*image.width))),py=Math.min(image.height-1,Math.max(0,Math.floor(y/viewport.height*image.height)));const i=(py*image.width+px)*4;return [image.data[i],image.data[i+1],image.data[i+2]];};
  let toBefore=0,toAfter=0,referenceDelta=0,count=0;
  const left=Math.max(0,rect.x),top=Math.max(0,rect.y),right=Math.min(viewport.width,rect.right),bottom=Math.min(viewport.height,rect.bottom);
  for(let y=top+1;y<bottom-1;y+=2)for(let x=left+1;x<right-1;x+=2){const f=sample(decoded,x,y),b=sample(before,x,y),a=sample(after,x,y);for(let c=0;c<3;c++){toBefore+=Math.abs(f[c]-b[c]);toAfter+=Math.abs(f[c]-a[c]);referenceDelta+=Math.abs(a[c]-b[c]);count++;}}
  const result={width:decoded.width,height:decoded.height,scaleX:decoded.width/viewport.width,scaleY:decoded.height/viewport.height,sampledChannels:count,meanErrorToBefore:toBefore/count,meanErrorToAfter:toAfter/count,referenceMeanChange:referenceDelta/count};
  // A reference match alone can accept unchanged backgrounds. Require a
  // discriminating before/after change in the exact semantic endpoint region.
  return {...result,accepted:count>30&&result.referenceMeanChange>2&&result.meanErrorToAfter<18&&result.meanErrorToBefore>result.meanErrorToAfter*1.5+1};
}
export function correlateAction(events, p, beforeJpeg, afterJpeg, metadata) {
  const inputIds=p.inputNode?subtreeBackendIds(p.inputNode):[];
  const matchingInputs=events.filter(e=>e.name==='EventTiming'&&e.ph==='b'&&e.args.data?.type==='pointerdown'&&inputIds.includes(e.args.data.nodeId)&&e.args.data.frame===p.frame.id&&e.args.data.interactionId>0);
  const input=matchingInputs.length===1?matchingInputs[0]:null;
  const ready=events.find(e=>e.name==='caremate-action-feedback-dom');
  const errors=[];const browserInput=p.observation.input;
  if(!assessTraceTimestampContract(metadata,p.traceTimestampContract).valid)errors.push('Pinned prospective trace timestamp/config contract missing or unsupported');
  const coordinateProof=assessInputCoordinateProof(p);if(!coordinateProof.valid)errors.push(...coordinateProof.errors);
  if(!input||!browserInput?.isTrusted||!browserInput.expectedElementContainsTarget||browserInput.trigger!==p.prepared.trigger||Math.abs(browserInput.eventTimeStamp-input.args.data.timeStamp)>.2)errors.push('Trusted captured target subtree EventTiming input clock/identity missing');
  const endpoint=p.observation.feedback;
  if(!ready||!endpoint?.visible||!endpoint?.hit||endpoint.text===p.prepared.before)errors.push('Changed semantic endpoint is not visibly hit-testable');
  if(p.prepared.expectedText&&endpoint?.text!==p.prepared.expectedText)errors.push('Feedback differs from exact authored meaning/locale');
  if(p.prepared.navigation&&p.observation.endpointLifecycle&&!pendingIdentityMatches(p))errors.push('Pending endpoint pre-input identity is unproven');
  const epoch=p.observation.endpointLifecycle?assessEndpointEpoch(p.observation):null;
  if(!(epoch?epoch.valid:p.observation.endpointIntegrity?.valid))errors.push('Endpoint identity/geometry/visibility continuity is unproven');
  const before=jpeg.decode(beforeJpeg,{useTArray:true}),after=jpeg.decode(afterJpeg,{useTArray:true});
  const pairs=pairPipelineReporters(events),candidates=[];
  const paints=events.filter(e=>e.name==='Paint'&&p.feedbackPath?.some(n=>n.backendNodeId===e.args.data?.nodeId)&&e.args.data.frame===p.frame.id&&e.pid===input?.pid&&e.tid===input?.tid&&e.ts>=ready?.ts);
  for(const screen of events.filter(e=>e.name==='Screenshot')){
    const pixels=p.prepared.navigation&&p.observation.endpointLifecycle?{accepted:false,referenceComparable:false,reason:'Transient pending feedback has no settled destination reference; explicit exact-frame semantic review is mandatory.'}:compareFeedbackPixels(Buffer.from(screen.args.snapshot,'base64'),before,after,endpoint?.rect||{},p.observation.viewport);
    let correlation=null;const paintAttempts=[];
    for(const pair of pairs.filter(v=>v.reporter?.frame_sequence<=screen.args.frame_sequence&&v.reporter?.frame_source===screen.args.source_id&&v.reporter?.state==='STATE_PRESENTED_ALL'&&!v.reporter.has_missing_content&&v.begin.pid===input?.pid)){
      const draw=events.find(e=>e.name==='DrawFrame'&&e.pid===input.pid&&e.args.frameSeqId===screen.args.frame_sequence&&e.args.layerTreeId===pair.reporter.layer_tree_host_id);if(!draw)continue;
      const activation=events.filter(e=>e.name==='ActivateLayerTree'&&e.pid===input.pid&&e.args.layerTreeId===draw.args.layerTreeId&&e.ts<=draw.ts).at(-1);if(!activation||pair.end.ts<draw.ts)continue;
      const beginFrame=events.filter(e=>e.name==='BeginMainThreadFrame'&&e.pid===input.pid&&e.tid===input.tid&&e.args.layerTreeId===draw.args.layerTreeId&&e.args.data.frameId===activation.args.frameId&&e.ts<=activation.ts).at(-1);if(!beginFrame)continue;
      const commit=events.filter(e=>e.name==='Commit'&&e.pid===input.pid&&e.tid===input.tid&&e.args.layerTreeId===draw.args.layerTreeId&&e.ts>=beginFrame.ts&&e.ts+(e.dur||0)<=activation.ts).at(-1);if(!commit)continue;
      const mainUpdateMapping=pair.reporter.frame_sequence===screen.args.frame_sequence?null:mainUpdateDrawProof(events,pair,screen,input,draw,activation,beginFrame,commit,metadata,p.traceTimestampContract);
      if(pair.reporter.frame_sequence!==screen.args.frame_sequence&&!mainUpdateMapping)continue;
      for(const paint of paints.filter(e=>e.ts>=beginFrame.ts&&e.ts+(e.dur||0)<=commit.ts).reverse()){
      const reasons=[];
      const attribution=paint.args.data.nodeId===p.feedbackNode.backendNodeId?{kind:'exact-node',backendNodeId:p.feedbackNode.backendNodeId}:rootPaintAttribution(events,paint,beginFrame,activation,draw,p,metadata,reasons);
      const attempt={paintTsUs:paint.ts,backendNodeId:paint.args.data.nodeId,sourceFrame:beginFrame.args.data.frameId,commitTsUs:commit.ts,selected:false,reasons};paintAttempts.push(attempt);
      if(!attribution){if(!reasons.length)reasons.push('no eligible active root snapshot/layer');continue;}
      if(epoch){
        // A later positive observation bounds the proof; a removal callback is
        // not evidence that pixels stayed valid until that callback ran.
        if(!endpointFrameWithinEpoch(p.observation,ready.ts,paint.ts,pair.end.ts,screen.ts)){reasons.push('presentation/screenshot outside positive endpoint epoch');continue;}
      }
      attempt.selected=true;correlation={paint,beginFrame,commit,activation,draw,attribution,pipelineBegin:pair.begin,pipelineEnd:pair.end,presentationTsUs:pair.end.ts,...(mainUpdateMapping?{mainUpdateMapping}:{})};break;
      }
      if(correlation)break;
    }
    candidates.push({frameSequence:screen.args.frame_sequence,frameSource:screen.args.source_id,screenshotTsUs:screen.ts,pixels,correlation,paintAttempts,eligibleForVisualReview:!!correlation&&!errors.length,pixelCandidate:!!correlation&&pixels.accepted&&!errors.length});
  }
  const first=candidates.filter(c=>c.eligibleForVisualReview).sort((a,b)=>a.correlation.presentationTsUs-b.correlation.presentationTsUs||a.screenshotTsUs-b.screenshotTsUs)[0]||null;
  if(!first)errors.push('No complete endpoint Paint/frame/activation/presentation/visual chain');
  const eventEnd=input&&events.find(e=>e.name==='EventTiming'&&e.ph==='e'&&e.pid===input.pid&&e.id===input.id&&e.ts>=input.ts);
  return {valid:!errors.length,errors,input,ready,candidates,first,...(epoch?{endpointEpoch:epoch}:{}),visualReviewRequired:true,candidateFeedbackLatencyMs:first?(first.correlation.presentationTsUs-input.ts)/1000:null,feedbackLatencyMs:null,separateInteractionNextPaintMs:eventEnd?(eventEnd.ts-input.ts)/1000:null,queueDelayMs:input?input.args.data.processingStart-input.args.data.timeStamp:null,presentationDefinition:'Chromium STATE_PRESENTED_ALL completion with guarded endpoint/ancestor Paint and exact frame screenshot. Candidate remains pending explicit semantic visual review; not physical monitor scan-out.'};
}
async function prepareAction(page, origin, action) {
  const click = id => page.getByTestId(id).click();
  const task = action === 'task-accept' || action === 'task-complete';
  const scenario = action.startsWith('navigate-')?'dizziness':task || action === 'aftervisit-save' ? 'after-visit' : action === 'brief-confirm' ? 'day-before-visit' : action === 'event-response' ? 'caregiver-alert' : 'routine-day';
  const seed = await seedScenario(page, origin, '/', scenario);
  let trigger, endpoint,expectedText,expected={},navigation=null;
  if(action.startsWith('checkin-')) {
    await page.goto(origin+'/check-in');await click('mood-okay');await click('checkin-next');await click('body-well');await click('checkin-next');await click('checkin-next');
    trigger=action;endpoint=action==='checkin-save'?selector('checkin-receipt')+' h1':selector('checkin-page')+' fieldset legend';expectedText=action==='checkin-save'?'已加入健康紀錄':'你現在的心情如何？';
  } else if(action==='dose-save'||action==='time-change') {
    await page.goto(origin+'/care');await click('care-task-amlo');
    if(action==='time-change'){await click('task-change');await page.getByLabel('提醒時間（香港時間）').fill('2026-09-16T20:15');trigger='reminder-save';endpoint=selector('task-receipt');expectedText='已更新本地事項 · 9月16日（星期三）下午8:15';expected={taskId:'task-amlo',at:'2026-09-16T20:15:00+08:00'};}
    else {trigger='dose-user_confirmed_taken';endpoint=selector('dose-status');expectedText='本人確認已服藥';expected={doseId:'dose-task-amlo',taskId:'task-amlo'};}
  } else if(action==='appointment-confirm') {
    await page.goto(origin+'/book');await click('slot-slot-17-1100');await click('book-review-open');trigger='book-confirm';endpoint=selector('book-receipt')+' h2';expectedText='已更新康伴內的本地行程';expected={appointmentId:'appt-gp',at:'2026-09-17T11:00:00+08:00'};
  } else if(action.startsWith('permission-')||task) {
    await page.goto(origin+'/sharing');await page.getByTestId('level-full').check();await page.getByTestId('category-body').check();await click('sharing-review');
    trigger='sharing-confirm';endpoint=selector('sharing-page')+' [role="status"]';expectedText='已更新分享設定';expected={recipientId:'david'};
    if(action==='permission-revoke'||task){await click('sharing-confirm');if(!task){await click('sharing-revoke');trigger='revoke-confirm';endpoint=selector('shared-empty');expectedText='尚未獲授權查看健康資料。';}}
    if(task){
      await click('nav-care-mobile');await page.locator('#aftervisit-text').fill('Fictional task timing: organise the question list.');await page.locator('#aftervisit-time').fill('2026-09-23T15:00');await click('aftervisit-preview');await page.locator('#aftervisit-category').selectOption('body');await page.locator('#aftervisit-owner').selectOption('david');await click('aftervisit-save');
      await page.getByTestId('aftervisit-receipt').getByRole('button',{name:'查看事項',exact:true}).click();await click('event-request');
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4')));const offered=before.events.at(-1);await page.goto(origin+'/dev');await click('perspective-david');const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4')));
      for(const key of ['healthRecords','tasks','events','grants'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Role boundary changed domain state');
      await page.goto(origin+'/');await click(`event-open-${offered.id}`);trigger='event-accept';endpoint=selector('event-status');expectedText='David願意接手；尚未完成';expected={eventId:offered.id,taskId:offered.taskId};
      if(action==='task-complete'){await click('event-accept');trigger='event-resolve';expectedText='已完成協助';}
    }
  } else if(action==='event-response') {
    await page.goto(origin+'/notifications');await click('event-open-event-fixture-attention');trigger='event-accept';endpoint=selector('event-status');expectedText='David願意接手；尚未完成';expected={eventId:'event-fixture-attention',taskId:'task-fixture-attention'};
  } else if(action==='brief-confirm') {
    await page.goto(origin+'/brief');trigger='brief-confirm';endpoint=selector('brief-status');expectedText='已確認';
  } else if(action==='aftervisit-save') {
    await page.goto(origin+'/care');await page.locator('#aftervisit-text').fill('Fictional task timing: organise the question list.');await page.locator('#aftervisit-time').fill('2026-09-23T15:00');await click('aftervisit-preview');trigger='aftervisit-save';endpoint=selector('aftervisit-receipt')+' > p:first-child';expectedText='已建立本人來源紀錄與本地事項。';expected={text:'Fictional task timing: organise the question list.',at:'2026-09-23T15:00:00+08:00'};
  } else if(action.startsWith('navigate-')){
    await page.goto(origin+'/ask');await page.getByTestId('ask-input').fill(action==='navigate-report'?'report':'心情低落');await click('ask-send');
    navigation={path:action==='navigate-report'?'/report':'/brief',kind:action==='navigate-report'?'report':'brief'};
    await page.waitForFunction(expected=>document.querySelector('[data-testid="assistant-next"]')?.getAttribute('href')===expected,navigation.path);
    trigger='assistant-next';endpoint=selector('assistant-navigation-pending');expectedText=action==='navigate-report'?'正在開啟血液化驗…':'正在開啟就診摘要…';
  } else throw Error(`Unknown action ${action}`);
  const control=page.getByTestId(trigger);await control.waitFor({state:'visible'});await control.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(300);
  const stateBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4')));
  if(action==='brief-confirm'){
    const appointment=stateBefore.appointments.find(a=>a.patientId==='may'&&a.status==='scheduled');
    const packet=stateBefore.briefs.filter(b=>b.appointmentId===appointment?.id&&b.patientId==='may'&&b.recipientId==='may').at(-1);
    if(!packet||packet.status!=='draft')throw Error('Current displayed personal packet is not a draft');
    expected={packetId:packet.id,appointmentId:appointment.id,packetBefore:packet};
  }
  const expectedActor=['event-response','task-accept','task-complete'].includes(action)?'david':'may';
  const expectedContext={actorId:expectedActor,patientId:'may',perspective:expectedActor==='may'?'patient':'caregiver'};
  const expectedClock=task||action==='aftervisit-save'?'2026-09-22T16:00:00+08:00':action==='brief-confirm'?'2026-09-21T08:45:00+08:00':'2026-09-16T08:45:00+08:00';
  if(JSON.stringify(stateBefore.context)!==JSON.stringify(expectedContext)||stateBefore.clock!==expectedClock)throw Error('Authored initial actor/patient/clock mismatch');
  return {action,seed,trigger,endpoint,expectedText,expected,expectedContext,expectedClock,navigation,before:!navigation&&await page.locator(endpoint).count()?await page.locator(endpoint).textContent():null,stateBefore};
}
export function validateActionOutcome(prepared, observation) {
  const {action,expected}=prepared,before=prepared.stateBefore,after=observation.stateAfter,errors=[];
  const require=(condition,message)=>{if(!condition)errors.push(message);};
  const actor=['event-response','task-accept','task-complete'].includes(action)?'david':'may';
  const authoredContext={actorId:actor,patientId:'may',perspective:actor==='may'?'patient':'caregiver'};
  const authoredClock=['task-accept','task-complete','aftervisit-save'].includes(action)?'2026-09-22T16:00:00+08:00':action==='brief-confirm'?'2026-09-21T08:45:00+08:00':'2026-09-16T08:45:00+08:00';
  require(JSON.stringify(before.context)===JSON.stringify(authoredContext)&&before.clock===authoredClock,'Initial state is not the authored actor/May patient/fixed clock');
  require(after?.schemaVersion===4&&JSON.stringify(after.context)===JSON.stringify(before.context)&&after.clock===before.clock,'Actor/patient/clock changed during action');
  require(observation.feedback?.text===prepared.expectedText,'Exact meaningful visible text differs from declared expected outcome');
  if(action==='checkin-save'||action==='checkin-edit'){
    const draft=before.drafts.find(d=>d.step==='review');require(!!draft,'Review draft absent');
    if(action==='checkin-save'){const saved=after.checkIns.filter(c=>c.draftId===draft?.id);require(saved.length===1&&saved[0].patientId==='may'&&saved[0].mood===draft.mood&&saved[0].body===draft.body&&saved[0].note===draft.note&&saved[0].occurredAt===draft.occurredAt&&saved[0].revision===1&&!after.drafts.some(d=>d.id===draft.id)&&after.checkIns.length===before.checkIns.length+1,'Exact saved check-in/draft transition failed');}
    else {const edited=after.drafts.find(d=>d.id===draft?.id);require(edited?.step==='mood'&&edited.mood===draft.mood&&edited.body===draft.body&&edited.note===draft.note&&JSON.stringify(before.checkIns)===JSON.stringify(after.checkIns),'Edit must return to same draft without saving');}
  }else if(action==='dose-save'){
    const dose=after.medicationDoses.find(d=>d.id===expected.doseId);require(dose?.status==='user_confirmed_taken'&&dose.patientId==='may'&&dose.source==='user'&&dose.revision===before.medicationDoses.find(d=>d.id===dose.id)?.revision+1,'Dose provenance/status/revision failed');
  }else if(action==='time-change'){
    const task=after.tasks.find(t=>t.id===expected.taskId);require(task?.scheduledAt===expected.at&&task.status==='scheduled'&&task.revision===before.tasks.find(t=>t.id===task.id)?.revision+1,'Exact reminder time/revision failed');
  }else if(action==='appointment-confirm'){
    const appointment=after.appointments.find(a=>a.id===expected.appointmentId);require(appointment?.scheduledAt===expected.at&&appointment.status==='scheduled'&&appointment.bookingStatus==='booked'&&appointment.revision===before.appointments.find(a=>a.id===appointment.id)?.revision+1,'Exact local appointment receipt state failed');
  }else if(action.startsWith('permission-')){
    const grant=after.grants.find(g=>g.recipientId===expected.recipientId),prior=before.grants.find(g=>g.recipientId===expected.recipientId);require(grant?.patientId==='may'&&grant.revision===(prior?.revision||0)+1&&grant.status===(action==='permission-confirm'?'active':'revoked'),'Consent status/revision failed');if(action==='permission-confirm')require(grant?.level==='full'&&JSON.stringify(grant.categories)===JSON.stringify(['body']),'Consent exact level/categories failed');
    require(JSON.stringify(before.healthRecords)===JSON.stringify(after.healthRecords),'Permission action changed original health records');
  }else if(['event-response','task-accept','task-complete'].includes(action)){
    const event=after.events.find(e=>e.id===expected.eventId),prior=before.events.find(e=>e.id===expected.eventId),task=after.tasks.find(t=>t.id===expected.taskId);
    const priorTask=before.tasks.find(t=>t.id===expected.taskId);
    require(event?.patientId==='may'&&prior?.patientId==='may'&&task?.patientId==='may'&&priorTask?.patientId==='may'&&event.taskId===expected.taskId&&prior.taskId===expected.taskId&&event.recipientId==='david'&&prior.recipientId==='david','Exact caregiver event/task/patient relationship failed');
    require(prior?.status===(action==='task-complete'?'acknowledged':'pending')&&priorTask?.ownerId===(action==='task-complete'?'david':'may'),'Expected pending/accepted task transition absent');
    require(event?.status===(action==='task-complete'?'resolved':'acknowledged')&&event.revision===prior?.revision+1&&task?.ownerId==='david','Event response/owner/revision failed');
    require(action==='task-complete'?task?.status==='completed':task?.status!=='completed','Acceptance/completion distinction failed');
  }else if(action==='brief-confirm'){
    const packet=after.briefs.find(b=>b.id===expected.packetId),prior=before.briefs.find(b=>b.id===expected.packetId);
    require(!!packet&&!!prior&&JSON.stringify(prior)===JSON.stringify(expected.packetBefore)&&prior.status==='draft'&&prior.confirmedAt===null&&packet.patientId==='may'&&packet.recipientId==='may'&&packet.appointmentId===expected.appointmentId&&packet.status==='confirmed'&&packet.confirmedAt===after.clock,'Exact displayed packet draft-to-confirmed transition failed');
    require(!!packet&&!!prior&&JSON.stringify(packet)===JSON.stringify({...prior,status:'confirmed',confirmedAt:after.clock,supplementsNeedReview:false}),'Packet content/version/fingerprint changed during confirmation');
  }else if(action==='aftervisit-save'){
    const added=after.tasks.filter(t=>!before.tasks.some(b=>b.id===t.id)),records=after.healthRecords.filter(r=>!before.healthRecords.some(b=>b.id===r.id));require(added.length===1&&records.length===1&&added[0].kind==='after-visit'&&added[0].ownerId==='may'&&added[0].proposedOwnerId===null&&added[0].scheduledAt===expected.at&&added[0].shareCategory==='private'&&added[0].sourceRecordIds.includes(records[0].id)&&records[0].source==='user'&&records[0].text.en===expected.text,'Authored private task/source/time/owner failed');
  }else if(action.startsWith('navigate-')){
    for(const key of ['episodes','healthRecords','checkIns','medicationDoses','tasks','grants','events','assistantSessions','reports'])require(JSON.stringify(before[key])===JSON.stringify(after[key]),`Navigation changed ${key}`);
    require(observation.destinationReady?.path===prepared.navigation.path,'Full destination semantic DOM readiness missing');
  }else errors.push(`No semantic validator for ${action}`);
  return errors;
}
async function measureAction(origin, action, iteration, output) {
  const id=`action-${action}-${iteration}`,dir=path.join(output,id);await fs.mkdir(dir);
  const manifest=[],network=[],cdpNetwork=[],forbidden=[],errors=[];let context,cdp,page,traceStarted=false,traceRaw;
  try{
    context=await chromium.launchPersistentContext(await fs.mkdtemp(path.join(os.tmpdir(),id)),{headless:false,executablePath:chromium.executablePath(),viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
    page=context.pages()[0];page.setDefaultTimeout(10000);await page.bringToFront();
    context.on('request',r=>{const entry={url:r.url(),method:r.method()};network.push(entry);if(new URL(r.url()).origin!==origin||/\/api(?:\/|$)/.test(new URL(r.url()).pathname)||!['GET','HEAD'].includes(r.method()))forbidden.push(entry);});
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('websocket',s=>forbidden.push({type:'websocket',url:s.url()}));context.on('serviceworker',w=>forbidden.push({type:'serviceworker',url:w.url()}));
    cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
    for(const method of ['requestWillBeSent','requestWillBeSentExtraInfo','responseReceived','responseReceivedExtraInfo','requestServedFromCache','loadingFinished','loadingFailed'])cdp.on(`Network.${method}`,params=>cdpNetwork.push({method:`Network.${method}`,params}));
    const prepared=await prepareAction(page,origin,action);await saveRaw(dir,'setup.json',{prepared,browser:context.browser().version(),viewport:{width:390,height:844},cpu:4,latencyMs:150,downloadBytesPerSecond:200000,uploadBytesPerSecond:93750},manifest);
    if(prepared.navigation){
      const prior=network.filter(r=>new URL(r.url).pathname===prepared.navigation.path);
      if(prior.length)throw Error(`Destination was requested before activation: ${JSON.stringify(prior)}`);
      await cdp.send('Network.clearBrowserCache');
    }
    await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await cdp.send('DOM.enable');
    const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame;
    const inputCheckpoints=[await captureInputGeometry(page,cdp,prepared.trigger,'before-screenshot',true)];
    const coordinates=deriveInputCoordinates(inputCheckpoints[0]);if(!coordinates.valid)throw Error(coordinates.errors.join('; '));
    const clickPoint=coordinates.nativePoint;
    const beforeJpeg=await page.screenshot({type:'jpeg',quality:90});await saveRaw(dir,'before.jpg',beforeJpeg,manifest);
    inputCheckpoints.push(await captureInputGeometry(page,cdp,prepared.trigger,'after-screenshot'));
    const inputDocument=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const inputSelected=await cdp.send('DOM.querySelector',{nodeId:inputDocument.root.nodeId,selector:selector(prepared.trigger)});
    const inputNode=(await cdp.send('DOM.describeNode',{nodeId:inputSelected.nodeId,depth:-1,pierce:true})).node;
    const inputPath=backendPath(inputDocument.root,inputNode.backendNodeId)?.map(n=>({nodeId:n.nodeId,backendNodeId:n.backendNodeId,nodeName:n.nodeName,attributes:n.attributes}));
    let pendingNode=null,pendingPath=null,pendingIdentity=null;
    if(prepared.navigation){
      const selected=await cdp.send('DOM.querySelector',{nodeId:inputDocument.root.nodeId,selector:prepared.endpoint});
      pendingNode=(await cdp.send('DOM.describeNode',{nodeId:selected.nodeId})).node;
      pendingPath=backendPath(inputDocument.root,pendingNode.backendNodeId)?.map(n=>({nodeId:n.nodeId,backendNodeId:n.backendNodeId,nodeName:n.nodeName,attributes:n.attributes}));
      const resolved=await cdp.send('DOM.resolveNode',{backendNodeId:pendingNode.backendNodeId});
      const bound=await cdp.send('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(selector){window.__carematePendingEndpoint=this;return {connected:this.isConnected,selectorMatches:document.querySelector(selector)===this};}',arguments:[{value:prepared.endpoint}],returnByValue:true});
      pendingIdentity={backendNodeId:pendingNode.backendNodeId,...bound.result.value};
      if(!pendingIdentity.connected||!pendingIdentity.selectorMatches)throw Error('Pending endpoint changed between CDP capture and retained DOM-object binding');
      await cdp.send('Runtime.releaseObject',{objectId:resolved.object.objectId});
    }
    inputCheckpoints.push(await captureInputGeometry(page,cdp,prepared.trigger,'after-DOM-reads'));
    await saveRaw(dir,'input-coordinate-prehit.json',{coordinates,checkpoints:inputCheckpoints,frame,inputNode,prepared},manifest);
    const hitNode=await cdp.send('DOM.getNodeForLocation',{...coordinates.documentPoint,includeUserAgentShadowDOM:true});
    inputCheckpoints.push(await captureInputGeometry(page,cdp,prepared.trigger,'after-CDP-hit'));
    const inputCoordinateProof={version:'document-hit-client-input-v1',documentPoint:coordinates.documentPoint,inverseClientPoint:coordinates.inverseClientPoint,checkpoints:inputCheckpoints};
    await page.evaluate(({endpoint,before,trigger,navigation,expectedText})=>{
      const expectedElement=document.querySelector(`[data-testid="${trigger}"]`);
      const preEndpoint=navigation?window.__carematePendingEndpoint:null;
      if(navigation&&(!preEndpoint?.isConnected||preEndpoint!==document.querySelector(endpoint)))throw Error('Pending endpoint changed between CDP binding and observer setup');
      const s={timeOrigin:performance.timeOrigin,documentToken:crypto.randomUUID(),navigationPath:navigation?.path||null,input:null,feedback:null,events:[],integrityChecks:[],endpointLifecycle:{version:1,checks:[]},visibility:[document.visibilityState],focused:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};window.__caremateAction=s;
      document.addEventListener('visibilitychange',()=>s.visibility.push(document.visibilityState));
      const eventObserver=new PerformanceObserver(list=>s.events.push(...list.getEntries().map(e=>e.toJSON())));eventObserver.observe({type:'event',buffered:true,durationThreshold:16});
      document.addEventListener('pointerdown',e=>{if(!s.input){s.input={handlerObservedMs:performance.now(),eventTimeStamp:e.timeStamp,isTrusted:e.isTrusted,trigger:e.target.closest('[data-testid]')?.getAttribute('data-testid'),expectedTrigger:trigger,expectedElementContainsTarget:expectedElement?.contains(e.target),target:e.target.outerHTML};performance.mark('caremate-action-input');}},{capture:true,once:true});
      let feedbackElement=null,ancestorElements=[],raf=0,finished=false;
      const geometry=el=>{
        const range=document.createRange();range.selectNodeContents(el);
        const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>r.toJSON()),r=range.getBoundingClientRect(),chain=[];
        for(let a=el;a;a=a.parentElement){const ar=a.getBoundingClientRect(),style=getComputedStyle(a);chain.push({tag:a.tagName,testId:a.getAttribute('data-testid'),rect:ar.toJSON(),display:style.display,visibility:style.visibility,opacity:style.opacity,transform:style.transform,filter:style.filter,clipPath:style.clipPath,overflowX:style.overflowX,overflowY:style.overflowY,runningAnimations:a.getAnimations().filter(v=>v.playState==='running').length});}
        return {rect:r.toJSON(),textRects:rects,elementRect:el.getBoundingClientRect().toJSON(),chain,scroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}:null},visible:rects.length>0&&rects.every(r=>r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth),hit:rects.every(r=>[.2,.5,.8].every(f=>el.contains(document.elementFromPoint(r.x+r.width*f,r.y+r.height/2)))),supported:chain.every(a=>a.display!=='none'&&a.visibility==='visible'&&Number(a.opacity)===1&&a.transform==='none'&&a.filter==='none'&&a.clipPath==='none'&&!a.runningAnimations&&(!['hidden','clip','auto','scroll'].includes(a.overflowX)||r.left>=a.rect.left&&r.right<=a.rect.right)&&(!['hidden','clip','auto','scroll'].includes(a.overflowY)||r.top>=a.rect.top&&r.bottom<=a.rect.bottom))};
      };
      const continuity=()=>{
        if(!feedbackElement)return;
        const el=document.querySelector(endpoint),at=performance.now();
        if(navigation&&!feedbackElement.isConnected&&!el&&location.pathname===navigation.path){s.endpointLifecycle.checks.push({at,reason:'expected-route-unmount',connected:false,matched:false,path:location.pathname,viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY}});return;}
        const same=el===feedbackElement&&ancestorElements.every((a,i)=>i===0?a===el:a===ancestorElements[i-1].parentElement),current=el?geometry(el):null;
        const rangeStable=current&&current.textRects.length===s.feedback.textRects.length&&current.textRects.every((r,i)=>['x','y','width','height'].every(k=>Math.abs(r[k]-s.feedback.textRects[i][k])<.1));
        const ancestorGeometryStable=current&&current.chain.length===s.feedback.chain.length&&current.chain.every((a,i)=>['x','y','width','height'].every(k=>Math.abs(a.rect[k]-s.feedback.chain[i].rect[k])<.1));
        s.endpointLifecycle.checks.push({at,same,textUnchanged:el?.textContent===s.feedback.text,rangeStable,ancestorGeometryStable,viewportStable:current&&JSON.stringify(current.viewport)===JSON.stringify(s.feedback.viewport),scrollStable:scrollX===s.feedback.scroll.x&&scrollY===s.feedback.scroll.y,current,path:location.pathname});
      };
      const changed=()=>{if(!s.input)return;
        if(navigation&&!s.destinationReady&&location.pathname===navigation.path){
          const report=document.querySelector('[data-testid="lab-page"]'),brief=document.querySelector('[data-testid="brief-packet"]');
          const ready=navigation.kind==='report'?report?.querySelectorAll('button[data-testid^="lab-"]').length===3&&report.querySelector('[data-testid="lab-count"]'):brief&&document.querySelector('[data-testid="brief-key-facts"]')&&document.querySelector('[data-testid="brief-status"]');
          if(ready)s.destinationReady={at:performance.now(),path:location.pathname,kind:navigation.kind,text:(navigation.kind==='report'?report:document.querySelector('[data-testid="visit-brief"]')).textContent,definition:'Complete required destination content present in the DOM; distinct from first meaningful presented feedback and physical scan-out.'};
        }
        if(s.feedback){continuity();return;}const el=document.querySelector(endpoint);if(!el||el.textContent===before||el.textContent!==expectedText||navigation&&el!==preEndpoint)return;const g=geometry(el);if(!g.visible||!g.hit||!g.supported)return;feedbackElement=el;for(let a=el;a;a=a.parentElement)ancestorElements.push(a);s.feedback={at:performance.now(),text:el.textContent,preInputIdentityMatched:!navigation||el===preEndpoint,...g};s.feedback.markStart=performance.mark('caremate-action-feedback-dom').startTime;continuity();};
      const mutations=new MutationObserver(changed);mutations.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
      document.addEventListener('scroll',continuity,true);window.addEventListener('resize',continuity);
      // Geometry sampling establishes visibility intervals only. These rAF clocks
      // are never a paint/presentation or latency metric.
      const sample=()=>{if(finished)return;changed();raf=requestAnimationFrame(sample);};raf=requestAnimationFrame(sample);
      s.finish=()=>{continuity();finished=true;cancelAnimationFrame(raf);s.events.push(...eventObserver.takeRecords().map(e=>e.toJSON()));eventObserver.disconnect();mutations.disconnect();document.removeEventListener('scroll',continuity,true);window.removeEventListener('resize',continuity);s.end=performance.now();return {...s,stateAfter:JSON.parse(localStorage.getItem('caremate-v4')),finish:undefined};};
    },prepared);
    const traceTimestampContract={version:'explicit-stage-implicit-scope-start-v1',platform:process.platform,tracingStartRequest:{...actionTraceStartRequest}};
    const categories=traceTimestampContract.tracingStartRequest.categories.split(',');
    await cdp.send('Tracing.start',traceTimestampContract.tracingStartRequest);traceStarted=true;
    inputCheckpoints.push(await captureInputGeometry(page,cdp,prepared.trigger,'before-dispatch'));
    const inputPreflight=assessInputCoordinateProof({inputCoordinateProof,frame,inputNode,prepared,hitNode,clickPoint});
    if(!inputPreflight.valid){await saveRaw(dir,'input-coordinate-proof.json',{inputCoordinateProof,frame,inputNode,prepared,hitNode,clickPoint,assessment:inputPreflight},manifest);throw Error(inputPreflight.errors.join('; '));}
    const down=cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...clickPoint,button:'left',clickCount:1});
    const up=cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...clickPoint,button:'left',clickCount:1});await Promise.all([down,up]);
    await page.waitForFunction(()=>window.__caremateAction.feedback);
    if(prepared.navigation)await page.waitForFunction(()=>window.__caremateAction.destinationReady);
    await page.waitForTimeout(700);
    const observation=await page.evaluate(()=>window.__caremateAction.finish());await saveRaw(dir,'observation.json',observation,manifest);
    await saveRaw(dir,'input-coordinate-proof.json',{inputCoordinateProof,frame,inputNode,prepared,hitNode,clickPoint,assessment:inputPreflight},manifest);
    const doc=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const selected=pendingNode?null:await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:prepared.endpoint});
    const feedbackNode=pendingNode||(await cdp.send('DOM.describeNode',{nodeId:selected.nodeId})).node;
    const feedbackPath=pendingPath||backendPath(doc.root,feedbackNode.backendNodeId)?.map(n=>({nodeId:n.nodeId,backendNodeId:n.backendNodeId,nodeName:n.nodeName,attributes:n.attributes}));
    const ancestorBoxes=[];for(const node of feedbackPath||[]){try{ancestorBoxes.push({node,...await cdp.send('DOM.getBoxModel',{backendNodeId:node.backendNodeId})});}catch{ancestorBoxes.push({node,boxUnavailable:true});}}
    const provenance={prepared,frame,inputNode,inputPath,hitNode,coordinateHitIsAdvisory:true,inputCoordinateProof,traceTimestampContract,clickPoint,feedbackNode,feedbackPath,pendingIdentity,ancestorBoxes,observation,categories};await saveRaw(dir,'dom-provenance.json',provenance,manifest);
    const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const ended=await complete;traceStarted=false;
    await saveRaw(dir,'tracing-completion.json',ended,manifest);
    let bytes='';for(;;){const read=await cdp.send('IO.read',{handle:ended.stream});bytes+=read.base64Encoded?Buffer.from(read.data,'base64').toString():read.data;if(read.eof)break;}await cdp.send('IO.close',{handle:ended.stream});traceRaw=parseActionTrace(bytes);await saveRaw(dir,'trace.json',bytes,manifest);
    const afterJpeg=await page.screenshot({type:'jpeg',quality:90});await saveRaw(dir,'after.jpg',afterJpeg,manifest);
    const afterReference=await page.evaluate(({endpoint})=>{const el=document.querySelector(endpoint);if(!el)return {present:false,path:location.pathname,viewport:{width:innerWidth,height:innerHeight}};const r=document.createRange();r.selectNodeContents(el);return {present:true,text:el.textContent,rect:r.getBoundingClientRect().toJSON(),textRects:[...r.getClientRects()].map(v=>v.toJSON()),viewport:{width:innerWidth,height:innerHeight}};},prepared);await saveRaw(dir,'after-reference-geometry.json',afterReference,manifest);
    const correlation=correlateAction(traceRaw.traceEvents,provenance,beforeJpeg,afterJpeg,traceRaw.metadata);await saveRaw(dir,'correlation.json',correlation,manifest);
    const visualFrames=[];
    for(const [index,screen] of traceRaw.traceEvents.filter(e=>e.name==='Screenshot').entries()){
      const jpegBytes=Buffer.from(screen.args.snapshot,'base64'),file=`trace-screen-${index}.jpg`;
      await saveRaw(dir,file,jpegBytes,manifest);
      visualFrames.push({file:`${file}.gz`,jpegSha256:sha256(jpegBytes),frameSequence:screen.args.frame_sequence,frameSource:screen.args.source_id,screenshotTsUs:screen.ts,candidate:correlation.first?.frameSequence===screen.args.frame_sequence});
    }
    await fs.writeFile(path.join(dir,'visual-review-required.json'),JSON.stringify({status:'pending',reviewerType:'Assistant technical visual inspection; not OCR or human-participant evidence',expectedText:prepared.expectedText,endpoint:prepared.endpoint,roi:observation.feedback.rect,frames:visualFrames,required:['Exact new visible readable feedback text','Full frame and ROI inspected','Before reference visibly differs','Earliest eligible frame justification','Correct persisted state','No occlusion or geometry ambiguity'],candidateFeedbackLatencyMs:correlation.candidateFeedbackLatencyMs},null,2));
    const validationErrors=[...correlation.errors];
    validationErrors.push(...validateActionOutcome(prepared,observation));
    if(afterReference.viewport.width!==observation.viewport.width||afterReference.viewport.height!==observation.viewport.height||(!afterReference.present&&(!prepared.navigation||afterReference.path!==prepared.navigation.path)))validationErrors.push('Post-trace destination/reference provenance changed');
    const destinationRequests=prepared.navigation?cdpNetwork.filter(e=>e.method==='Network.requestWillBeSent'&&new URL(e.params.request.url).pathname===prepared.navigation.path):[];
    const destinationResponses=prepared.navigation?cdpNetwork.filter(e=>e.method==='Network.responseReceived'&&destinationRequests.some(r=>r.params.requestId===e.params.requestId)):[];
    if(prepared.navigation&&(!destinationRequests.length||destinationRequests.some(e=>e.params.timestamp*1000000<correlation.input?.ts)||!destinationResponses.length||destinationResponses.some(e=>e.params.response.status!==200||e.params.response.fromDiskCache||e.params.response.fromPrefetchCache||e.params.response.fromServiceWorker)))validationErrors.push('Destination request is missing, preactivation, cached, or unsuccessful');
    await saveRaw(dir,'navigation-readiness.json',{navigation:prepared.navigation,cacheCleared:!!prepared.navigation,destinationRequests,destinationResponses,destinationReady:observation.destinationReady||null,destinationDomReadyLatencyMs:observation.destinationReady?observation.destinationReady.at-observation.input.eventTimeStamp:null},manifest);
    if(ended.dataLossOccurred||!observation.focused||observation.visibility.some(v=>v!=='visible'))validationErrors.push('Trace loss/foreground provenance failed');
    if(forbidden.length||errors.length)validationErrors.push('Forbidden network or browser error');
    const interactionEntries=observation.events.filter(e=>e.interactionId>0&&e.startTime>=observation.input.eventTimeStamp-1),interactionDurations=Object.values(Object.groupBy(interactionEntries,e=>e.interactionId)).map(entries=>Math.max(...entries.map(e=>e.duration)));
    const summary={id,action,iteration,frame,validationErrors,visualReviewRequired:true,candidateFeedbackLatencyMs:correlation.candidateFeedbackLatencyMs,feedbackLatencyMs:null,separateInteractionNextPaintMs:correlation.separateInteractionNextPaintMs,queueDelayMs:correlation.queueDelayMs,presentationDefinition:correlation.presentationDefinition,eventTiming:{observationStartMs:observation.input.eventTimeStamp,observationEndMs:observation.end,interactionCount:interactionDurations.length,interactionEntries,labInpCandidateMs:interactionDurations.length?Math.max(...interactionDurations):null,belowReportingThreshold:interactionDurations.length===0,reportingThresholdMs:16,definition:'Event Timing interaction duration to next presentation; separate from project meaningful-feedback latency. One-action lab candidate, not field CWV.'}};
    await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));return summary;
  } catch(error){
    await fs.writeFile(path.join(dir,'failure.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));
    if(page&&!page.isClosed()){
      try{await saveRaw(dir,'failed-observation.json',await page.evaluate(()=>window.__caremateAction?.finish?.()??null),manifest);await saveRaw(dir,'failed-screen.jpg',await page.screenshot({type:'jpeg',quality:90}),manifest);}catch(captureError){await fs.writeFile(path.join(dir,'failure-capture-error.json'),JSON.stringify({message:captureError.message}));}
    }
    throw error;
  }
  finally{
    if(traceStarted&&cdp){const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const ended=await complete;let bytes='';for(;;){const r=await cdp.send('IO.read',{handle:ended.stream});bytes+=r.base64Encoded?Buffer.from(r.data,'base64').toString():r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:ended.stream});await saveRaw(dir,'failed-trace.json',bytes,manifest);}
    await saveRaw(dir,'all-network.json',{network,cdpNetwork,forbidden,errors},manifest);await fs.writeFile(path.join(dir,'archive-manifest.json'),JSON.stringify(manifest,null,2));await context?.close();await fs.writeFile(path.join(dir,'cleanup.json'),JSON.stringify({contextClosed:true,at:new Date().toISOString()}));
  }
}
async function main() {
  if(process.argv.includes('--verify-evidence')){
    const {verifyEvidence}=await import('./verify-performance-evidence.mjs');
    const at=process.argv.indexOf('--verify-evidence');
    if(!process.argv[at+1])throw Error('--verify-evidence requires an evidence directory');
    const result=await verifyEvidence(path.resolve(process.argv[at+1]),{smoke:process.argv.includes('--smoke-only')});
    console.log(JSON.stringify(result,null,2));process.exitCode=result.exitCode;return;
  }
  if (process.env.GITHUB_PAGES === 'true') throw Error('Performance requires a default production build, not static output');
  const navigationSmoke=process.argv.includes('--navigation-smoke');
  const timeChangeSmoke=process.argv.includes('--time-change-smoke');
  const actionsSmoke = process.argv.includes('--actions-smoke')||navigationSmoke||timeChangeSmoke;
  if([navigationSmoke,timeChangeSmoke,process.argv.includes('--actions-smoke')].filter(Boolean).length>1)throw Error('Choose one smoke action');
  const smokeAction=timeChangeSmoke?'time-change':navigationSmoke?'navigate-report':'checkin-save';
  const smoke = process.argv.includes('--smoke') || actionsSmoke;
  const groupArgument=process.argv.indexOf('--action-group');
  const actionGroup=groupArgument>=0?process.argv[groupArgument+1]:null;
  if(groupArgument>=0&&(!actionIds.includes(actionGroup)||smoke))throw Error('Bounded --action-group requires one declared action ID and cannot be combined with smoke flags');
  const sampleCount = smoke ? Number(process.env.CAREMATE_SMOKE_SAMPLES || 1) : 5;
  if (![1, 5].includes(sampleCount)) throw Error('Smoke sample count must be 1 or 5');
  const output = path.resolve(process.env.CAREMATE_PERF_OUTPUT || `docs/superpowers/evidence/2026-10-04/task-10/performance-${actionGroup?'action-group':smoke ? 'smoke' : 'matrix'}-${Date.now()}`);
  await fs.mkdir(output); // Never overwrite prior measured evidence.
  const sourceBinding=Buffer.from(JSON.stringify(await captureSourceBinding(ROOT),null,2));
  await fs.writeFile(path.join(output,'runtime-source-binding.json'),sourceBinding);
  await fs.mkdir(path.join(output,'captured-methods'));
  for(const file of methodFiles)await fs.writeFile(path.join(output,'captured-methods',path.basename(file)),await fs.readFile(path.join(ROOT,file)));
  const files = ['package-lock.json', 'next.config.ts', '.next/BUILD_ID', '.next/build-manifest.json', 'scripts/measure-demo-performance.mjs'];
  await fs.writeFile(path.join(output,'executed-harness.mjs'), await fs.readFile(fileURLToPath(import.meta.url)));
  await fs.writeFile(path.join(output,'product-source.diff'), execFileSync('git',['diff','--','src'],{cwd:ROOT}));
  const sourceFiles=execFileSync('git',['ls-files','-z','src'],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean);
  const sourceHashes={}; for(const file of sourceFiles)sourceHashes[file]=sha256(await fs.readFile(path.join(ROOT,file)));
  await fs.writeFile(path.join(output,'product-source-hashes.json'),JSON.stringify(sourceHashes,null,2));
  const hashes = {};
  for (const file of files) hashes[file] = sha256(await fs.readFile(path.join(ROOT, file)));
  const source=await fs.readFile(fileURLToPath(import.meta.url),'utf8');
  const measurementCoreSha256=sha256(Buffer.from(source.slice(0,source.indexOf('async function main()'))));
  const scope=actionGroup?{kind:'bounded-action-group',action:actionGroup,requestedActionSamples:10,requestedNavigationSamples:0,fullAcceptance:false}:smoke?{kind:'bounded-smoke',...(actionsSmoke?{action:smokeAction,requestedActionSamples:1,requestedNavigationSamples:0}:{}),fullAcceptance:false}:{kind:'full-matrix',requestedActionSamples:140,requestedNavigationSamples:340};
  await fs.writeFile(path.join(output, 'provenance.json'), JSON.stringify({at: new Date().toISOString(), command: process.argv, cwd: ROOT, node: process.version, platform: process.platform, release: os.release(), cpu: os.cpus()[0], totalMemory: os.totalmem(), browserExecutable: chromium.executablePath(), browserCache: process.env.PLAYWRIGHT_BROWSERS_PATH, head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(), dirty: execFileSync('git', ['status', '--short'], {cwd: ROOT, encoding: 'utf8'}), hashes,sourceBindingSha256:sha256(sourceBinding),measurementCoreSha256,scope, buildId: await fs.readFile(path.join(ROOT, '.next/BUILD_ID'), 'utf8'), smoke, requiredNavigationSamples: 340}, null, 2));
  await freePort(3100);
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], {cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, NO_COLOR: '1', FORCE_COLOR: ''}});
  let serverLog = ''; server.stdout.on('data', data => {serverLog += data;}); server.stderr.on('data', data => {serverLog += data;});
  const origin = 'http://127.0.0.1:3100', samples = [], groups = [];
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {try {const r = await fetch(origin + '/welcome'); if(r.ok) {ready = true; break;}} catch {} await new Promise(r => setTimeout(r, 250));}
    if (!ready) throw Error('Owned production server did not start');
    const actionSamples=[],actionGroups=[];
    if(actionGroup||actionsSmoke||!smoke){
      for(const action of actionGroup?[actionGroup]:actionsSmoke?[smokeAction]:actionIds){
        const group=[];
        for(let i=1;i<=(actionsSmoke?1:10);i++){const sample=await measureAction(origin,action,i,output);actionSamples.push(sample);group.push(sample);if(sample.validationErrors.length)throw Error(`Action instrumentation failed: ${sample.id}`);}
        const sorted=group.map(s=>s.candidateFeedbackLatencyMs).sort((a,b)=>a-b),candidateP95Ms=sorted[Math.ceil(.95*sorted.length)-1];
        actionGroups.push({action,n:group.length,candidateP95Ms,p95:null,budgetMs:200,visualReview:'pending'});
        await fs.writeFile(path.join(output,'action-results.json'),JSON.stringify({status:'pending-visual-review',samples:actionSamples,groups:actionGroups,estimator:'Nearest-rank p95; n10 uses worst observed value. Candidate timings are not accepted until every exact frame receives semantic visual review.'},null,2));
        console.log(`ACTION GROUP ${action}: ${group.length} captured; candidate p95 ${candidateP95Ms}ms; all semantic reviews pending`);
        if(candidateP95Ms>200)throw Error(`Candidate feedback exceeds budget: ${action} ${candidateP95Ms}ms; semantic visual review required before product adjudication`);
      }
    }
    const selected = actionGroup||actionsSmoke?[]:smoke ? ['/welcome'] : routes;
    for (const route of selected) for (const device of smoke ? ['mobile'] : ['mobile', 'desktop']) for (const cache of smoke && process.env.CAREMATE_SMOKE_COLD_ONLY === 'true' ? ['cold'] : ['cold', 'warm']) {
      const group = [];
      for (let i = 1; i <= sampleCount; i++) {const s = await measure(origin, route, device, cache, i, output); samples.push(s); group.push(s); if(s.validationErrors.length) throw Error(`Instrumentation failed for ${s.id}`);}
      const result = {route, device, cache, ...assessGroup(group, sampleCount)}; groups.push(result);
      await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({scope: smoke ? 'Bounded actual-app smoke, not full acceptance' : 'Navigation matrix plus separately defined action presentation and Event Timing gates', samples, groups,actionGroups}, null, 2));
      console.log(`GROUP ${route} ${device} ${cache}: ${JSON.stringify(result)}`);
      if (result.errors.length) throw Error('Performance budget failed; inspect retained group results and all raw samples');
    }
    if (groups.some(g => g.errors.length)) throw Error('Performance budget failed; inspect retained group results and all raw samples');
    if(actionSamples.length){process.exitCode=2;await fs.writeFile(path.join(output,'capture-status.json'),JSON.stringify({status:'pending-visual-review',exitCode:2,actionSamples:actionSamples.length,navigationSamples:samples.length,gatePassed:false},null,2));console.log('CAPTURE COMPLETE; semantic visual reviews and offline evidence verification remain pending (exit2).');}
  } catch(error) {await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({message: error.message, stack: error.stack}, null, 2)); throw error;}
  finally {server.kill(); await new Promise(resolve => server.once('close', resolve)); await fs.writeFile(path.join(output, 'server.log'), serverLog); await fs.writeFile(path.join(output, 'cleanup.json'), JSON.stringify({serverPid: server.pid, serverClosed: server.exitCode !== null || server.signalCode !== null, finishedAt: new Date().toISOString()}, null, 2)); console.log(`EVIDENCE ${output}`);}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error); process.exitCode = 1;});
