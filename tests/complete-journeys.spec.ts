import {test, expect, type Page, type Locator} from '@playwright/test';
import {createScenario} from '../src/lib/demo/scenarios';
import {isDemoState} from '../src/lib/demo/persistence';
import type {BriefPacket, DemoState, ScenarioId} from '../src/lib/demo/types';
import {readFileSync} from 'node:fs';

// These tests would fail if saves disappeared, patient/context boundaries drifted,
// consent was bypassed, acknowledgement completed work, or the app called a service.
test.describe.configure({timeout: 90_000});
test.use({actionTimeout:10_000,navigationTimeout:20_000});
const snapshot = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem('caremate-v4')!));
async function tabTo(target:Locator){for(let i=0;i<80;i++){if(await target.evaluate(el=>el===document.activeElement))return;await target.page().keyboard.press('Tab');}throw Error('Control is not keyboard reachable: '+await target.getAttribute('data-testid'));}
async function secondary(page: Page, id: string) { await page.getByTestId('profile-menu-btn').click(); await page.getByTestId(id).click(); }
function trackBriefRequests(page:Page){const requests:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/brief')requests.push(`${r.method()} ${r.url()}`);});return requests;}
async function ordinaryMoodBrief(page:Page){
  const before=await snapshot(page);await page.getByTestId('assistant-next').click();await expect(page.getByTestId('visit-brief')).toBeVisible();
  const after=await snapshot(page);for(const key of ['episodes','healthRecords','medicationDoses','tasks','checkIns','assistantSessions'] as const)expect(after[key]).toEqual(before[key]);
  await page.goBack();await expect(page.getByTestId('assistant-record-only')).toBeVisible();
}
async function initial(page: Page, scenario: ScenarioId, locale = 'zh-HK', introComplete = true) {
  const demo = createScenario(scenario); expect(isDemoState(demo)).toBe(true);
  await page.addInitScript(({demo, locale, introComplete}) => {
    if (sessionStorage.getItem('acceptance-initialized')) return;
    sessionStorage.setItem('acceptance-initialized', '1');
    localStorage.setItem('caremate-v4', JSON.stringify(demo));
    localStorage.setItem('caremate-v4-preferences', JSON.stringify({locale, liteMode: false, introComplete}));
  }, {demo, locale, introComplete});
}
async function roleBoundary(page: Page, actorId: 'may'|'david') {
  const before = await snapshot(page);
  await page.goto('/dev'); await page.getByTestId(`perspective-${actorId}`).click();
  const after = await snapshot(page);
  expect(after.context).toEqual({actorId, patientId:'may', perspective:actorId==='may'?'patient':'caregiver'});
  for (const key of ['healthRecords','checkIns','medicationDoses','grants','events','tasks','appointments'] as const) expect(after[key], `Role boundary preserves ${key}`).toEqual(before[key]);
  await test.info().attach(`researcher-role-${actorId}`, {body:JSON.stringify({before:before.context, after:after.context, preservedIds:before.healthRecords.map(r=>r.id)}), contentType:'application/json'});
  await page.goto('/');
  if (actorId === 'may') await page.getByTestId('today-events').click();
}
test.beforeEach(async ({page,context,baseURL}) => {
  const forbidden: string[] = [], errors: string[] = [];
  const timeline: unknown[] = [];
  context.on('request',r=>timeline.push({event:'request',at:Date.now(),url:r.url(),method:r.method()}));
  context.on('response',r=>timeline.push({event:'response',at:Date.now(),url:r.url(),status:r.status()}));
  context.on('requestfinished',r=>timeline.push({event:'requestfinished',at:Date.now(),url:r.url()}));
  context.on('requestfailed',r=>timeline.push({event:'requestfailed',at:Date.now(),url:r.url(),failure:r.failure()}));
  page.on('pageerror',e=>timeline.push({event:'pageerror',at:Date.now(),url:page.url(),message:e.message,stack:e.stack}));
  page.on('framenavigated',f=>{if(f===page.mainFrame())timeline.push({event:'main-frame-navigation',at:Date.now(),url:f.url()});});
  context.on('request', r => {const u=new URL(r.url()); if(u.origin!==new URL(baseURL!).origin || /\/api(?:\/|$)/.test(u.pathname) || !['GET','HEAD'].includes(r.method())) forbidden.push(`${r.method()} ${r.url()}`);});
  context.on('serviceworker', worker=>forbidden.push(`worker ${worker.url()}`));
  page.on('websocket',socket=>forbidden.push(`websocket ${socket.url()}`));
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.exposeFunction('acceptanceNetworkResult',()=>({forbidden,errors,timeline}));
});
test.afterEach(async ({page}) => {
  if(page.isClosed()) return;
  const result=await page.evaluate(async()=>await (window as unknown as {acceptanceNetworkResult:()=>Promise<{forbidden:string[];errors:string[]}>}).acceptanceNetworkResult());
  await test.info().attach('passive-network-and-console',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.forbidden).toEqual([]); expect(result.errors).toEqual([]);
});

for(const locale of ['zh-HK','en']) test(`J1 R1 R9 ordinary first-use daily record correction and reload ${locale}`,async({page})=>{
  await initial(page,'first-use',locale,false); await page.goto('/');
  await page.getByRole('button',{name:locale==='en'?'Start using CareMate':'開始使用康伴',exact:true}).click();
  await page.getByTestId('daily-check-in').click();
  await page.getByTestId('mood-low').click(); await page.getByTestId('checkin-next').click();
  await page.getByTestId('body-tired').click(); await page.getByTestId('checkin-next').click();
  await page.locator('#checkin-note').fill(locale==='en'?'Fictional note: I would like to rest today.':'虛構紀錄：今天想休息。');
  await page.getByTestId('checkin-next').click(); await expect(page.getByTestId('checkin-review')).toBeVisible();
  await page.getByTestId('checkin-edit').click(); await page.getByTestId('mood-okay').click();
  for(let i=0;i<3;i++)await page.getByTestId('checkin-next').click();
  await page.getByTestId('checkin-save').click(); await expect(page.getByTestId('checkin-receipt')).toBeVisible();
  const saved=await snapshot(page);expect(saved.checkIns).toHaveLength(1);expect(saved.checkIns[0]).toMatchObject({patientId:'may',mood:'okay',body:'tired',revision:1,occurredAt:'2026-09-16T08:45:00+08:00'});
  await page.getByTestId('checkin-view-record').click();await page.getByTestId('health-tab-records').click();await page.getByTestId(`checkin-record-${saved.checkIns[0].id}`).click();
  await page.getByTestId('checkin-correct').click();await page.getByTestId('mood-good').click();for(let i=0;i<3;i++)await page.getByTestId('checkin-next').click();
  await page.getByTestId('checkin-save').click();await page.reload();await expect(page.getByTestId('checkin-receipt')).toBeVisible();
  const final=await snapshot(page);expect(final.checkIns).toHaveLength(1);expect(final.checkIns[0]).toMatchObject({id:saved.checkIns[0].id,mood:'good',revision:2});
});

for(const response of ['accept','decline'] as const)test(`J5 J8 R4 R5 R8 May creates and offers task David ${response}s May receives and withdraws`,async({page})=>{
  await initial(page,'after-visit');await page.goto('/');
  await secondary(page,'link-privacy');await page.getByTestId('level-full').check();await page.getByTestId('category-body').check();
  await expect(page.getByTestId('category-mood')).not.toBeChecked();await page.getByTestId('sharing-review').click();await page.getByTestId('sharing-confirm').click();
  await page.getByTestId('nav-care').click();await page.locator('#aftervisit-text').fill('Fictional clinic instruction: organise the question list.');await page.locator('#aftervisit-time').fill('2026-09-23T15:00');
  await page.getByTestId('aftervisit-preview').click();await expect(page.locator('#aftervisit-category')).toHaveValue('private');await expect(page.locator('#aftervisit-owner')).toHaveValue('may');
  await page.locator('#aftervisit-category').selectOption('body');await page.locator('#aftervisit-owner').selectOption('david');await page.getByTestId('aftervisit-save').click();
  await expect(page.getByTestId('aftervisit-receipt')).toBeVisible();const offered=await snapshot(page);const task=offered.tasks.at(-1)!;const event=offered.events.find(e=>e.taskId===task.id)!;
  expect(task).toMatchObject({patientId:'may',ownerId:'may',proposedOwnerId:'david',shareCategory:'body',status:'scheduled'});expect(event.status).toBe('pending');
  await roleBoundary(page,'david');await page.getByTestId(`event-open-${event.id}`).click();await page.getByTestId('event-note').fill(`Fictional ${response} response`);await page.getByTestId(`event-${response}`).click();
  const responded=await snapshot(page);expect(responded.tasks.find(t=>t.id===task.id)?.ownerId).toBe(response==='accept'?'david':'may');expect(responded.tasks.find(t=>t.id===task.id)?.status).toBe(response==='accept'?'scheduled':'pending');
  await roleBoundary(page,'may');await page.getByTestId(`event-open-${event.id}`).click();await expect(page.getByTestId('event-detail')).toContainText(`Fictional ${response} response`);
  if(response==='accept') {await roleBoundary(page,'david');await page.getByTestId(`event-open-${event.id}`).click();await page.getByTestId('event-resolve').click();await roleBoundary(page,'may');expect((await snapshot(page)).tasks.find(t=>t.id===task.id)?.status).toBe('completed');}
  await secondary(page,'link-privacy');await page.getByTestId('sharing-revoke').click();await page.getByTestId('revoke-confirm').click();
  const withdrawn=await snapshot(page);expect(withdrawn.healthRecords.find(r=>r.id===task.sourceRecordIds[0])).toEqual(offered.healthRecords.find(r=>r.id===task.sourceRecordIds[0]));
  await roleBoundary(page,'david');await expect(page.locator('main')).not.toContainText('organise the question list');
});

test('J4 R3 ordinary booking review reschedule cancellation and local calendar',async({page})=>{
  await initial(page,'routine-day');await page.goto('/');await secondary(page,'link-book');
  await page.getByTestId('slot-slot-17-1100').click();await page.getByTestId('book-review-open').click();await expect(page.getByTestId('booking-review')).toContainText('May');
  await page.getByTestId('book-review-back').click();await page.getByTestId('slot-slot-18-1530').click();await page.getByTestId('book-review-open').click();await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-receipt')).toContainText('未通知診所');await page.getByTestId('nav-care').click();await page.getByTestId('follow-appt-row').click();
  await page.getByTestId('book-change').click();await page.getByTestId('slot-slot-17-1100').click();await page.getByTestId('book-review-open').click();await page.getByTestId('book-confirm').click();
  const download=page.waitForEvent('download');await page.getByTestId('book-ics').click();const fs=await import('node:fs/promises');expect(await fs.readFile((await(await download).path())!,'utf8')).toContain('DTSTART:20260917T030000Z');
  await page.getByTestId('book-cancel').click();await page.getByTestId('book-cancel-confirm').click();await page.reload();await expect(page.getByTestId('book-cancelled')).toBeVisible();expect((await snapshot(page)).appointments[0].status).toBe('cancelled');
});

test('J6 R6 R7 day-before draft report question confirm and print through ordinary links',async({page})=>{
  await initial(page,'day-before-visit');await page.goto('/');await secondary(page,'link-visit');await expect(page.getByTestId('brief-status')).toContainText('尚未確認');
  await page.getByTestId('open-report').click();await expect(page.getByTestId('lab-count')).toHaveText('化驗項目：3');await page.getByTestId('add-q-q-hba1c-follow').click();await page.getByText('返回就診摘要',{exact:true}).click();
  await expect(page.getByTestId('brief-questions')).toContainText('HbA1c');await expect(page.getByTestId('visit-copy')).toBeDisabled();await page.getByTestId('brief-confirm').click();await page.getByTestId('visit-print').click();await expect(page.getByTestId('print-view')).toContainText('HbA1c');
  await page.reload();await expect(page.getByTestId('print-view')).toContainText('May Chan');
});

test('J7 R8 memory correction stop and preserved source with recorded keyboard modality',async({page,browserName})=>{
  await initial(page,'routine-day');await page.goto('/');
  const memory=page.getByRole('link',{name:'康伴記住的資料',exact:true});
  if(browserName==='webkit'){await secondary(page,'link-settings');await memory.click();}
  else {await tabTo(page.getByTestId('profile-menu-btn'));await page.keyboard.press('Enter');await tabTo(page.getByTestId('link-settings'));await page.keyboard.press('Enter');await tabTo(memory);await page.keyboard.press('Enter');}
  await test.info().attach('keyboard-modality',{body:JSON.stringify({browserName,modality:browserName==='webkit'?'Mixed input: ordinary pointer navigation to Memory, then real keyboard dialog/form/correction/stop; native WebKit Tab skips anchors on this host.':'Full keyboard-only ordinary journey',osPreferencesChanged:false,programmaticFocusUsed:false}),contentType:'application/json'});
  const opener=page.getByTestId('memory-mem-pen');await tabTo(opener);await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.locator('body > div').first()).toHaveAttribute('inert','');
  await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'不再用作個人化建議',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'關閉',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');await tabTo(page.getByRole('button',{name:'更正',exact:true}));await page.keyboard.press('Enter');await tabTo(page.getByLabel('更正內容'));await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('Fictional corrected memory');await tabTo(page.getByRole('button',{name:'儲存',exact:true}));await page.keyboard.press('Enter');
  await expect(opener).toContainText('Fictional corrected memory');const source=(await snapshot(page)).healthRecords;
  await tabTo(opener);await page.keyboard.press('Enter');for(let i=0;i<2;i++){await tabTo(page.getByRole('button',{name:'不再用作個人化建議',exact:true}));await page.keyboard.press('Enter');}
  await page.reload();await expect(opener).toContainText('已停止個人化');expect((await snapshot(page)).healthRecords).toEqual(source);
});

