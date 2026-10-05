import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {captureSourceBinding, sha256} from './performance-source-binding.mjs';
import {readArchives, parseCapturedActionTrace, verifyEvidence} from './verify-performance-evidence.mjs';
import {actionIds, validateActionOutcome} from './measure-demo-performance.mjs';

// Current-source later-feedback bounds. Historical R65 audit/index remain unchanged.
export const COLLECTOR = '01d57bc20e1d29e63caeffbf049e01624fb5ca60c265ee59af416829b34e4710';
export const STRICT_VERIFIER = '978795a3eab0440c4f4218ed7ecabf0261b23469d2afa0adc5fecb288ab2ffbe';
export const AUDIT_SOURCES = ['scripts/verify-current-feedback-bounds.mjs','scripts/current-feedback-bounds.test.mjs'];
export const INDEX_PATH = 'docs/superpowers/evidence/2026-10-04/task-10/current-feedback-bounds-index.json';

const check = (ok, message) => {if (!ok) throw Error(message);};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const canonicalHash = b => sha256(Buffer.from(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(b).replace(/\r\n/g, '\n')));
const jsonHash = value => sha256(Buffer.from(JSON.stringify(value)));
const parse = b => JSON.parse(b.toString('utf8'));

export async function pinnedBytes(root, pin) {
  check(pin && typeof pin.path === 'string' && !pin.path.includes('\\') && !path.isAbsolute(pin.path)
    && pin.path.split('/').every(s => s && s !== '.' && s !== '..'), 'Invalid portable evidence path');
  const base = await fs.realpath(root), file = await fs.realpath(path.resolve(base, pin.path));
  check(file.startsWith(base + path.sep), 'Evidence symlink escapes its root');
  const bytes = await fs.readFile(file);
  check(sha256(bytes) === pin.sha256, `Evidence hash mismatch: ${pin.path}`);
  return bytes;
}

export function assertCompatibleSource(captured, current) {
  check(captured.schemaVersion === 1 && current.schemaVersion === 1 && Array.isArray(captured.files) && Array.isArray(current.files)
    && captured.files.length >= 107 && captured.files.length === current.files.length, 'Complete source inventory missing');
  const names = captured.files.map(f => f.path);
  check(new Set(names).size === names.length && equal(names,current.files.map(f=>f.path))
    && names.includes('.github/workflows/github-pages.yml') && names.includes('src/lib/clock.ts'), 'Source inventory changed/incomplete');
  for(const [i,before] of captured.files.entries()) {
    const after=current.files[i];
    check(before.kind===after.kind && before.normalization===after.normalization
      && before.canonicalSha256===after.canonicalSha256, 'Captured source changed: '+before.path);
  }
  return {matchedFiles:names.length,completeCapturedCurrentEquality:true,applicationOrWorkflowExceptions:false,checkoutNormalization:'UTF-8 CRLF to LF only'};
}

export function assertStrictResult(result, pending) {
  const all=actionIds.flatMap(action=>Array.from({length:10},(_,i)=>'action-'+action+'-'+(i+1))).sort();
  check(Array.isArray(pending) && new Set(pending).size===pending.length && pending.every(id=>all.includes(id)), 'Invalid declared earlier-visible pending set');
  check(equal(result.failures,[]) && equal([...result.pending].sort(),[...pending].sort()), 'Original strict failure/pending set differs');
  check(result.exitCode===(pending.length?2:0) && result.status===(pending.length?'pending':'verified'), 'Original strict actual status/return differs');
  check(equal(result.actions.map(a=>a.id).sort(),all.filter(id=>!pending.includes(id))), 'Original strict complementary action coverage differs');
  const complete=actionIds.filter(action=>!pending.some(id=>id.startsWith('action-'+action+'-')));
  check(equal(result.actionGroups.map(g=>g.action).sort(),[...complete].sort()) && result.actionGroups.every(g=>g.n===10&&g.budgetMs===200&&Number.isFinite(g.p95Ms)&&g.p95Ms<=200), 'Original strict complete action groups/budgets differ');
  check(result.navigationSampleCount===340 && result.navigationGroups.length===68
    && result.navigationGroups.every(g=>Array.isArray(g.errors)&&!g.errors.length&&Array.isArray(g.outliers)&&!g.outliers.length), 'Original navigation coverage/budget/outlier differs');
  check(result.executedHarnessSha256===COLLECTOR && result.verifierSha256===STRICT_VERIFIER, 'Original strict method identity changed');
}

