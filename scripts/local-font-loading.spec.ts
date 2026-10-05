import {test,expect,type Page} from '@playwright/test';
import {readdirSync,readFileSync} from 'node:fs';
import {createScenario} from '../src/lib/demo/scenarios';
import {translate} from '../src/lib/i18n';

test.use({viewport:{width:390,height:844}});
test.setTimeout(60_000);
const fontCss=new Set(readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')&&readFileSync('.next/static/chunks/'+f,'utf8').includes('@font-face')));
async function seed(page:Page,locale:'zh-HK'|'en',liteMode:boolean,scenario:'first-use'|'day-before-visit'='first-use'){
  const demo=createScenario(scenario);
  await page.addInitScript(({demo,locale,liteMode})=>{if(sessionStorage.getItem('font-test-seeded'))return;sessionStorage.setItem('font-test-seeded','1');localStorage.setItem('caremate-v4',JSON.stringify(demo));localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode,introComplete:false}));},{demo,locale,liteMode});
  await page.addInitScript(()=>{
    const records:{value:number,startTime:number,hadRecentInput:boolean}[]=[];
    (window as Window&{localFontShifts?:typeof records}).localFontShifts=records;
    new PerformanceObserver(list=>{for(const item of list.getEntries()){const shift=item as PerformanceEntry&{value:number,hadRecentInput:boolean};records.push({value:shift.value,startTime:shift.startTime,hadRecentInput:shift.hadRecentInput});}}).observe({type:'layout-shift',buffered:true});
  });
  return demo;
}
async function control(page:Page,name:string){const el=page.getByRole('button',{name,exact:true});await el.focus();await expect(el).toBeFocused();const box=await el.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);await expect(el).toBeInViewport();return el;}
async function state(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4')!));}
async function fullFaces(page:Page){await expect.poll(()=>page.evaluate(()=>document.fonts.size)).toBe(210);await page.evaluate(()=>document.fonts.ready);}
async function layoutEvidence(page:Page,name:string){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const shifts=await page.evaluate(()=>(window as Window&{localFontShifts?:{value:number,startTime:number,hadRecentInput:boolean}[]}).localFontShifts||[]);await test.info().attach(name,{body:JSON.stringify({scope:'Untimed finite layout diagnostic; not Lighthouse/full-matrix acceptance',shifts}),contentType:'application/json'});let best=0,current=0,start=0,last=0;for(const s of shifts.filter(s=>!s.hadRecentInput)){if(s.startTime-last>1000||s.startTime-start>5000){current=0;start=s.startTime;}current+=s.value;last=s.startTime;best=Math.max(best,current);}expect(best,'Finite non-input layout shifts with existing session windows').toBeLessThanOrEqual(.1);}

for(const locale of ['zh-HK','en'] as const)for(const lite of [false,true])for(const mode of ['delayed-css','failed-fonts'] as const){
  test(`local full fonts ${mode}: ${locale} lite=${lite}`,async({page})=>{
    const demo=await seed(page,locale,lite),errors:string[]=[],api:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\//.test(r.url())||new URL(r.url()).origin!=='http://127.0.0.1:3100')api.push(r.url());});
    let release!:()=>void;const gate=new Promise<void>(r=>release=r),blocked:string[]=[];
    if(mode==='delayed-css')await page.route('**/*.css',async route=>{if(fontCss.has(new URL(route.request().url()).pathname.split('/').at(-1)!)){blocked.push(route.request().url());await gate;}await route.continue();});
    else await page.route(/\.(woff2?|ttf)(?:\?|$)/,route=>route.abort('failed'));
    await page.goto('/welcome',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('welcome-page')).toBeVisible();
    if(mode==='delayed-css')await expect.poll(()=>blocked.length).toBeGreaterThan(0);
    const t=(key:Parameters<typeof translate>[0])=>translate(key,locale);
    await expect(page.getByTestId('welcome-page')).toContainText(t('welcome.local'));expect((await state(page)).context).toEqual(demo.context);
    const changed=await control(page,t(lite?'lite.on':'lite.off'));await changed.click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('caremate-v4-preferences')!).liteMode)).toBe(!lite);
    await page.screenshot({path:test.info().outputPath('welcome-before-fonts.png')});
    await (await control(page,t('welcome.start'))).click();await expect(page.getByTestId('nav-today')).toBeAttached();
    expect((await state(page)).healthRecords).toEqual(demo.healthRecords);expect((await state(page)).context).toEqual(demo.context);
    release();await fullFaces(page);await layoutEvidence(page,'welcome-font-layout');await page.goto('/health');await expect(page.getByTestId('health-page')).toBeVisible();
    expect((await state(page)).healthRecords).toEqual(demo.healthRecords);
    await page.screenshot({path:test.info().outputPath('private-after-fonts.png')});
    await page.evaluate(()=>{sessionStorage.setItem('caremate-v4-actor','david');});await page.reload();await expect(page.getByTestId('shared-view')).toBeVisible();await expect(page.getByTestId('shared-empty')).toBeVisible();await expect(page.getByTestId('health-page')).toHaveCount(0);
    expect((await state(page)).healthRecords).toEqual(demo.healthRecords);expect((await state(page)).grants).toEqual(demo.grants);
    await page.screenshot({path:test.info().outputPath('shared-after-fonts.png')});
    expect(errors).toEqual([]);expect(api).toEqual([]);
    await test.info().attach('font-failure-or-delay-and-preserved-domain',{body:JSON.stringify({mode,blocked,fontCount:await page.evaluate(()=>document.fonts.size),fontStatuses:await page.evaluate(()=>[...document.fonts].map(f=>({weight:f.weight,status:f.status}))),errors,api}),contentType:'application/json'});
  });
}

