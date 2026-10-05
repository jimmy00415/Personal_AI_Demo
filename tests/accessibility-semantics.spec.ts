import {test,expect,type Page,type Locator} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createScenario} from '../src/lib/demo/scenarios';
import {isDemoState} from '../src/lib/demo/persistence';
import {setConsent} from '../src/lib/demo/sharing';
import {openBriefDraft,confirmBrief} from '../src/lib/demo/brief';
import type {DemoState} from '../src/lib/demo/types';

test.setTimeout(90_000);
test.use({viewport:{width:390,height:844},actionTimeout:10_000});
const ruleIds=['aria-allowed-role','landmark-one-main','region'];
async function seed(page:Page,demo:DemoState,locale:string,liteMode:boolean){
 expect(isDemoState(demo)).toBe(true);
 await page.addInitScript(({demo,locale,liteMode})=>{if(!localStorage.getItem('caremate-v4'))localStorage.setItem('caremate-v4',JSON.stringify(demo));if(!localStorage.getItem('caremate-v4-preferences'))localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode,introComplete:true}));},{demo,locale,liteMode});
 const forbidden:string[]=[];page.on('request',r=>{const url=new URL(r.url());if(url.origin!==new URL(test.info().project.use.baseURL!).origin||/\/api(?:\/|$)/.test(url.pathname)||!['GET','HEAD'].includes(r.method()))forbidden.push(r.url());});return forbidden;
}
async function evidence(page:Page,label:string){
 await page.evaluate(async()=>{await document.fonts.ready;});
 const settling=await page.evaluate(async()=>{const frames:unknown[]=[];let previous='',stable=0;for(let n=0;n<120;n++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const dialogs=[...document.querySelectorAll('[role=dialog]')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});const animations=document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect&&a.effect.target?.matches('[role=dialog]')).map(a=>({state:a.playState,name:a instanceof CSSAnimation?a.animationName:'transition'}));const current=JSON.stringify(dialogs);stable=current===previous&&!animations.some(a=>a.state==='running')?stable+1:0;previous=current;frames.push({dialogs,animations});if(stable>=3)return {settled:true,frames};}return {settled:false,frames};});
 expect(settling.settled,'Actual dialog geometry remains stable after entry motion').toBe(true);
 const axe=await new AxeBuilder({page}).analyze();
 const dom=await page.evaluate(()=>({url:location.href,mainCount:document.querySelectorAll('main').length,bodyText:document.body.innerText,state:JSON.parse(localStorage.getItem('caremate-v4')!),dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>{const id=el.getAttribute('aria-labelledby'),title=id?document.getElementById(id):null;const geometry=(e:Element)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {rect:r.toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,margin:s.margin,padding:s.padding};};return {tag:el.tagName,titleTag:title?.tagName,titleText:title?.textContent,panel:geometry(el),title:title?geometry(title):null,html:el.outerHTML};})}));
 await test.info().attach(label,{body:JSON.stringify({axe,dom,settling,accessibleTree:await page.locator('body').ariaSnapshot()}),contentType:'application/json'});
 await page.screenshot({path:test.info().outputPath(label+'.png')});return {axe,dom};
}
async function modal(page:Page,opener:Locator,label:string){
 await opener.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog).toHaveAccessibleName(/.+/);
 const proof=await evidence(page,label);
 if(label==='health-sheet')await readableText(page,page.locator('#observation-format'),'observation-format');
 if(label==='health-reading-sheet')await readableText(page,dialog.locator('p').filter({hasText:/^(Entered|輸入時間|記錄輸入時間|加入時間)/}).first(),'health-entered-time');
 expect.soft(proof.axe.violations.filter(v=>v.id==='aria-allowed-role'),label+' valid dialog role').toEqual([]);
 expect.soft(await dialog.getByRole('heading',{level:2}).count(),label+' navigable named title').toBe(1);
 if(await dialog.getByRole('heading',{level:2}).count())expect.soft(await dialog.getByRole('heading',{level:2}).textContent()).toBe(proof.dom.dialogs[0].titleText);
 await expect(page.locator('body > div').first()).toHaveAttribute('inert','');
 for(const key of ['Tab','Shift+Tab'])for(let i=0;i<12;i++){await page.keyboard.press(key);expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();await expect(page.locator('body > div').first()).not.toHaveAttribute('inert','');
}
async function readableText(page:Page,target:Locator,label:string){
 await expect(target).toBeVisible();const dialog=page.getByRole('dialog');const box=await dialog.boundingBox();expect(box).not.toBeNull();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 const scrollSteps:unknown[]=[];for(let n=0;n<12;n++){const geometry=await target.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight};});scrollSteps.push(geometry);if(geometry.top>=0&&geometry.bottom<=geometry.viewport)break;await page.mouse.wheel(0,geometry.top<0?-180:180);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));}
 const proof=await target.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()].map(r=>r.toJSON()),style=getComputedStyle(el),ancestors: {tag:string;className:string;rect:DOMRect;overflowX:string;overflowY:string;color:string;background:string;opacity:string;scrollTop:number}[]=[];for(let p:Element|null=el;p;p=p.parentElement){const s=getComputedStyle(p);ancestors.push({tag:p.tagName,className:p.className,rect:p.getBoundingClientRect().toJSON(),overflowX:s.overflowX,overflowY:s.overflowY,color:s.color,background:s.backgroundColor,opacity:s.opacity,scrollTop:p.scrollTop});}const points=rects.map(r=>({x:r.x+r.width/2,y:r.y+r.height/2,stack:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).map(p=>({tag:p.tagName,className:p.className})),targetHit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));return {text:el.textContent,rects,foreground:style.color,background:style.backgroundColor,ancestors,points,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},scroll:{x:scrollX,y:scrollY},allTextWithinViewport:rects.every(r=>r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),allTextWithinClips:rects.every(r=>ancestors.every(a=>!['auto','scroll','hidden','clip'].includes(a.overflowY)||r.top>=a.rect.top&&r.bottom<=a.rect.bottom))};});
 await test.info().attach(label+'-actual-raster-stack-and-clip',{body:JSON.stringify({scrollSteps,...proof,contrastDisposition:'Computed styles and actual stacking retained for technical assessment; no native screen-reader or blanket contrast-pass claim.'}),contentType:'application/json'});await page.screenshot({path:test.info().outputPath(label+'.png')});expect(proof.allTextWithinViewport).toBe(true);expect(proof.allTextWithinClips).toBe(true);expect(proof.points.every(p=>p.targetHit)).toBe(true);
}
async function main(page:Page,label:string){const proof=await evidence(page,label);expect.soft(await page.getByRole('main').count(),label+' exactly one accessible main').toBe(1);expect.soft(proof.axe.violations.filter(v=>ruleIds.includes(v.id)),label+' landmark findings').toEqual([]);return page.getByRole('main');}