export function assessBoundGroups(rows) {
  const expected = actionIds.flatMap(action => Array.from({length: 10}, (_, i) => `action-${action}-${i + 1}`)).sort();
  check(rows.length === 140 && equal(rows.map(r => r.id).sort(), expected), 'Bound coverage must contain all 140 unique samples');
  return actionIds.map(action => {
    const samples = rows.filter(r => r.action === action);
    check(samples.length === 10 && equal(samples.map(s => s.iteration).sort((a,b) => a-b), [1,2,3,4,5,6,7,8,9,10])
      && samples.every(s => s.id === `action-${action}-${s.iteration}` && Number.isFinite(s.feedbackUpperBoundMs) && s.feedbackUpperBoundMs >= 0), 'Invalid action bound identity/latency');
    const p95UpperBoundMs = [...samples].sort((a,b) => a.feedbackUpperBoundMs-b.feedbackUpperBoundMs)[Math.ceil(.95 * samples.length)-1].feedbackUpperBoundMs;
    check(p95UpperBoundMs <= 200, `${action}: conservative p95 bound exceeds 200ms`);
    return {action, n: 10, p95UpperBoundMs, budgetMs: 200, estimator: 'nearest-rank p95 of proven later-feedback bounds'};
  });
}

export function assertEarlierDispositions(earlier, reviewRows) {
  check(Array.isArray(reviewRows) && reviewRows.length===earlier.length, 'Earlier frame coverage incomplete');
  const keys=rows=>rows.map(r=>JSON.stringify([r.frameSequence,r.frameSource,r.screenshotTsUs])).sort();
  check(equal(keys(earlier),keys(reviewRows)) && new Set(keys(reviewRows)).size===reviewRows.length, 'Earlier frame identity/duplicate mismatch');
  for(const e of earlier) {
    const r=reviewRows.find(r=>r.frameSequence===e.frameSequence&&r.frameSource===e.frameSource&&r.screenshotTsUs===e.screenshotTsUs);
    check(r.jpegSha256===e.jpegSha256 && typeof r.meaningfulFeedbackVisible==='boolean' && r.reason?.length>10, 'Earlier frame actual disposition/hash absent');
  }
}

