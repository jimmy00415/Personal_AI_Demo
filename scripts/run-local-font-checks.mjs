import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs/superpowers/evidence/2026-10-04/task-10',`local-font-focused-${Date.now()}`);
await fs.mkdir(output);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-local-font-checks-'));
const config={testDir:path.join(root,'scripts'),testMatch:'local-font-loading.spec.ts',workers:1,retries:0,fullyParallel:false,outputDir:path.join(output,'artifacts'),reporter:[['list'],['json',{outputFile:path.join(output,'results.json')}]],use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure'},webServer:{command:'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100',cwd:root,url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120000}};
const source=`import {defineConfig} from ${JSON.stringify(pathToFileURL(path.join(root,'node_modules/@playwright/test/index.mjs')).href)};\nexport default defineConfig(${JSON.stringify(config)});\n`;
const configFile=path.join(temp,'config.mjs');await fs.writeFile(configFile,source);await fs.writeFile(path.join(output,'executed-config.mjs.txt'),source);
const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',configFile],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b);});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
await fs.writeFile(path.join(output,'tests.log'),log+`\nACTUAL_EXIT_CODE=${exitCode}\n`);console.log(`EVIDENCE ${output}`);process.exitCode=exitCode;