test('J2 J3 R2 R7 symptom correction exact 0915 reminder and clock-only next morning completion',async({page})=>{
  await initial(page,'dizziness');await page.goto('/');await page.getByTestId('talk-to-caremate').click();
  for(const answer of ['none','just-now','better','forgot'])await page.getByTestId(`quick-reply-${answer}`).click();
  await expect(page.getByTestId('structured-summary')).toContainText('未確定');await page.getByText('更正內容',{exact:true}).click();
  for(const answer of ['after-waking','better','forgot'])await page.getByTestId(`quick-reply-${answer}`).click();
  await page.getByTestId('add-to-journey').click();await page.getByTestId('prep-visit').click();await expect(page.getByTestId('visit-brief')).toBeVisible();
  await page.getByTestId('follow-830').click();await page.getByTestId('change-time-follow').click();await page.getByLabel('提醒時間（香港時間）').fill('2026-09-17T09:15');await page.getByTestId('reminder-save').click();
  await expect(page.getByTestId('followup-scheduled')).toContainText('9:15');await page.getByTestId('nav-care').click();await page.getByTestId('follow-morning-row').click();await expect(page.getByTestId('task-time')).toHaveAttribute('datetime','2026-09-17T09:15:00+08:00');
  const download=page.waitForEvent('download');await page.getByTestId('task-ics').click();const fs=await import('node:fs/promises');expect(await fs.readFile((await(await download).path())!,'utf8')).toContain('DTSTART:20260917T011500Z');
  const before=await snapshot(page);await page.goto('/dev');await page.getByTestId('advance-clock').click();await expect(page.getByTestId('today-page')).toBeVisible();const after=await snapshot(page);
  expect(Date.parse(after.clock)).toBeGreaterThan(Date.parse(before.clock));for(const key of ['healthRecords','medicationDoses','grants','events','tasks'] as const)expect(after[key],`Clock-only boundary preserves ${key}`).toEqual(before[key]);
  await test.info().attach('researcher-clock-boundary',{body:JSON.stringify({before:before.clock,after:after.clock}),contentType:'application/json'});
  await page.getByTestId('next-no-dizzy').click();expect((await snapshot(page)).tasks.find(t=>t.id==='task-morning')?.status).not.toBe('completed');
  await page.getByTestId('mood-okay').click();await page.getByTestId('checkin-next').click();await page.getByTestId('body-well').click();await page.getByTestId('checkin-next').click();await page.getByTestId('checkin-next').click();
  await page.getByTestId('followup-measurement').click();await page.getByLabel('收縮壓（mmHg）').fill('140');await page.getByLabel('舒張壓（mmHg）').fill('88');await page.getByTestId('observation-save').click();await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('followup-checkin-receipt')).toBeVisible();const final=await snapshot(page);expect(final.checkIns).toHaveLength(1);expect(final.tasks.find(t=>t.id==='task-morning')?.status).toBe('completed');expect(final.tasks.find(t=>t.id==='task-contact')?.status).toBe('pending');
});

