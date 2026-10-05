import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
// Next 16.3.5's Windows exporter passes native path.relative into an encoder
// that replaces only '/'. Publish the same bytes at the client's canonical name.
export async function canonicalStaticAssets(directory){
  if((await fs.lstat(directory)).isSymbolicLink())throw Error('Static export root symlink rejected');
  const base=await fs.realpath(directory),files=[];
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw Error(`Static export symlink rejected: ${file}`);
    if(entry.isDirectory())await walk(file);else if(entry.isFile())files.push(file);
  }}
  await walk(base);const planned=[];
  for(const file of files){
    const parts=path.relative(base,file).split(path.sep),index=parts.findIndex(p=>p.startsWith('__next'));
    if(index<0||index===parts.length-1||!file.endsWith('.txt'))continue;
    const relative=[...parts.slice(0,index),parts.slice(index).join('.')].join(path.sep),destination=path.resolve(base,relative);
    if(!destination.startsWith(base+path.sep))throw Error('Static alias escaped export root');
    const bytes=await fs.readFile(file);let existing=null;
    try{existing=await fs.readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(existing&&!existing.equals(bytes))throw Error(`Conflicting canonical static asset: ${relative}`);
    const duplicate=planned.find(p=>p.destination===destination);
    if(duplicate&&!duplicate.bytes.equals(bytes))throw Error(`Conflicting planned static asset: ${relative}`);
    planned.push({file,destination,bytes,existing:!!existing});
  }
  // Validate every collision before any write. Originals remain untouched.
  const aliases=[];
  for(const p of planned){if(!p.existing){try{await fs.writeFile(p.destination,p.bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}}
    const actual=await fs.readFile(p.destination);if(!actual.equals(p.bytes))throw Error('Static alias byte verification failed');
    aliases.push({original:path.relative(base,p.file).replaceAll(path.sep,'/'),canonical:path.relative(base,p.destination).replaceAll(path.sep,'/'),bytes:p.bytes.length,sha256:sha(p.bytes),verifiedSha256:sha(actual),created:!p.existing});
  }
  return {framework:'next@16.3.5',platform:process.platform,originalFilesPreserved:true,aliases};
}
async function main(){
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{cwd:root,env:{...process.env,GITHUB_PAGES:'true'},windowsHide:true,stdio:'inherit'});
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(exit!==0){process.exitCode=exit??1;return;}
  const manifest=await canonicalStaticAssets(path.join(root,'out'));
  const destination=process.env.CAREMATE_STATIC_ASSET_MANIFEST||path.join(root,'docs/superpowers/evidence/2026-10-04/task-10',`static-assets-${Date.now()}.json`);
  await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,JSON.stringify(manifest,null,2));
  console.log(`Canonical static assets: ${manifest.aliases.length}; manifest ${destination}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
