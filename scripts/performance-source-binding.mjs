import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const methodFiles = ['scripts/measure-demo-performance.mjs','scripts/verify-performance-evidence.mjs','scripts/performance-source-binding.mjs','scripts/verify-accepted-performance.mjs','scripts/prepare-performance-review.mjs'];
export const buildFiles = ['scripts/verify-static-demo.mjs','scripts/build-static-demo.mjs','.github/workflows/github-pages.yml'];
const configNames=['package.json','package-lock.json','next.config.ts','next.config.js','next.config.mjs','tsconfig.json','jsconfig.json','postcss.config.mjs','postcss.config.js','postcss.config.cjs','tailwind.config.ts','tailwind.config.js','tailwind.config.mjs','.gitattributes','.env','.env.local','.env.production','.env.production.local'];
const textExtensions=new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.css','.scss','.html','.txt','.md','.svg','.xml','.webmanifest','.yaml','.yml','.toml']);
const portable = name => name.split(path.sep).join('/');
async function list(root,relative){
  const names=[];
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    const name=portable(path.join(relative,entry.name));
    if(entry.isSymbolicLink())throw Error(`Source symlink is not supported: ${name}`);
    if(entry.isDirectory())names.push(...await list(root,name));else if(entry.isFile())names.push(name);else throw Error(`Unsupported source entry: ${name}`);
  }
  return names;
}
export async function captureSourceBinding(root){
  const names=[...await list(root,'src'),...await list(root,'public'),...methodFiles,...buildFiles];
  const discovered=(await fs.readdir(root)).filter(name=>name.includes('config')&&/\.(?:[cm]?[jt]s|json|ya?ml|toml)$/.test(name)||/^\.(?:env(?:\.|$)|babelrc(?:\.|$)|postcssrc(?:\.|$)|npmrc$)/.test(name));
  for(const name of new Set([...configNames,...discovered])){try{const stat=await fs.lstat(path.join(root,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error(`Invalid config file: ${name}`);names.push(name);}catch(error){if(error.code!=='ENOENT')throw error;}}
  const files=[];
  for(const name of [...new Set(names)].sort()){
    const data=await fs.readFile(path.join(root,name)),text=textExtensions.has(path.extname(name))||path.basename(name).startsWith('.env')||name==='.gitattributes';
    const canonical=text?Buffer.from(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data).replace(/\r\n/g,'\n')):data;
    files.push({path:name,kind:methodFiles.includes(name)?'method':buildFiles.includes(name)?'build/deployment':name.startsWith('src/')||name.startsWith('public/')?'runtime':'config',normalization:text?'UTF-8; CRLF to LF only':'binary exact',rawBytes:data.length,rawSha256:sha256(data),canonicalSha256:sha256(canonical)});
  }
  return {schemaVersion:1,definition:'Complete src/public inventories, present runtime/build configs and locked dependencies, exact declared method files. Text comparison normalizes only Git checkout CRLF/LF; binary bytes remain exact.',files};
}
export async function verifySourceBinding(root,binding){
  if(binding.schemaVersion!==1||!Array.isArray(binding.files))throw Error('Missing source-binding schema');
  const current=await captureSourceBinding(root);
  const expected=binding.files.map(({path,kind,normalization,canonicalSha256})=>({path,kind,normalization,canonicalSha256}));
  const actual=current.files.map(({path,kind,normalization,canonicalSha256})=>({path,kind,normalization,canonicalSha256}));
  if(JSON.stringify(expected)!==JSON.stringify(actual)){
    const changed=[...new Set([...expected.map(f=>f.path),...actual.map(f=>f.path)])].filter(name=>JSON.stringify(expected.find(f=>f.path===name))!==JSON.stringify(actual.find(f=>f.path===name)));
    throw Error(`Accepted performance source inputs are stale: ${changed.join(', ')}`);
  }
  return {matchedFiles:actual.length,textNormalization:'CRLF to LF only',historicalRawHashesPreserved:true};
}