for(const locale of ['zh-HK','en'])for(const support of ['organise','talk'])test(`P1 mood entry preserves unresolved symptoms and has useful emotional primary flow ${locale} ${support}`,async({page})=>{
  await initial(page,'dizziness',locale);await page.setViewportSize({width:390,height:900});await page.goto('/');
  await page.getByTestId('daily-check-in').click();await page.getByTestId('mood-low').click();const before=await snapshot(page);
  const label=locale==='en'?(support==='organise'?'Organise thoughts':'Prepare to talk with someone'):(support==='organise'?'整理想法':'準備找人傾談');
  const briefRequests=trackBriefRequests(page);
  await page.getByRole('link',{name:label,exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).not.toContainText(locale==='en'?'dizziness':'頭暈');await expect(page.getByTestId('quick-reply-chest-breath')).toHaveCount(0);await expect(page.getByTestId('assistant-record-only')).toBeVisible();
  await expect(page).toHaveURL(/\/ask\?topic=mood$/);
  const entered=await snapshot(page);for(const key of ['episodes','healthRecords','medicationDoses','tasks','checkIns'] as const)expect(entered[key],`${key} must survive emotional entry`).toEqual(before[key]);
  expect(entered.drafts).toEqual(before.drafts);expect(entered.assistantSessions[0].messages.slice(0,before.assistantSessions[0].messages.length)).toEqual(before.assistantSessions[0].messages);
  await page.reload();await expect(page.getByTestId('quick-reply-chest-breath')).toHaveCount(0);
  expect(briefRequests,'Mood support must not start speculative Brief requests across immediate reload').toEqual([]);await ordinaryMoodBrief(page);
  await page.getByTestId('assistant-resume-symptoms').click();await expect(page.getByTestId('quick-reply-chest-breath')).toBeVisible();expect((await snapshot(page)).episodes).toEqual(before.episodes);
  await page.goBack();await page.getByTestId('ask-input').fill(locale==='en'?'I want to hurt myself now':'我現在想傷害自己');await page.getByTestId('ask-send').click();await expect(page.getByTestId('emotional-help')).toBeVisible();await expect(page).toHaveURL(/\/help\/?$/);expect((await snapshot(page)).checkIns).toEqual(before.checkIns);
});

for(const locale of ['zh-HK','en'])test(`P1 typed mood retains the exact unfinished body question ${locale}`,async({page})=>{
  await initial(page,'dizziness',locale);await page.goto('/');await page.getByTestId('talk-to-caremate').click();await page.getByTestId('quick-reply-none').click();
  const before=await snapshot(page);const briefRequests=trackBriefRequests(page);await page.getByTestId('ask-input').fill(locale==='en'?'I am feeling low':'心情低落');await page.getByTestId('ask-send').click();
  await expect(page.getByRole('heading',{level:1})).not.toContainText(locale==='en'?'dizziness':'頭暈');await expect(page.getByTestId('quick-reply-after-waking')).toHaveCount(0);await expect(page).toHaveURL(/\/ask\?topic=mood$/);
  await page.reload();await expect(page.getByTestId('assistant-record-only')).toBeVisible();expect(briefRequests).toEqual([]);await ordinaryMoodBrief(page);await page.getByTestId('assistant-resume-symptoms').click();await expect(page.getByTestId('quick-reply-after-waking')).toBeVisible();expect((await snapshot(page)).episodes).toEqual(before.episodes);
  await page.goBack();await page.getByTestId('ask-input').fill(locale==='en'?'I want to hurt myself now':'我現在想傷害自己');await page.getByTestId('ask-send').click();await expect(page.getByTestId('emotional-help')).toBeVisible();expect((await snapshot(page)).checkIns).toEqual(before.checkIns);
});

test('P1 mood conversation keeps subsequent ordinary answers visible',async({page})=>{
  await initial(page,'dizziness','en');await page.goto('/');await page.getByTestId('talk-to-caremate').click();await page.getByTestId('ask-input').fill('feeling low');await page.getByTestId('ask-send').click();await expect(page.getByTestId('assistant-record-only')).toBeVisible();
  await page.getByTestId('ask-input').fill('report');await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');await expect(page.getByTestId('chat-log')).toContainText('feeling low');await expect(page.getByTestId('quick-reply-chest-breath')).toHaveCount(0);
  await expect(page.getByTestId('assistant-next')).toHaveAccessibleName('Blood test');
  await expect(page.getByTestId('assistant-navigation-pending')).toBeHidden();
});

for(const locale of ['zh-HK','en'])test(`P1 direct mood URL is neutral without an emotional record ${locale}`,async({page})=>{
  await initial(page,'dizziness',locale);await page.goto('/ask?topic=mood');await expect(page.getByRole('heading',{level:1})).not.toContainText(locale==='en'?'dizziness':'頭暈');
  await expect(page.getByTestId('chat-log')).not.toContainText(locale==='en'?'It sounds like you are feeling low':'聽到你現在感到低落');await expect(page.getByTestId('quick-reply-chest-breath')).toHaveCount(0);await expect(page.getByTestId('assistant-resume-symptoms')).toBeVisible();
  await page.getByTestId('ask-input').fill('report');await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');
  const boundary=new URL(page.url()).searchParams.get('message');expect(boundary).toMatch(/^u-free/);
  const saved=await snapshot(page);expect(saved.assistantSessions.flatMap(s=>s.messages).find(m=>m.id===boundary)).toMatchObject({role:'user',text:{en:'report'}});
  await page.reload();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');expect(await snapshot(page)).toEqual(saved);
  await page.getByTestId('assistant-next').click();await expect(page.getByTestId('lab-count')).toContainText('3');await page.goBack();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');expect(await snapshot(page)).toEqual(saved);
});

test('P1 neutral emotional entry validates an opaque current free-text boundary without promoting body history',async({page})=>{
  await initial(page,'dizziness','en');await page.goto('/ask');await page.getByTestId('quick-reply-none').click();
  await page.getByTestId('ask-input').fill('My dizziness started yesterday');await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toContainText('My dizziness started yesterday');
  const before=await snapshot(page);await page.goto('/ask?topic=mood');await expect(page.getByTestId('chat-log')).toBeEmpty();await expect(page.getByTestId('assistant-history')).not.toHaveAttribute('open','');
  await page.getByTestId('ask-input').fill('report');await page.getByTestId('ask-send').click();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');await expect(page.getByTestId('chat-log')).not.toContainText('My dizziness started yesterday');
  const saved=await snapshot(page),messages=saved.assistantSessions.flatMap(s=>s.messages),boundary=new URL(page.url()).searchParams.get('message');
  expect(boundary).toBe(messages.filter(m=>m.role==='user'&&m.id.startsWith('u-free')).at(-1)!.id);expect(saved.episodes).toEqual(before.episodes);
  await page.reload();await expect(page.getByTestId('chat-log')).toContainText('HbA1c');expect(await snapshot(page)).toEqual(saved);
  for(const invalid of ['u-free-stale',messages.find(m=>m.role==='assistant')!.id,messages.find(m=>m.role==='user'&&!m.id.startsWith('u-free'))!.id]){
    await page.goto(`/ask?topic=mood&message=${encodeURIComponent(invalid)}`);await expect(page.getByTestId('chat-log')).toBeEmpty();expect(await snapshot(page)).toEqual(saved);
    await expect(page.getByTestId('assistant-next')).toHaveCount(0);await expect(page.getByTestId('assistant-record-only')).toHaveCount(0);
  }
  await page.getByTestId('assistant-resume-symptoms').click();await expect(page.getByTestId('quick-reply-after-waking')).toBeVisible();expect((await snapshot(page)).episodes).toEqual(before.episodes);
});

for(const width of [320,390,430])for(const locale of ['zh-HK','en'])for(const liteMode of [false,true])test(`P1 narrow medication rows preserve readable whole names ${width} ${locale} lite=${liteMode}`,async({page})=>{
  await initial(page,'routine-day',locale);await page.setViewportSize({width,height:900});await page.goto('/');
  if(liteMode){await page.getByRole('link',{name:locale==='en'?'Settings':'設定',exact:true}).click();await page.getByTestId('lite-toggle-settings').click();await page.getByTestId('nav-today-mobile').click();}
  for(const [id,name] of [['task-task-amlo','Amlodipine'],['task-task-ator','Atorvastatin']]){
    const row=page.getByTestId(id),title=row.getByText(name,{exact:true});await row.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>document.fonts.ready);
    const lines=await title.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}));});
    await test.info().attach(`${id}-name-lines`,{body:JSON.stringify(lines),contentType:'application/json'});expect(lines,`${name} must not be fragmented into a vertical column`).toHaveLength(1);await expect(row.locator('time')).toBeVisible();
    const rect=await row.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(44);expect(rect!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({path:test.info().outputPath(`${id}-${width}.png`)});
  }
  await page.getByTestId('task-task-amlo').click();await expect(page.getByTestId('dose-detail')).toContainText('Amlodipine');
});

