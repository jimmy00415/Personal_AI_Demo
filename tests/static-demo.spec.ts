import {test,expect} from '@playwright/test';
import {createScenario} from '../src/lib/demo/scenarios';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const paths=['/welcome','/','/check-in','/ask','/help','/health','/care','/book','/brief','/report','/print','/family','/sharing','/notifications','/memory','/settings','/about','/visit','/journey','/plan','/records','/medications','/privacy','/care-team','/family/lai-wah','/dev'];
test.describe.configure({timeout:90_000});
test('P2 narrow large-text packet exposes review actions before prolonged reading',async({page,baseURL})=>{
  await page.setViewportSize({width:320,height:900});await page.addInitScript(d=>{localStorage.setItem('caremate-v4',JSON.stringify(d));localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale:'en',liteMode:true,introComplete:true}));},createScenario('day-before-visit'));
  await page.goto(baseURL+'brief/');await expect(page.getByTestId('brief-status')).toHaveText('Not yet confirmed');await expect(page.getByTestId('brief-confirm')).toBeInViewport({ratio:1});await expect(page.getByTestId('visit-copy')).toBeDisabled();
  await page.screenshot({path:test.info().outputPath('brief-initial-en320-large.png')});await page.getByTestId('brief-confirm').click();await expect(page.getByTestId('visit-copy')).toBeEnabled();await page.getByTestId('visit-print').click();await expect(page.getByTestId('print-view')).toContainText('May Chan');
});
for(const locale of ['zh-HK','en'])test(`P2 report result count is unambiguous ${locale}`,async({page,baseURL})=>{
  await page.addInitScript(({demo,locale})=>{localStorage.setItem('caremate-v4',JSON.stringify(demo));localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode:true,introComplete:true}));},{demo:createScenario('day-before-visit'),locale});await page.setViewportSize({width:320,height:900});await page.goto(baseURL+'report/');
  await expect(page.getByTestId('lab-count')).toHaveText(locale==='en'?'Lab results: 3':'化驗項目：3');await expect(page.locator('[data-testid^="lab-lab-"]')).toHaveCount(3);
});
test('measurement gate rejects missing samples outliers and actual over-budget medians',async()=>{
  const output=execFileSync(process.execPath,['--test','scripts/performance-gate.test.mjs','scripts/static-assets.test.mjs'],{encoding:'utf8'});
  await test.info().attach('native-esm-performance-gate',{body:output,contentType:'text/plain'});
});

