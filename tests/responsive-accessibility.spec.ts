import {test,expect,chromium,type Page,type Locator} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createScenario} from '../src/lib/demo/scenarios';
import type {ScenarioId} from '../src/lib/demo/types';

const routes: {route:string;scenario:ScenarioId;ready:string;primary?:string}[]=[
  {route:'/welcome',scenario:'first-use',ready:'welcome-page'},
  {route:'/',scenario:'routine-day',ready:'today-page',primary:'daily-check-in'},
  {route:'/check-in',scenario:'routine-day',ready:'checkin-page',primary:'mood-okay'},
  {route:'/ask',scenario:'dizziness',ready:'chat-page',primary:'quick-reply-none'},
  {route:'/help',scenario:'urgent-help',ready:'help-recheck'},
  {route:'/health',scenario:'routine-day',ready:'health-page',primary:'health-tab-measurements'},
  {route:'/care',scenario:'routine-day',ready:'plan-page',primary:'care-task-amlo'},
  {route:'/book',scenario:'routine-day',ready:'book-page',primary:'slot-slot-17-1100'},
  {route:'/brief',scenario:'day-before-visit',ready:'visit-brief',primary:'brief-confirm'},
  {route:'/report',scenario:'routine-day',ready:'lab-page',primary:'add-q-q-hba1c-follow'},
  {route:'/print',scenario:'day-before-visit',ready:'print-view'},
  {route:'/family',scenario:'caregiver-alert',ready:'shared-view'},
  {route:'/sharing',scenario:'share-needed',ready:'sharing-page',primary:'sharing-review'},
  {route:'/notifications',scenario:'caregiver-alert',ready:'shared-view'},
  {route:'/memory',scenario:'routine-day',ready:'memory-page',primary:'memory-mem-pen'},
  {route:'/settings',scenario:'routine-day',ready:'settings-page'},
  {route:'/about',scenario:'routine-day',ready:'about-page'},
];
test.describe.configure({timeout:240_000});
test.use({actionTimeout:10_000,navigationTimeout:20_000});
async function targetGeometry(control:Locator) {
  await control.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})); await expect(control).toBeVisible();
  const geometry=await control.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,visible:r.top>=0&&r.bottom<=innerHeight,hit:[.15,.5,.85].every(f=>el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height*f)))}});
  expect.soft(geometry.width).toBeGreaterThanOrEqual(44);expect.soft(geometry.height).toBeGreaterThanOrEqual(44);expect.soft(geometry.visible).toBe(true);expect.soft(geometry.hit,'Action must not be covered by fixed navigation or overlay').toBe(true);
  return geometry;
}
async function inspect(page:Page,name:string,primary?:Locator) {
  const settling=await page.evaluate(async()=>{
    await document.fonts.ready;const frames:unknown[]=[];let previous='',stable=0;
    for(let n=0;n<120;n++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const dialogs=[...document.querySelectorAll('[role=dialog]')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
      const animations=document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect&&a.effect.target?.matches('[role=dialog]')).map(a=>({state:a.playState,name:a instanceof CSSAnimation?a.animationName:'transition'}));
      const current=JSON.stringify(dialogs);stable=current===previous&&!animations.some(a=>a.state==='running')?stable+1:0;previous=current;frames.push({dialogs,animations});
      if(stable>=3)return {settled:true,frames};
    }
    return {settled:false,frames};
  });
  await test.info().attach(`${name}-settling`,{body:JSON.stringify(settling),contentType:'application/json'});
  expect(settling.settled,'Dialog geometry must remain unchanged across three frames after entry motion ends').toBe(true);
  const geometry=primary ? await targetGeometry(primary) : null;
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,lang:document.documentElement.lang,body:document.body.innerText.length,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
  expect.soft(layout.scrollWidth,`${name} document overflow`).toBeLessThanOrEqual(layout.width+1);expect.soft(layout.body).toBeGreaterThan(20);
  const results=await new AxeBuilder({page}).analyze();
  await test.info().attach(`${name}-axe-and-layout`,{body:JSON.stringify({layout,geometry,settling,axe:results}),contentType:'application/json'});
  expect.soft(results.violations.filter(v=>v.impact==='serious'||v.impact==='critical'),`${name} axe serious/critical`).toEqual([]);
  expect.soft(results.violations.filter(v=>['aria-allowed-role','landmark-one-main','region'].includes(v.id)),`${name} proven semantic rules`).toEqual([]);
  expect.soft([...results.violations,...results.incomplete].filter(v=>v.id==='aria-prohibited-attr'&&v.nodes.some(n=>/aria-label="[1-4] \/ 4"/.test(n.html))),`${name} plain progress naming`).toEqual([]);
  if(page.viewportSize()===null){const cdp=await page.context().newCDPSession(page);const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});const png=Buffer.from(capture.data,'base64');await(await import('node:fs/promises')).writeFile(test.info().outputPath(`${name}.png`),png);const physical=await page.evaluate(()=>({width:Math.round(innerWidth*devicePixelRatio),height:Math.round(innerHeight*devicePixelRatio)}));expect(png.readUInt32BE(16)).toBe(physical.width);expect(png.readUInt32BE(20)).toBe(physical.height);await cdp.detach();}
  else await page.screenshot({path:test.info().outputPath(`${name}.png`),fullPage:false});
}
async function modalKeyboard(page:Page,opener:Locator){
  const dialog=page.getByRole('dialog');await expect(dialog).toHaveAccessibleName(/.+/);
  await expect(page.locator('body > div').first()).toHaveAttribute('inert','');
  const focused=await page.evaluate(()=>document.activeElement?.outerHTML);expect(focused).toBeTruthy();
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
  for(let i=0;i<12;i++){await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
}
async function inspectStates(page:Page,entry:typeof routes[number],locale:string){
      if(entry.route==='/check-in'){
        await page.getByTestId('mood-okay').click();await page.getByTestId('checkin-next').click();await inspect(page,'checkin-body',page.getByTestId('body-well'));
        await page.getByTestId('body-well').click();await page.getByTestId('checkin-next').click();await page.locator('#checkin-note').fill(locale==='en'?'Fictional long note about ordinary daily activities and questions. '.repeat(8):'虛構的長備註，描述日常活動以及希望覆診時詢問的問題。'.repeat(8));
        await inspect(page,'checkin-note',page.getByTestId('checkin-next'));await page.getByTestId('checkin-next').click();await inspect(page,'checkin-review',page.getByTestId('checkin-save'));await page.getByTestId('checkin-save').click();await inspect(page,'checkin-receipt',page.getByTestId('checkin-view-record'));
        await page.getByTestId('checkin-view-record').click();await page.getByTestId('health-tab-records').click();const opener=page.getByTestId(/checkin-record-/);await opener.click();await inspect(page,'checkin-detail',page.getByTestId('checkin-correct'));await modalKeyboard(page,opener);
      }
      if(entry.route==='/ask'){await page.getByTestId('quick-reply-chest-breath').click();await inspect(page,'urgent',page.getByTestId('em-how'));await page.getByTestId('em-how').click();await inspect(page,'urgent-how',page.getByTestId('em-back'));}
      if(entry.route==='/health'){
        await page.getByTestId('health-tab-measurements').click();await expect(page.getByRole('table')).toBeVisible();await expect(page.getByRole('columnheader')).toHaveCount(3);await inspect(page,'measurement-table',page.getByTestId('add-observation'));
        const add=page.getByTestId('add-observation');await add.click();await inspect(page,'measurement-add',page.getByTestId('observation-save'));await page.getByTestId('observation-save').click();await expect(page.getByTestId('observation-error')).toBeVisible();await inspect(page,'measurement-errors',page.getByTestId('observation-save'));await modalKeyboard(page,add);
        const row=page.getByTestId('bp-row-bp-16');await row.click();await inspect(page,'measurement-edit',page.getByTestId('observation-save'));await modalKeyboard(page,row);
      }
      if(entry.route==='/care'){
        await page.getByTestId('care-task-amlo').click();await inspect(page,'dose-detail',page.getByTestId('dose-user_confirmed_taken'));await page.getByTestId('dose-user_confirmed_taken').click();await inspect(page,'dose-receipt',page.getByTestId('dose-unknown'));await page.getByTestId('dose-unknown').click();
        await page.getByTestId('task-change').click();await inspect(page,'time-edit',page.getByTestId('reminder-save'));await page.getByTestId('reminder-save').click();await page.getByTestId('task-snooze').click();await inspect(page,'time-snooze',page.getByTestId('reminder-save'));await page.getByTestId('reminder-save').click();await page.getByTestId('task-cancel').click();await inspect(page,'task-cancel',page.getByTestId('task-cancel-confirm'));
        await page.getByTestId('task-detail').getByRole('button').first().click();await page.locator('#aftervisit-text').fill(locale==='en'?'Fictional follow-up note and supplied task. '.repeat(8):'虛構的覆診後備註與本人提供的事項。'.repeat(8));await page.getByTestId('aftervisit-preview').click();await inspect(page,'aftervisit-preview',page.getByTestId('aftervisit-save'));await page.getByTestId('aftervisit-save').click();await inspect(page,'aftervisit-receipt');
      }
      if(entry.route==='/book'){
        await page.getByTestId('slot-slot-17-1100').click();await page.getByTestId('book-review-open').click();await inspect(page,'booking-review',page.getByTestId('book-confirm'));await page.getByTestId('book-confirm').click();await inspect(page,'booking-receipt',page.getByTestId('book-change'));await page.getByTestId('book-cancel').click();await inspect(page,'booking-cancel',page.getByTestId('book-cancel-confirm'));await page.getByTestId('book-cancel-confirm').click();await inspect(page,'booking-cancelled');
      }
      if(entry.route==='/sharing'){
        await page.getByTestId('category-body').check();await page.getByTestId('sharing-review').click();await inspect(page,'sharing-preview',page.getByTestId('sharing-confirm'));await page.getByTestId('sharing-confirm').click();await page.getByTestId('sharing-revoke').click();await inspect(page,'sharing-revoke',page.getByTestId('revoke-confirm'));
      }
      if(entry.route==='/brief'){await page.getByTestId('brief-confirm').click();await inspect(page,'brief-confirmed',page.getByTestId('visit-print'));}
      if(entry.route==='/notifications'){
        const open=page.getByTestId('event-open-event-fixture-attention');await open.click();await inspect(page,'event-detail',page.getByTestId('event-accept'));await page.getByTestId('event-note').fill(locale==='en'?'Fictional response note. '.repeat(8):'虛構的回覆備註。'.repeat(8));await page.getByTestId('event-accept').click();await inspect(page,'event-accepted',page.getByTestId('event-resolve'));await page.getByTestId('event-resolve').click();await inspect(page,'event-completed');
      }
      if(entry.route==='/settings'){await page.getByTestId('clear-device-data').click();await inspect(page,'clear-confirm',page.getByTestId('clear-device-confirm'));}
      if(entry.route==='/memory'){
        const opener=page.getByTestId('memory-mem-pen');await opener.click();await inspect(page,'memory-detail');await modalKeyboard(page,opener);await opener.click();await page.getByRole('button',{name:locale==='en'?'Correct':'更正',exact:true}).click();await page.getByLabel(locale==='en'?'Corrected content':'更正內容').fill('𠮷龘 May 香港，fictional personal note. '.repeat(8));await inspect(page,'memory-edit',page.getByRole('button',{name:locale==='en'?'Save':'儲存',exact:true}));await page.keyboard.press('Escape');
        await opener.click();await page.getByRole('button',{name:locale==='en'?'Stop using for personalisation':'不再用作個人化建議',exact:true}).click();await inspect(page,'memory-stop',page.getByRole('button',{name:locale==='en'?'Stop using for personalisation':'不再用作個人化建議',exact:true}));
      }
}
for(const width of [320,390,430,768,1024,1440])for(const locale of ['zh-HK','en'])for(const liteMode of [false,true])test(`all routes overlays width=${width} locale=${locale} lite=${liteMode}`,async({browser,baseURL})=>{
  for(const entry of routes)await test.step(entry.route,async()=>{
    const context=await browser.newContext({viewport:{width,height:900},baseURL,reducedMotion:liteMode?'reduce':'no-preference',serviceWorkers:'block'});
    const forbidden:string[]=[];context.on('request',r=>{if(new URL(r.url()).origin!==new URL(baseURL!).origin||/\/api(?:\/|$)/.test(new URL(r.url()).pathname))forbidden.push(r.url());});
    const demo=createScenario(entry.scenario);
    await context.addInitScript(({demo,locale,liteMode})=>{if(!localStorage.getItem('caremate-v4'))localStorage.setItem('caremate-v4',JSON.stringify(demo));if(!localStorage.getItem('caremate-v4-preferences'))localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode,introComplete:true}));},{demo,locale,liteMode});
    const page=await context.newPage();const label=entry.route.slice(1)||'today';
    try{
      if(entry.route==='/print'){await page.goto('/brief');await page.getByTestId('brief-confirm').click();await page.getByTestId('visit-print').click();}
      else await page.goto(entry.route);
      await expect(page.getByTestId(entry.ready)).toBeVisible();
      await inspect(page,label,entry.primary?page.getByTestId(entry.primary):undefined);
      await inspectStates(page,entry,locale);
      expect(forbidden).toEqual([]);
    }finally{await context.close();}
  });
});

