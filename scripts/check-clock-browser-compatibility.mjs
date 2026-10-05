import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {makeCompatibilityBundle,evaluateCompatibilityBundle} from './clock-compatibility-fixtures.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'docs/superpowers/evidence/2026-10-04/task-10');
const baselineDirectory=path.join(evidence,'r60-one-formatter');
const args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--output-dir'),'Use no arguments (fresh unique output), or --output-dir NEW_DIRECTORY');
const requested=path.resolve(args.length?args[1]:path.join(evidence,`r60-clock-browser-compatibility-${Date.now()}-${crypto.randomUUID()}`));
const output=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
const relative=path.relative(fs.realpathSync(baselineDirectory),output);
assert(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Output must be outside the immutable baseline directory');
fs.mkdirSync(output); // Exclusive: an existing output directory fails before browser launch.
console.log(JSON.stringify({outputDirectory:output}));
assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,'C:/Users/OWNER/AppData/Local/Temp/caremate-browser-readiness-20261003');
const require=createRequire(path.join(root,'package.json'));
const {chromium,firefox,webkit}=require('playwright');
const bundle=makeCompatibilityBundle(root,fs.readFileSync(path.join(baselineDirectory,'clock-before-r60.ts.txt'),'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const results=[];
let failed=false;
for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
  let browser,context;
  const record={engine,scope:'Actual in-page isolated Intl/domain differential and native datetime-local control; compiled-app integration remains untested',timezoneRequested:'America/Los_Angeles',browserClosed:false,contextClosed:false};
  try{
    browser=await type.launch({headless:true});record.browserVersion=browser.version();
    context=await browser.newContext({timezoneId:record.timezoneRequested,locale:'en-US',viewport:{width:390,height:844}});
    const page=await context.newPage();
    record.comparison=await page.evaluate(evaluateCompatibilityBundle,bundle);
    assert.equal(record.comparison.hostTimezone,record.timezoneRequested);
    assert.equal(record.comparison.exactCompatible,true);
    assert.equal(record.comparison.freshPerCallObject,true);
    await page.setContent('<label>Old clock <input id="before" type="datetime-local"></label><label>Current clock <input id="after" type="datetime-local"></label>');
    record.nativeControls=[];
    for(let i=0;i<record.comparison.nativeValues.baseline.length;i++){
      const before=record.comparison.nativeValues.baseline[i],after=record.comparison.nativeValues.current[i];
      await page.locator('#before').fill(before);await page.locator('#after').fill(after);
      await page.locator('#after').press('Tab');
      const actual=await page.evaluate(()=>({before:document.querySelector('#before').value,after:document.querySelector('#after').value,beforeValid:document.querySelector('#before').validity.valid,afterValid:document.querySelector('#after').validity.valid,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
      record.nativeControls.push({requestedBefore:before,requestedAfter:after,actual});
      assert.equal(actual.before,before);assert.equal(actual.after,after);assert.equal(actual.before,actual.after);assert.equal(actual.beforeValid,true);assert.equal(actual.afterValid,true);
    }
    record.pass=true;
  }catch(error){record.pass=false;record.error={name:error.name,message:error.message,stack:error.stack};failed=true;}
  finally{
    try{if(context){await context.close();record.contextClosed=true;}}catch(error){record.contextCleanupError=String(error);failed=true;}
    try{if(browser){await browser.close();record.browserClosed=true;}}catch(error){record.browserCleanupError=String(error);failed=true;}
    const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(output,`browser-${engine}-differential.json`),bytes,{flag:'wx'});
    results.push({engine,pass:record.pass,cases:record.comparison?.cases,confirmedRecipients:record.comparison?.currentGolden.map(g=>g.recipient),browserClosed:record.browserClosed,contextClosed:record.contextClosed,bytes:bytes.length,sha256:hash(bytes)});
    console.log(JSON.stringify(results.at(-1)));
  }
  if(failed)break;
}
fs.writeFileSync(path.join(output,'browser-differential-summary.json'),JSON.stringify({completed:results.length,expected:3,failed,results,scope:'Pure in-page compatibility only; not compiled app, browser performance, clipboard or export UI acceptance'},null,2)+'\n',{flag:'wx'});
process.exitCode=failed?1:0;