for(const locale of ['zh-HK','en'] as const){
  test(`optional stylesheet chunk failure does not gate protected UI ${locale}`,async({page})=>{
    const demo=await seed(page,locale,false),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const blocked:string[]=[];
    await page.route('**/*.css',route=>{if(fontCss.has(new URL(route.request().url()).pathname.split('/').at(-1)!)){blocked.push(route.request().url());return route.abort('failed');}return route.continue();});
    await page.goto('/welcome');await expect(page.getByTestId('welcome-page')).toBeVisible();await expect.poll(()=>blocked.length).toBeGreaterThan(0);
    await (await control(page,translate('welcome.skip',locale))).click();await page.goto('/health');await expect(page.getByTestId('health-page')).toBeVisible();expect((await state(page)).healthRecords).toEqual(demo.healthRecords);expect(errors).toEqual([]);
    await page.screenshot({path:test.info().outputPath('failed-chunk-readable-private.png')});
  });
  test(`private content and fonts remain behind hydration ${locale}`,async({page})=>{
    const demo=await seed(page,locale,true),requested:string[]=[];page.on('request',r=>requested.push(r.url()));await page.route('**/*.js',route=>route.abort('failed'));
    await page.goto('/health');await expect(page.getByRole('status')).toBeVisible();await expect(page.getByTestId('health-page')).toHaveCount(0);expect(await state(page)).toEqual(demo);expect(requested.filter(u=>fontCss.has(new URL(u).pathname.split('/').at(-1)!))).toEqual([]);
    await page.screenshot({path:test.info().outputPath('hydration-protected-loading.png')});
  });
  test(`print packet is complete immediately and after fonts ${locale}`,async({page})=>{
    await seed(page,locale,false,'day-before-visit');await page.addInitScript(()=>{window.print=()=>{(window as Window&{printCalls?:number}).printCalls=((window as Window&{printCalls?:number}).printCalls||0)+1;};});
    let release!:()=>void;const gate=new Promise<void>(r=>release=r);await page.route('**/*.css',async route=>{if(fontCss.has(new URL(route.request().url()).pathname.split('/').at(-1)!))await gate;await route.continue();});
    await page.goto('/brief',{waitUntil:'domcontentloaded'});await page.getByTestId('brief-confirm').click();await page.goto('/print',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('print-packet')).toBeVisible();const before=await page.getByTestId('print-packet').innerText();const stateBefore=await state(page);
    await (await control(page,translate('packet.openPrint',locale))).click();expect(await page.evaluate(()=>(window as Window&{printCalls?:number}).printCalls)).toBe(1);
    await page.emulateMedia({media:'print'});await page.screenshot({path:test.info().outputPath('immediate-print.png'),fullPage:true});
    release();await fullFaces(page);await layoutEvidence(page,'print-font-layout');expect(await page.getByTestId('print-packet').innerText()).toBe(before);expect(await state(page)).toEqual(stateBefore);await page.screenshot({path:test.info().outputPath('settled-print.png'),fullPage:true});
  });
}