for(const locale of ['zh-HK','en'] as const)for(const liteMode of [false,true]){
 test(`sheet title and native modal access ${locale} lite=${liteMode}`,async({page})=>{
  const forbidden=await seed(page,createScenario('routine-day'),locale,liteMode);
  await page.goto('/health');await page.getByTestId('health-tab-measurements').click();await modal(page,page.getByTestId('add-observation'),'health-sheet');await modal(page,page.getByTestId('bp-row-bp-16'),'health-reading-sheet');
  await page.goto('/memory');await expect(page.getByTestId('memory-page')).toBeVisible();await modal(page,page.getByTestId('memory-mem-pen'),'memory-sheet');expect(forbidden).toEqual([]);
 });
 test(`chrome-free instructions retain main ownership ${locale} lite=${liteMode}`,async({page,context})=>{
  const forbidden=await seed(page,createScenario('dizziness'),locale,liteMode);
  await page.goto('/help');await expect(page.getByTestId('help-recheck')).toBeVisible();await main(page,'help-recheck');
  await page.goto('/ask');await page.getByTestId('quick-reply-chest-breath').click();await expect(page.getByTestId('physical-help')).toBeVisible();const urgent=await main(page,'urgent-ask');expect.soft(await urgent.getByTestId('physical-help').count()).toBe(1);expect.soft(await urgent.getByTestId('em-back').count()).toBe(1);
  await page.getByTestId('em-how').click();await expect(page.getByTestId('em-how-body')).toBeVisible();await main(page,'urgent-expanded');
  await page.goto('/welcome');await expect(page.getByTestId('welcome-page')).toBeVisible();await main(page,'welcome');expect(forbidden).toEqual([]);
  const personal=await context.newPage();await personal.goto('/dev');await personal.getByTestId('scenario-day-before-visit').click();await personal.goto('/brief');await personal.getByTestId('brief-confirm').click();await personal.getByTestId('visit-print').click();await expect(personal.getByTestId('print-view')).toBeVisible();await main(personal,'patient-print');
  const granted=setConsent(createScenario('day-before-visit'),{patientId:'may',recipientId:'david',level:'full',categories:['body','mood','measurements','medication','appointments']});expect(granted.ok).toBe(true);if(!granted.ok)throw Error(granted.code);
  const opened=openBriefDraft(granted.value,granted.value.appointments[0].id,'david');expect(opened.ok).toBe(true);if(!opened.ok)throw Error(opened.code);const confirmed=confirmBrief(opened.value,opened.value.briefs.at(-1)!.id);expect(confirmed.ok).toBe(true);if(!confirmed.ok)throw Error(confirmed.code);
  const caregiverContext=await context.browser()!.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844},serviceWorkers:'block'});try{const caregiver=await caregiverContext.newPage(),demo={...confirmed.value,context:{actorId:'david' as const,patientId:'may' as const,perspective:'caregiver' as const}};const denied=await seed(caregiver,demo,locale,liteMode);await caregiver.goto('/print?brief='+encodeURIComponent(confirmed.value.briefs.at(-1)!.id));await expect(caregiver.getByTestId('print-view')).toBeVisible();await main(caregiver,'caregiver-print');expect(denied).toEqual([]);}finally{await caregiverContext.close();}
 });
 test(`check-in progress remains readable without a prohibited name ${locale} lite=${liteMode}`,async({page})=>{
  const forbidden=await seed(page,createScenario('routine-day'),locale,liteMode);await page.goto('/check-in');await expect(page.getByTestId('checkin-page')).toBeVisible();
  for(let index=1;index<=4;index++){const progress=page.getByTestId('checkin-page').locator('p').filter({hasText:new RegExp('^'+index+' / 4$')});await expect(progress).toBeVisible();const proof=await evidence(page,'progress-'+index);expect.soft(await progress.getAttribute('aria-label'),'Plain progress has no prohibited accessible name').toBeNull();expect.soft([...proof.axe.violations,...proof.axe.incomplete].filter(v=>v.id==='aria-prohibited-attr'&&v.nodes.some(n=>n.html.includes(`${index} / 4`))),'No targeted progress prohibited-name finding').toEqual([]);if(index===1)await page.getByTestId('mood-okay').click();if(index===2)await page.getByTestId('body-well').click();if(index<4)await page.getByTestId('checkin-next').click();}
  expect(forbidden).toEqual([]);
 });
}
