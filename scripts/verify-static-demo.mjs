import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '/Personal_AI_Demo/';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export async function serveStatic(port = 3101, directory = path.join(root, 'out')) {
  const server = http.createServer(async (req, res) => {
    try {
      const requested = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(requested.pathname);
      if (!pathname.startsWith(prefix) || pathname.includes('\\') || pathname.includes('\0')) {res.writeHead(404); res.end('Not found'); return;}
      const relative = pathname.slice(prefix.length);
      let file = path.resolve(directory, relative);
      if (file !== directory && !file.startsWith(`${directory}${path.sep}`)) {res.writeHead(404); res.end('Not found'); return;}
      const stat = await fs.stat(file);
      if (stat.isDirectory()) {
        if (!pathname.endsWith('/')) {res.writeHead(308, {Location: pathname + '/' + requested.search}); res.end(); return;}
        file = path.join(file, 'index.html');
      }
      const body = await fs.readFile(file);
      res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': relative.startsWith('_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {res.writeHead(404); res.end('Not found');}
  });
  await new Promise((resolve,reject) => {server.once('error',reject); server.listen(port,'127.0.0.1',resolve);});
  console.log(`Owned strict static export server http://127.0.0.1:${server.address().port}${prefix}`);
  return server;
}
async function command(args, env, logFile) {
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, args, {cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output = '';
  child.stdout.on('data', data => {output += data; process.stdout.write(data);}); child.stderr.on('data', data => {output += data; process.stderr.write(data);});
  const exitCode = await new Promise((resolve,reject) => {child.once('error',reject); child.once('exit',resolve);});
  await fs.writeFile(logFile, `COMMAND: ${process.execPath} ${args.join(' ')}\nSTART: ${startedAt}\n${output}\nEXIT_CODE: ${exitCode}\nEND: ${new Date().toISOString()}\n`);
  return exitCode;
}
async function run(target) {
  if (!['prod','static','a11y'].includes(target)) throw Error('Expected prod, static, or a11y');
  const evidence = path.join(root, 'docs/superpowers/evidence/2026-10-04/task-10', `${target}-${Date.now()}`);
  await fs.mkdir(evidence);
  const env = {...process.env, CAREMATE_TEST_TARGET:target, CAREMATE_TEST_EVIDENCE:evidence}; delete env.NO_COLOR;
  if (target === 'static') env.GITHUB_PAGES='true'; else delete env.GITHUB_PAGES;
  env.CAREMATE_STATIC_ASSET_MANIFEST=path.join(evidence,'static-assets.json');
  let buildCode;
  if(env.CAREMATE_OWNED_AUDIT_SERVER_PID){
    if(target==='static'||!/^\d+$/.test(env.CAREMATE_OWNED_AUDIT_SERVER_PID))throw Error('Invalid owned audit server target/PID');
    process.kill(Number(env.CAREMATE_OWNED_AUDIT_SERVER_PID),0);
    const buildId=(await fs.readFile(path.join(root,'.next/BUILD_ID'),'utf8')).trim();
    if(buildId!==env.CAREMATE_OWNED_AUDIT_BUILD_ID)throw Error('Owned frozen audit build mismatch');
    buildCode=0;
    if(!env.CAREMATE_OWNED_AUDIT_BUILD_LOG)throw Error('Explicit owned server requires its original successful build transcript path');
    const originalBuildLog=await fs.readFile(path.resolve(env.CAREMATE_OWNED_AUDIT_BUILD_LOG));
    await fs.writeFile(path.join(evidence,'original-owned-build.log'),originalBuildLog);
    await fs.writeFile(path.join(evidence,'build.log'),`BUILD REUSED BY EXPLICIT OWNERSHIP, NOT REBUILT\nPID: ${env.CAREMATE_OWNED_AUDIT_SERVER_PID}\nBUILD_ID: ${buildId}\nOriginal successful build: ${env.CAREMATE_OWNED_AUDIT_BUILD_LOG}\nOriginal build transcript SHA256: ${createHash('sha256').update(originalBuildLog).digest('hex')}\nNo product source/build mutation while independent audit is active.\n`);
  }else buildCode = await command(target==='static'?['scripts/build-static-demo.mjs']:['node_modules/next/dist/bin/next','build'],env,path.join(evidence,'build.log'));
  if (buildCode !== 0) {process.exitCode=buildCode; return;}
  const sha = file => fs.readFile(path.join(root,file)).then(b => createHash('sha256').update(b).digest('hex'));
  const provenance={target,node:process.version,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}),buildId:await fs.readFile(path.join(root,'.next/BUILD_ID'),'utf8'),lockSha256:await sha('package-lock.json'),configSha256:await sha('next.config.ts'),browserCache:env.PLAYWRIGHT_BROWSERS_PATH};
  await fs.writeFile(path.join(evidence,'provenance.json'),JSON.stringify(provenance,null,2));
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','src','tests','scripts','package.json','package-lock.json','playwright.config.ts','next.config.ts'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const sourceHashes={};for(const file of new Set(files))sourceHashes[file]=await sha(file);
  await fs.writeFile(path.join(evidence,'source-hashes.json'),JSON.stringify(sourceHashes,null,2));
  await fs.writeFile(path.join(evidence,'product-source.diff'),execFileSync('git',['diff','--','src'],{cwd:root}));
  for(const file of new Set(files.filter(f=>!f.startsWith('src/')))){const destination=path.join(evidence,'executed-source',file+'.txt');await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,file),destination);}
  const code=await command(['node_modules/@playwright/test/cli.js','test',...process.argv.slice(3)],env,path.join(evidence,'tests.log'));
  const result=JSON.parse(await fs.readFile(path.join(evidence,'results.json'),'utf8'));
  const outcomes=[]; const walk=suite=>{for(const spec of suite.specs||[])for(const t of spec.tests||[])outcomes.push({title:spec.title,project:t.projectName,status:t.status,results:t.results.map(r=>r.status)});for(const s of suite.suites||[])walk(s);}; result.suites.forEach(walk);
  const failed=outcomes.filter(t=>t.status!=='expected'||t.results.some(r=>r==='skipped'));
  await fs.writeFile(path.join(evidence,'gate.json'),JSON.stringify({commandExit:code,total:outcomes.length,failed,outcomes},null,2));
  console.log(`EVIDENCE ${evidence}`);
  process.exitCode=code||(!outcomes.length||failed.length?1:0);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--serve')) {const server=await serveStatic();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
  else run(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
}