for(const locale of ['zh-HK','en'])for(const liteMode of [false,true])test(`genuine Chromium browser zoom 200 percent ${locale} lite=${liteMode}`,async({baseURL})=>{
  const fs=await import('node:fs/promises'),path=await import('node:path'),os=await import('node:os');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'caremate-zoom-'));const extension=path.join(root,'extension'),profile=path.join(root,'profile');await fs.mkdir(extension);
  await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'CareMate acceptance browser zoom',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  await fs.writeFile(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(() => {});');
  const context=await chromium.launchPersistentContext(profile,{executablePath:chromium.executablePath(),channel:'chromium',headless:true,chromiumSandbox:true,viewport:null,deviceScaleFactor:undefined,ignoreDefaultArgs:true,args:['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--window-size=1200,900',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,`--user-data-dir=${profile}`,'--remote-debugging-pipe','about:blank'],serviceWorkers:'allow',reducedMotion:'reduce'});
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const page=context.pages()[0]||await context.waitForEvent('page');
    const forbidden:string[]=[];context.on('request',r=>{if(new URL(r.url()).origin!==new URL(baseURL!).origin||/\/api(?:\/|$)/.test(new URL(r.url()).pathname)||!['GET','HEAD'].includes(r.method()))forbidden.push(r.url());});context.on('serviceworker',w=>{if(!w.url().startsWith('chrome-extension://'))forbidden.push(w.url());});page.on('websocket',s=>forbidden.push(s.url()));
    for(const entry of routes){
      await page.goto(baseURL+'/dev');await page.evaluate(({demo,locale,liteMode})=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('caremate-v4',JSON.stringify(demo));localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode,introComplete:true}));},{demo:createScenario(entry.scenario),locale,liteMode});
      if(entry.route==='/print'){await page.goto(baseURL+'/brief');await page.getByTestId('brief-confirm').click();await page.getByTestId('visit-print').click();}else await page.goto(baseURL+entry.route);
      await expect(page.getByTestId(entry.ready)).toBeVisible();await page.bringToFront();
      await worker.evaluate(async()=>{const api=(globalThis as unknown as {chrome:{tabs:{query:(q:object)=>Promise<{id:number}[]>;setZoom:(id:number,f:number)=>Promise<void>}}}).chrome;const [tab]=await api.tabs.query({active:true,lastFocusedWindow:true});await api.tabs.setZoom(tab.id,1);});
      await expect.poll(()=>page.evaluate(()=>innerWidth/outerWidth)).toBeGreaterThan(.9);
      const baseline=await page.evaluate(()=>({outerWidth,outerHeight,innerWidth,innerHeight}));
      const result=await worker.evaluate(async()=>{
        const api=(globalThis as unknown as {chrome:{tabs:{query:(query:object)=>Promise<{id:number}[]>;setZoomSettings:(id:number,settings:object)=>Promise<void>;setZoom:(id:number,factor:number)=>Promise<void>;getZoom:(id:number)=>Promise<number>;getZoomSettings:(id:number)=>Promise<object>}}}).chrome;
        const [tab]=await api.tabs.query({active:true,lastFocusedWindow:true});await api.tabs.setZoomSettings(tab.id,{mode:'automatic',scope:'per-tab'});await api.tabs.setZoom(tab.id,2);return {factor:await api.tabs.getZoom(tab.id),settings:await api.tabs.getZoomSettings(tab.id)};
      });
      await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeLessThan(baseline.innerWidth*.51);
      const actual=await page.evaluate(()=>({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio,visualScale:visualViewport?.scale,htmlZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom}));
      expect(result.factor).toBe(2);expect(result.settings).toMatchObject({mode:'automatic',scope:'per-tab'});expect(actual.outerWidth).toBe(baseline.outerWidth);expect(actual.outerHeight).toBe(baseline.outerHeight);expect(actual.visualScale).toBe(1);expect(actual.htmlZoom).toBe('1');expect(actual.bodyZoom).toBe('1');
      await inspect(page,`zoom-${entry.route.slice(1)||'today'}`,entry.primary?page.getByTestId(entry.primary):undefined);
      const cdp=await context.newCDPSession(page);const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});const png=Buffer.from(capture.data,'base64');await test.info().attach(`zoom-${entry.route.slice(1)||'today'}-raw-cdp`,{body:png,contentType:'image/png'});
      await test.info().attach(`zoom-${entry.route.slice(1)||'today'}-proof`,{body:JSON.stringify({baseline,actual,api:result,pngWidth:png.readUInt32BE(16),pngHeight:png.readUInt32BE(20),note:'PNG dimensions retained for visual-capture interpretation; real zoom proven by Tabs API and unchanged outer/halved inner geometry.'}),contentType:'application/json'});await cdp.detach();
      await inspectStates(page,entry,locale);
      expect(forbidden).toEqual([]);
    }
  }finally{await context.close();await test.info().attach('zoom-cleanup',{body:JSON.stringify({closed:true,temporaryProfile:profile,extension}),contentType:'application/json'});}
});