test('strict subpath host keeps real 404s and serves direct route files',async({request,baseURL})=>{
  const origin=new URL(baseURL!).origin;
  for(const route of paths){const url=`${baseURL}${route==='/'?'':route.slice(1)+'/'} ` .trim();const response=await request.get(url);expect(response.status(),url).toBe(200);expect(response.headers()['content-type']).toContain('text/html');}
  for(const path of ['/health/','/personal_ai_demo/health/','/Personal_AI_Demo/missing-route/','/Personal_AI_Demo/%2e%2e/package.json'])expect((await request.get(origin+path)).status(),path).toBe(404);
});
test('canonical static segment HTTP responses retain exported bytes',async({request,baseURL})=>{
  const manifest=JSON.parse(await readFile(process.env.CAREMATE_STATIC_ASSET_MANIFEST!,'utf8'));
  for(const alias of manifest.aliases){const response=await request.get(baseURL+alias.canonical);expect(response.status()).toBe(200);const bytes=await response.body();expect(bytes.length).toBe(alias.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(alias.sha256);expect(await readFile('out/'+alias.original)).toEqual(bytes);}
  await test.info().attach('canonical-export-asset-byte-manifest',{body:JSON.stringify(manifest),contentType:'application/json'});
});
for(const route of ['/health','/brief'])test(`fresh static deep link refresh and navigation ${route}`,async({page,context,baseURL})=>{
  const requests:string[]=[],badAssets:string[]=[];context.on('request',r=>{if(new URL(r.url()).origin!==new URL(baseURL!).origin||/\/api(?:\/|$)/.test(new URL(r.url()).pathname))requests.push(r.url());});
  page.on('response',r=>{if(r.status()>=400)badAssets.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(d=>{if(!localStorage.getItem('caremate-v4'))localStorage.setItem('caremate-v4',JSON.stringify(d));if(!localStorage.getItem('caremate-v4-preferences'))localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale:'en',liteMode:true,introComplete:true}));},createScenario('day-before-visit'));
  await page.goto(baseURL+route.slice(1)+'/');await expect(page.getByTestId(route==='/health'?'health-page':'visit-brief')).toBeVisible();await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
  const hrefs=await page.locator('a[href]').evaluateAll(links=>links.map(el=>el.getAttribute('href')).filter((href):href is string=>!!href&&href.startsWith('/')));expect(hrefs.length).toBeGreaterThan(0);expect(hrefs.every(h=>h.startsWith('/Personal_AI_Demo/'))).toBe(true);
  await page.getByTestId('nav-care').click();await expect(page.getByTestId('plan-page')).toBeVisible();await page.goBack();await expect(page.getByTestId(route==='/health'?'health-page':'visit-brief')).toBeVisible();await page.goForward();await expect(page.getByTestId('plan-page')).toBeVisible();
  expect(requests).toEqual([]);expect(badAssets).toEqual([]);
});
for(const locale of ['zh-HK','en'])test(`static emotional query survives export redirect refresh and exact symptom resume ${locale}`,async({page,baseURL})=>{
  await page.addInitScript(({demo,locale})=>{if(!localStorage.getItem('caremate-v4'))localStorage.setItem('caremate-v4',JSON.stringify(demo));if(!localStorage.getItem('caremate-v4-preferences'))localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode:false,introComplete:true}));},{demo:createScenario('dizziness'),locale});
  await page.goto(baseURL+'ask?topic=mood');await expect(page).toHaveURL(/\/Personal_AI_Demo\/ask\/\?topic=mood$/);await expect(page.getByTestId('quick-reply-chest-breath')).toHaveCount(0);await page.reload();await expect(page.getByTestId('assistant-resume-symptoms')).toBeVisible();
  await page.getByTestId('ask-input').fill('report');await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');
  const boundary=new URL(page.url()).searchParams.get('message');expect(boundary).toMatch(/^u-free/);expect(new URL(page.url()).pathname).toBe('/Personal_AI_Demo/ask/');
  const persisted=await page.evaluate(()=>localStorage.getItem('caremate-v4'));await page.reload();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');expect(await page.evaluate(()=>localStorage.getItem('caremate-v4'))).toBe(persisted);
  await expect(page.getByTestId('assistant-next')).toHaveAccessibleName(locale==='en'?'Blood test':'血液化驗');
  await expect(page.getByTestId('assistant-navigation-pending')).toBeHidden();
  const storedMessages=JSON.parse(persisted!).assistantSessions.flatMap((s:{messages:{id:string;role:string}[]})=>s.messages);
  for(const invalid of ['u-free-stale',storedMessages.find((m:{role:string})=>m.role==='assistant').id]){
    await page.goto(baseURL+`ask?topic=mood&message=${encodeURIComponent(invalid)}`);await expect(page.getByTestId('chat-log')).toBeEmpty();await expect(page.getByTestId('assistant-next')).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('caremate-v4'))).toBe(persisted);
  }
  await page.getByTestId('assistant-resume-symptoms').click();await page.getByTestId('quick-reply-none').click();await page.getByTestId('ask-input').fill(locale==='en'?'I am feeling low':'心情低落');await page.getByTestId('ask-send').click();await expect(page).toHaveURL(/\/Personal_AI_Demo\/ask\/\?topic=mood$/);await page.reload();await expect(page.getByTestId('assistant-record-only')).toBeVisible();await page.getByTestId('assistant-resume-symptoms').click();await expect(page.getByTestId('quick-reply-after-waking')).toBeVisible();
});

test('static recognized unsupported report urgent and persisted daily record stay offline',async({page,context,baseURL})=>{
  const forbidden:string[]=[];context.on('request',r=>{if(new URL(r.url()).origin!==new URL(baseURL!).origin||/\/api(?:\/|$)/.test(new URL(r.url()).pathname)||!['GET','HEAD'].includes(r.method()))forbidden.push(`${r.method()} ${r.url()}`);});page.on('websocket',s=>forbidden.push(s.url()));
  await page.addInitScript(d=>{if(!localStorage.getItem('caremate-v4'))localStorage.setItem('caremate-v4',JSON.stringify(d));if(!localStorage.getItem('caremate-v4-preferences'))localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale:'zh-HK',liteMode:false,introComplete:true}));},createScenario('dizziness'));
  await page.goto(baseURL+'check-in/');await page.getByTestId('mood-okay').click();await page.getByTestId('checkin-next').click();await page.getByTestId('body-well').click();await page.getByTestId('checkin-next').click();await page.getByTestId('checkin-next').click();await page.getByTestId('checkin-save').click();await expect(page.getByTestId('checkin-receipt')).toBeVisible();await page.reload();await expect(page.getByTestId('checkin-receipt')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4')!).checkIns);expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({patientId:'may',mood:'okay',body:'well'});
  await page.goto(baseURL+'ask/');await page.getByTestId('quick-reply-none').click();
  for(const input of ['weather on Mars','report','medicine']){await page.getByTestId('ask-input').fill(input);await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toBeVisible();}
  await page.getByTestId('ask-input').fill('我現在想傷害自己');await page.getByTestId('ask-send').click();await expect(page.getByTestId('emotional-help')).toBeVisible();await page.reload();await expect(page.getByTestId('emotional-help')).toBeVisible();expect(forbidden).toEqual([]);
});
