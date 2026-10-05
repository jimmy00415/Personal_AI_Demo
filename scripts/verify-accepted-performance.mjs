import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyEvidence} from './verify-performance-evidence.mjs';
import {sha256,verifySourceBinding,methodFiles} from './performance-source-binding.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const defaultIndex='docs/superpowers/evidence/2026-10-04/task-10/accepted-performance.json';
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function contained(root,name){
  if(typeof name!=='string'||path.isAbsolute(name)||name.includes('\\'))throw Error('Expected portable project-relative path');
  const result=path.resolve(root,name);if(!result.startsWith(path.resolve(root)+path.sep))throw Error('Accepted evidence path escapes project');return result;
}
async function checkedPath(root,file){
  const actualRoot=await fs.realpath(root),actual=await fs.realpath(file);
  if(!actual.startsWith(actualRoot+path.sep))throw Error('Accepted evidence symlink escapes project');
  return actual;
}
async function verifyBoundRun(root,run,expectedHash){
  await checkedPath(root,run);
  const bindingBytes=await fs.readFile(path.join(run,'runtime-source-binding.json'));
  if(expectedHash&&sha256(bindingBytes)!==expectedHash)throw Error('Accepted source binding hash mismatch');
  const binding=JSON.parse(bindingBytes),source=await verifySourceBinding(root,binding);
  const provenance=await readJson(path.join(run,'provenance.json'));
  if(provenance.sourceBindingSha256!==sha256(bindingBytes))throw Error('Capture provenance source binding mismatch');
  for(const file of methodFiles){
    const row=binding.files.find(f=>f.path===file),captured=await fs.readFile(path.join(run,'captured-methods',path.basename(file)));
    if(!row||sha256(captured)!==row.rawSha256)throw Error(`Captured method bytes differ: ${file}`);
  }
  const verification=await verifyEvidence(run);
  if(verification.exitCode!==0)throw Error(`Full reviewed performance evidence is ${verification.status}: ${[...verification.failures,...verification.pending].join('; ')}`);
  return {bindingSha256:sha256(bindingBytes),source,verification,provenance};
}
export async function verifyAcceptedIndex(root,indexPath=defaultIndex){
  const indexFile=await checkedPath(root,contained(root,indexPath)),index=await readJson(indexFile);
  if(index.schemaVersion!==1||index.scope!=='140-reviewed-actions-and-340-navigations')throw Error('Accepted full-evidence index missing or invalid');
  const run=contained(root,index.run),verifiedBytes=await fs.readFile(await checkedPath(root,contained(root,index.acceptedVerification)));
  if(sha256(verifiedBytes)!==index.acceptedVerificationSha256)throw Error('Accepted verification result hash mismatch');
  const prior=JSON.parse(verifiedBytes);
  if(prior.exitCode!==0||prior.actions?.length!==140||prior.actionGroups?.length!==14||prior.navigationSampleCount!==340||prior.navigationGroups?.length!==68)throw Error('Indexed verification is incomplete or unaccepted');
  const current=await verifyBoundRun(root,run,index.sourceBindingSha256);
  if(JSON.stringify(current.verification.reviewBindings)!==JSON.stringify(prior.reviewBindings)||JSON.stringify(current.verification.actionGroups)!==JSON.stringify(prior.actionGroups)||JSON.stringify(current.verification.navigationGroups)!==JSON.stringify(prior.navigationGroups))throw Error('Current reviewed raw evidence differs from accepted index');
  return {status:'verified',exitCode:0,scope:index.scope,source:current.source,historicalCapture:{buildId:current.provenance.buildId.trim(),platform:current.provenance.platform,node:current.provenance.node},definition:'Offline re-verification of committed reviewed local evidence against current source inputs and methods. No new CI timing or historical buildID equality claim.',verification:current.verification};
}
export async function createAcceptedIndex(root,relativeRun,indexPath=defaultIndex){
  const run=contained(root,relativeRun),result=await verifyBoundRun(root,run);
  const acceptedVerification=`${relativeRun}/accepted-verification.json`,data=Buffer.from(JSON.stringify(result.verification,null,2));
  await fs.writeFile(contained(root,acceptedVerification),data,{flag:'wx'});
  const index={schemaVersion:1,scope:'140-reviewed-actions-and-340-navigations',run:relativeRun,acceptedVerification,acceptedVerificationSha256:sha256(data),sourceBindingSha256:result.bindingSha256,createdAt:new Date().toISOString()};
  await fs.writeFile(contained(root,indexPath),JSON.stringify(index,null,2),{flag:'wx'});return index;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const create=process.argv[2]==='--create-index';
  (create?createAcceptedIndex(ROOT,process.argv[3],process.argv[4]||defaultIndex):verifyAcceptedIndex(ROOT,process.argv[2]||defaultIndex))
    .then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