// The expected states, packets and strings are the independently preserved old-clock oracle,
// never recomputed with the current formatter. These run in all three production projects.
type ClockGolden = {recipient:'may'|'doctor-wong';state:DemoState;packet:BriefPacket;fullTexts:Record<'en'|'zh-HK',string>};
const clockGoldens = (JSON.parse(readFileSync('docs/superpowers/evidence/2026-10-04/task-10/r61-genuine-consent-old-clock-oracle-preparation/old-clock-genuine-consent-oracle.json','utf8')) as {baselineGolden:ClockGolden[]}).baselineGolden;
for(const locale of ['zh-HK','en'] as const)for(const recipient of ['may','doctor-wong'] as const)test(
  `R60 old confirmed clock golden survives compiled Brief reload and export ${locale} ${recipient}`,async({page})=>{
    const golden=clockGoldens.find(g=>g.recipient===recipient)!;
    expect(golden).toBeTruthy();expect(isDemoState(golden.state)).toBe(true);
    expect(golden.packet.status).toBe('confirmed');
    await page.addInitScript(({demo,locale})=>{
      if(sessionStorage.getItem('r60-golden-initialized'))return;
      sessionStorage.setItem('r60-golden-initialized','1');
      localStorage.setItem('caremate-v4',JSON.stringify(demo));
      localStorage.setItem('caremate-v4-preferences',JSON.stringify({locale,liteMode:false,introComplete:true}));
    },{demo:golden.state,locale});
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('R60 synthetic clipboard denial'))}}));
    await page.goto('/brief');await expect(page.getByTestId('brief-status')).toBeVisible();
    if(recipient==='doctor-wong'){
      await page.getByTestId('brief-recipient').selectOption(recipient);
      await expect(page).toHaveURL(/\/brief\?recipient=doctor-wong$/);
    }
    const assertTarget=async(label:string)=>{
      await expect(page.getByTestId('brief-status')).toHaveText(locale==='en'?'Confirmed':'已確認');
      const saved=await snapshot(page);
      expect(saved.briefs.find(b=>b.id===golden.packet.id)).toEqual(golden.packet);
      expect(saved.grants).toEqual(golden.state.grants);
      expect(saved.clock).toBe(golden.state.clock);expect(saved.context).toEqual(golden.state.context);
      await test.info().attach(label,{body:JSON.stringify({url:page.url(),targetPacket:saved.briefs.find(b=>b.id===golden.packet.id),grants:saved.grants,clock:saved.clock,context:saved.context}),contentType:'application/json'});
    };
    await assertTarget('old-confirmed-target-after-hydration');
    await page.reload();await assertTarget('old-confirmed-target-after-reload');
    await expect(page.getByTestId('visit-copy')).toBeEnabled();
    await page.getByTestId('brief-details-toggle').click();
    await expect(page.getByTestId('brief-packet')).toBeVisible();
    const L=(value:{zh:string;en:string})=>locale==='en'?value.en:value.zh;
    for(const section of golden.packet.sections){
      if(section.id==='readings'){
        await page.getByTestId('brief-readings').click();
        expect(await page.getByTestId('brief-readings').locator('..').locator('p').textContent()).toBe(L(section.text));
      }else{
        const id=section.id==='average'?'brief-bp':section.id==='medication'?'brief-med-correction':`brief-section-${section.id}`;
        expect(await page.getByTestId(id).locator('p').textContent()).toBe(L(section.text));
      }
    }
    expect(await page.getByTestId('brief-questions').locator('ul > li > span:first-child').allTextContents()).toEqual(golden.packet.questions.map(q=>L(q.text)));
    await page.getByTestId('visit-copy').click();
    await expect(page.getByTestId('brief-copy-fallback')).toHaveValue(golden.fullTexts[locale]);
    await assertTarget('old-confirmed-target-after-synthetic-denied-copy');
    await page.getByTestId('visit-print').click();
    await expect(page.getByTestId('print-packet')).toBeVisible();
    expect(await page.getByTestId('print-packet').textContent()).toBe(golden.fullTexts[locale]);
    const printed=await snapshot(page);
    expect(printed.briefs.find(b=>b.id===golden.packet.id)).toEqual(golden.packet);
    expect(printed.grants).toEqual(golden.state.grants);expect(printed.clock).toBe(golden.state.clock);expect(printed.context).toEqual(golden.state.context);
  });