export function stateChanges(before, after, pointer = '') {
  if (equal(before, after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => stateChanges(before[key], after[key], `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  // Arrays retain exact complete contents, including order, rather than hiding removed records.
  return [{path: pointer, before: before === undefined ? {absent: true} : before, after: after === undefined ? {absent: true} : after}];
}

export function reviewFacts(review) {
  const fields = ['sample', 'expectedText', 'roi', 'frameSequence', 'frameSource', 'screenshotTsUs', 'jpegSha256',
    'stateBeforeSha256', 'stateAfterSha256', 'earlierFrames', 'earliestTiming', 'laterFeedbackProofJustification'];
  return Object.fromEntries(fields.map(k => [k, review[k]]));
}

export function assertBoundReview(review, facts, context) {
  check(review.kind === 'assistant-conservative-feedback-bound-review' && review.decision === 'accept-upper-bound'
    && review.metric === 'conservative-feedback-presentation-upper-bound', 'Separate explicit bound review absent');
  check(review.run === path.basename(context.run) && review.sample === facts.sample && review.executedHarnessSha256 === COLLECTOR
    && review.archiveManifestSha256 === facts.archiveManifestSha256 && review.productSourceManifestSha256 === facts.productSourceManifestSha256
    && review.sourceBindingSha256 === context.captureSourceBindingSha256 && review.buildId === context.buildId, 'Bound review capture/source/build mismatch');
  check(typeof review.reviewer === 'string' && review.reviewer.length > 0 && Number.isFinite(Date.parse(review.reviewedAt)), 'Actual reviewer/time absent');
  check(review.expectedText === facts.expectedText && equal(review.roi, facts.roi) && review.stateBeforeSha256 === facts.stateBeforeSha256
    && review.stateAfterSha256 === facts.stateAfterSha256 && review.beforeJpegSha256 === facts.beforeJpegSha256 && review.afterJpegSha256 === facts.afterJpegSha256,
  'Bound review semantic/state/reference identity mismatch');
  check(['fullFrameInspected', 'roiInspected', 'beforeVisiblyDiffers', 'persistedStateVerified', 'noOcclusionOrGeometryAmbiguity'].every(k => review[k] === true), 'Actual semantic inspection incomplete');
  check(equal([review.frameSequence, review.frameSource, review.screenshotTsUs, review.jpegSha256],
    [facts.frameSequence, facts.frameSource, facts.screenshotTsUs, facts.jpegSha256]), 'Selected later native frame/JPEG mismatch');
  const earlierVisible = review.earlierFrames.some(e=>e.meaningfulFeedbackVisible===true);
  check(earlierVisible===context.earlierVisiblePending.includes(facts.sample), 'Pending set must equal actual earlier-visible semantic dispositions');
  check(review.earliestTiming === (earlierVisible ? 'inconclusive' : 'strict-reviewed')
    && typeof review.laterFeedbackProofJustification === 'string' && review.laterFeedbackProofJustification.length > 20, 'Exact-first limitation/later proof absent');
  assertEarlierDispositions(facts.earlierFrames, review.earlierFrames);
}

export async function verifyFeedbackBounds(root, index) {
  check(index.schemaVersion===1 && index.kind==='reviewed-current-source-feedback-bounds-index'
    && typeof index.run==='string' && /^docs\/superpowers\/evidence\/2026-10-04\/task-10\/performance-matrix-\d+$/.test(index.run)
    && index.exactFirstFeedbackAccepted===false && index.fullMatrixCapture===true
    && /^[a-f0-9]{64}$/.test(index.captureSourceBindingSha256) && typeof index.buildId==='string' && index.buildId.length>0
    && !('workflowChange' in index), 'Unknown current bound index/scope or forbidden source exception');
  check(Array.isArray(index.auditSources) && equal(index.auditSources.map(p => p.path).sort(), [...AUDIT_SOURCES].sort()), 'New audit/test pins incomplete');
  for (const pin of index.auditSources) check(canonicalHash(await fs.readFile(path.join(root, pin.path))) === pin.canonicalSha256, `New audit/test source changed: ${pin.path}`);
  check(Array.isArray(index.supportingReports) && index.supportingReports.length >= 2, 'Independent and root actual review reports absent');
  for (const pin of index.supportingReports) await pinnedBytes(root, pin);
  const run = path.join(root, index.run), capturedBytes = await fs.readFile(path.join(run, 'runtime-source-binding.json'));
  check(sha256(capturedBytes) === index.captureSourceBindingSha256, 'Captured source binding changed');
  const captured = parse(capturedBytes), current = await captureSourceBinding(root), source = assertCompatibleSource(captured, current);
  check(index.sourceInventoryCount===captured.files.length, 'Declared complete source count differs');
  check(index.currentSourceCanonicalSha256 === jsonHash(current.files.map(({path,kind,normalization,canonicalSha256}) => ({path,kind,normalization,canonicalSha256}))), 'Current complete source pin mismatch');
  const provenance = parse(await fs.readFile(path.join(run, 'provenance.json')));
  check(provenance.sourceBindingSha256===index.captureSourceBindingSha256 && provenance.hashes['scripts/measure-demo-performance.mjs']===COLLECTOR
    && provenance.buildId.trim()===index.buildId, 'Capture provenance/build changed');
  for (const file of captured.files.filter(f => f.kind === 'method'))
    check(sha256(await fs.readFile(path.join(run, 'captured-methods', path.basename(file.path)))) === file.rawSha256, `Archived original method changed: ${file.path}`);
  check(sha256(await fs.readFile(path.join(run, 'executed-harness.mjs'))) === COLLECTOR, 'Executed original collector changed');
  // Exactly one unchanged full strict replay, without overrides or injecting reviews for the four.
  const strict = await verifyEvidence(run);
  assertStrictResult(strict,index.earlierVisiblePending);
  const archived = await import(pathToFileURL(path.join(run, 'captured-methods/measure-demo-performance.mjs')).href);
  const bindings = index.reviewBindings;
  const requiredIds = actionIds.flatMap(action => Array.from({length:10}, (_,i) => `action-${action}-${i+1}`)).sort();
  check(Array.isArray(bindings) && equal(bindings.map(b => b.id).sort(), requiredIds), 'All 140 bound review pins required');
  const productSourceManifestSha256 = sha256(await fs.readFile(path.join(run, 'product-source-hashes.json'))), rows = [];
  for (const binding of bindings) {
    check(binding.id.match(/^action-(.+)-([1-9]|10)$/) && binding.review.path === `${binding.id}/feedback-bound-review.json`, 'Bound sample/path mismatch');
    const sampleDir = path.join(run, binding.id), review = parse(await pinnedBytes(run, binding.review));
    if (index.earlierVisiblePending.includes(binding.id)) {
      try {await fs.access(path.join(sampleDir, 'visual-review.json')); throw Error('Actual earlier-visible pending sample has a strict acceptance file');}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
    } else {
      check(binding.strictReview?.path === `${binding.id}/visual-review.json`, 'Complementary strict review pin missing');
      const originalReview = parse(await pinnedBytes(run, binding.strictReview));
      check(equal([originalReview.frameSequence,originalReview.frameSource,originalReview.screenshotTsUs,originalReview.jpegSha256],
        [review.frameSequence,review.frameSource,review.screenshotTsUs,review.jpegSha256]) && equal(originalReview.earlierFrames, review.earlierFrames), 'Bound and original strict review disposition differ');
    }
    const {raw} = await readArchives(sampleDir), p = parse(raw.get('dom-provenance.json')), observation = parse(raw.get('observation.json'));
    const trace = parseCapturedActionTrace(archived, raw.get('trace.json'));
    const replay = archived.correlateAction(trace.traceEvents, p, raw.get('before.jpg'), raw.get('after.jpg'), trace.metadata);
    check(equal(replay, parse(raw.get('correlation.json'))) && replay.valid && !replay.errors.length, 'Bound original lossless correlation replay differs');
    check(validateActionOutcome(p.prepared, observation).length === 0 && replay.feedbackLatencyMs === null, 'Bound persisted outcome/raw NULL differs');
    const chosen = replay.candidates.find(c => c.frameSequence === review.frameSequence && c.frameSource === review.frameSource && c.screenshotTsUs === review.screenshotTsUs);
    check(chosen?.correlation, 'Bound later frame has no complete original native proof');
    const screens = trace.traceEvents.filter(e => e.name === 'Screenshot');
    const screen = screens.find(e => e.args.frame_sequence === review.frameSequence && e.args.source_id === review.frameSource && e.ts === review.screenshotTsUs);
    check(screen, 'Bound screenshot absent');
    const screenIdentity = e => ({frameSequence:e.args.frame_sequence,frameSource:e.args.source_id,screenshotTsUs:e.ts,jpegSha256:sha256(Buffer.from(e.args.snapshot, 'base64'))});
    const facts = {sample:binding.id,archiveManifestSha256:sha256(await fs.readFile(path.join(sampleDir,'archive-manifest.json'))),productSourceManifestSha256,
      expectedText:p.prepared.expectedText,roi:observation.feedback.rect,stateBeforeSha256:jsonHash(p.prepared.stateBefore),stateAfterSha256:jsonHash(observation.stateAfter),
      beforeJpegSha256:sha256(raw.get('before.jpg')),afterJpegSha256:sha256(raw.get('after.jpg')),...screenIdentity(screen),earlierFrames:screens.filter(e => e.ts < screen.ts).map(screenIdentity)};
    assertBoundReview(review, facts, index);
    for (const [i,e] of screens.entries()) check(Buffer.from(e.args.snapshot,'base64').equals(raw.get(`trace-screen-${i}.jpg`)), 'Original trace JPEG archive mismatch');
    check(binding.selectedFull.path === `${binding.id}/review-images/trace-screen-${screens.indexOf(screen)}.jpg`
      && binding.selectedFull.sha256 === facts.jpegSha256, 'Full-frame inspection file not the original selected JPEG');
    await pinnedBytes(run, binding.selectedFull);
    check(binding.selectedRoi.path === `${binding.id}/review-images/trace-screen-${screens.indexOf(screen)}.roi.png`, 'Selected ROI path mismatch');
    await pinnedBytes(run, binding.selectedRoi);
    check(Array.isArray(review.supportingReports) && review.supportingReports.length === 1 && equal(review.supportingReports[0], binding.sampleSupport), 'Compact sample support pin absent');
    const support = parse(await pinnedBytes(sampleDir, binding.sampleSupport));
    check(equal(support.reviewFacts, reviewFacts(review)) && equal(support.globalReports, index.supportingReports), 'Sample support actual dispositions/global review binding differs');
    check(equal(support.stateChanges, stateChanges(p.prepared.stateBefore, observation.stateAfter))
      && support.inputProofSha256 === jsonHash(p.inputCoordinateProof) && support.endpointEpochSha256 === jsonHash(replay.endpointEpoch)
      && support.nativeCorrelationSha256 === jsonHash(chosen.correlation), 'Sample support state/native/epoch proof differs');
    const feedbackUpperBoundMs = (chosen.correlation.presentationTsUs - replay.input.ts) / 1000;
    rows.push({id:binding.id,action:p.prepared.action,iteration:Number(binding.id.match(/-(\d+)$/)[1]),feedbackUpperBoundMs,
      earliestTiming:review.earliestTiming,frameSequence:review.frameSequence,jpegSha256:review.jpegSha256});
  }
  const actionGroups = assessBoundGroups(rows);
  return {kind:'conservative-feedback-bounds-audit',exitCode:0,status:'verified-upper-bounds',exactFirstFeedbackAccepted:false,
    limitations:'Later proven feedback presentation bounds first semantic feedback; not exact first timing, field INP, physical scan-out or human usability.',
    source,actions:rows,actionGroups,navigationSampleCount:strict.navigationSampleCount,navigationGroups:strict.navigationGroups,
    strict:{exitCode:strict.exitCode,status:strict.status,pending:strict.pending,reviewedActions:strict.actions.length,completeActionGroups:strict.actionGroups.length,failures:strict.failures},
    captureSourceBindingSha256:index.captureSourceBindingSha256,executedHarnessSha256:COLLECTOR,strictVerifierSha256:STRICT_VERIFIER,verifiedAt:new Date().toISOString()};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    check(process.argv.length === 2, 'Bound audit uses only its committed explicit index');
    const index = parse(await fs.readFile(path.join(root, INDEX_PATH)));
    console.log(JSON.stringify(await verifyFeedbackBounds(root, index), null, 2));
  } catch (error) {console.error(JSON.stringify({kind:'conservative-feedback-bounds-audit',exitCode:1,status:'failed',failures:[error.message]})); process.exitCode = 1;}
}
