import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readArchives} from './verify-performance-evidence.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const run=path.resolve(process.argv[2]),sample=process.argv[3];
if(!sample||!/^action-[a-z-]+-\d+$/.test(sample))throw Error('Usage: node scripts/prepare-performance-review.mjs RUN_DIRECTORY action-ACTION-ITERATION');
const dir=path.join(run,sample),{raw}=await readArchives(dir),p=JSON.parse(raw.get('dom-provenance.json')),trace=JSON.parse(raw.get('trace.json'));
const provenance=JSON.parse(await fs.readFile(path.join(run,'provenance.json')));
const imageDir=path.join(dir,'review-images');await fs.mkdir(imageDir,{recursive:true});
for(const [name,data] of raw)if(name.endsWith('.jpg')){
  const file=path.join(imageDir,name);try{await fs.writeFile(file,data,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||!data.equals(await fs.readFile(file)))throw error;}
}
const template={kind:'assistant-technical-visual-review',decision:'pending',run:path.basename(run),sample,reviewer:'',reviewedAt:'',executedHarnessSha256:hash(await fs.readFile(path.join(run,'executed-harness.mjs'))),archiveManifestSha256:hash(await fs.readFile(path.join(dir,'archive-manifest.json'))),productSourceManifestSha256:hash(await fs.readFile(path.join(run,'product-source-hashes.json'))),buildId:provenance.buildId.trim(),expectedText:p.prepared.expectedText,roi:p.observation.feedback.rect,frameSequence:null,frameSource:null,screenshotTsUs:null,jpegSha256:null,stateBeforeSha256:hash(Buffer.from(JSON.stringify(p.prepared.stateBefore))),stateAfterSha256:hash(Buffer.from(JSON.stringify(p.observation.stateAfter))),beforeJpegSha256:hash(raw.get('before.jpg')),afterJpegSha256:hash(raw.get('after.jpg')),fullFrameInspected:false,roiInspected:false,beforeVisiblyDiffers:false,persistedStateVerified:false,noOcclusionOrGeometryAmbiguity:false,earliestEligibleFrameJustification:'',earlierFrames:[],supportingReports:[],availableFrames:trace.traceEvents.filter(e=>e.name==='Screenshot').map((e,index)=>({file:`review-images/trace-screen-${index}.jpg`,frameSequence:e.args.frame_sequence,frameSource:e.args.source_id,screenshotTsUs:e.ts,jpegSha256:hash(Buffer.from(e.args.snapshot,'base64'))}))};
if(provenance.sourceBindingSha256){const binding=await fs.readFile(path.join(run,'runtime-source-binding.json'));if(hash(binding)!==provenance.sourceBindingSha256)throw Error('Capture source binding differs');template.sourceBindingSha256=hash(binding);}
const file=path.join(dir,'visual-review.template.json');await fs.writeFile(file,JSON.stringify(template,null,2),{flag:'wx'});
console.log(JSON.stringify({template:file,images:imageDir,warning:'Pending template only. Do not copy flags or accept frames without actual full-frame/ROI/state/earlier-frame inspection.'},null,2));
