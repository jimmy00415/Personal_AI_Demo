import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {routes} from './measure-demo-performance.mjs';

const root=process.cwd(),mode=process.argv[2]||'default';
assert.ok(['default','static'].includes(mode));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const staticRoot=path.join(root,mode==='static'?'out/_next':'.next');
function asset(url){assert.ok(!/^(?:https?:|data:)/.test(url),'Local stylesheet/asset required');const match=url.match(/(?:^|\/)\_next\/(.+)$/);assert.ok(match,`Unknown built asset ${url}`);return path.join(staticRoot,match[1].split('?')[0]);}
function ranges(value){const intervals=value.toUpperCase().split(',').map(token=>{const [a,b]=token.trim().replace(/^U\+/,'').split('-');assert.match(a,/^[0-9A-F?]+$/);return [parseInt(a.replaceAll('?','0'),16),parseInt(b||a.replaceAll('?','F'),16)];}).sort((a,b)=>a[0]-b[0]);const merged=[];for(const r of intervals){assert.ok(r.every(Number.isSafeInteger)&&r[1]>=r[0]);const last=merged.at(-1);if(last&&r[0]<=last[1]+1)last[1]=Math.max(last[1],r[1]);else merged.push(r);}return JSON.stringify(merged);}
async function rules(file){
  const css=await fs.readFile(file,'utf8'),rows=[];
  for(const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)){
    const fields={};for(const d of match[1].split(';').filter(v=>v.trim())){const at=d.indexOf(':');assert.ok(at>0);fields[d.slice(0,at).trim()]=d.slice(at+1).trim().replace(/\s+/g,' ');}
    if(!fields['font-family']?.includes('Noto Sans TC'))continue;
    const urls=[...fields.src.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1].replace(/["']/g,''));assert.equal(urls.length,2,'Both WOFF2 and WOFF fallback retained');
    const assets=[];for(const u of urls){const fontFile=path.resolve(path.dirname(file),u);assets.push({fontFile,sha256:hash(await fs.readFile(fontFile))});}
    let n=0;fields.src=fields.src.replace(/url\([^)]+\)/g,()=>`url(SHA256:${assets[n++].sha256})`).replace(/["'\s]/g,'');
    fields['font-family']=fields['font-family'].replace(/["']/g,'');fields['unicode-range']=ranges(fields['unicode-range']);
    rows.push({key:JSON.stringify(Object.fromEntries(Object.entries(fields).sort())),assets});
  }
  return rows;
}
const expected=[];for(const weight of [400,500])expected.push(...await rules(path.join(root,`node_modules/@fontsource/noto-sans-tc/${weight}.css`)));
assert.equal(expected.length,210,'Full source face count');
const allCss=(await walk(path.join(staticRoot,'static'))).filter(f=>f.endsWith('.css'));
const built=[];for(const file of allCss)built.push(...await rules(file));
assert.deepEqual(built.map(r=>r.key).sort(),expected.map(r=>r.key).sort(),'Every full font-face descriptor and exact local font byte hash must be preserved');
const routeResults=[];
for(const route of routes){const htmlFile=mode==='static'?path.join(root,'out',route==='/'?'index.html':route.slice(1)+'/index.html'):path.join(root,'.next/server/app',route==='/'?'index.html':route.slice(1)+'.html');const html=await fs.readFile(htmlFile,'utf8');const initial=[];
  for(const tag of html.matchAll(/<link\b[^>]*>/g)){const href=tag[0].match(/\bhref="([^"]+)"/)?.[1];if(href&&(/\brel="stylesheet"/.test(tag[0])||/\bas="style"/.test(tag[0])))initial.push(asset(href.replaceAll('&amp;','&')));}
  assert.ok(initial.length>0,'Base CSS remains present');
  const visited=new Set();async function inspect(file){if(visited.has(file))return;visited.add(file);assert.equal((await rules(file)).length,0,`${route}: initial critical CSS contains Noto faces (${path.basename(file)})`);const css=await fs.readFile(file,'utf8');for(const imported of css.matchAll(/@import\s+(?:url\()?['"]?([^\s'";)]+)['"]?\)?[^;]*;/g)){const u=imported[1];await inspect(u.startsWith('/')?asset(u):path.resolve(path.dirname(file),u));}}for(const file of initial)await inspect(file);
  routeResults.push({route,htmlFile:path.relative(root,htmlFile),htmlSha256:hash(Buffer.from(html)),initialCss:[...visited].map(file=>path.relative(root,file))});
}
console.log(JSON.stringify({mode,buildId:(await fs.readFile('.next/BUILD_ID','utf8')).trim(),routes:routeResults.length,faces:built.length,descriptorAndAssetBytesExact:true,unicodeRangeNormalization:'Equivalent sorted merged code-point intervals; no coverage change',initialFontFacesAbsent:true,routeResults,fontAssetBindings:built.flatMap(r=>r.assets.map(a=>({file:path.relative(root,a.fontFile),sha256:a.sha256})))},null,2));
