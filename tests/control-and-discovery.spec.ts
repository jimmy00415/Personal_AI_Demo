import { expect, test, type Page } from '@playwright/test';
import { createScenario } from '../src/lib/demo/scenarios';
async function fixture(page: Page, scenario: Parameters<typeof createScenario>[0] = 'dizziness') {
  await page.addInitScript(demo => {
    if (!localStorage.getItem('caremate-v4')) localStorage.setItem('caremate-v4', JSON.stringify(demo));
    if (!localStorage.getItem('caremate-v4-preferences')) localStorage.setItem('caremate-v4-preferences', JSON.stringify({ locale: 'zh-HK', liteMode: false, introComplete: true }));
  }, createScenario(scenario));
}
test('first_use_has_no_signup_and_daily_entry_remains_findable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome-page')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  await page.getByRole('button', { name: 'Start using CareMate', exact: true }).click();
  await expect(page.getByTestId('daily-check-in')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('welcome-page')).toHaveCount(0);
  await page.getByTestId('daily-check-in').click();
  await expect(page.getByTestId('mood-low')).toBeVisible();
});
test('mobile_settings_exposes_memory_and_sharing', async ({ page }) => {
  await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await page.getByRole('link', { name: '康伴記住的資料', exact: true }).click();
  await expect(page.getByTestId('memory-page')).toBeVisible();
  await page.getByRole('link', { name: /返回設定/ }).click();
  await page.getByRole('link', { name: '分享權限', exact: true }).click();
  await expect(page.getByTestId('sharing-page')).toBeVisible();
});
test('memory_exclusion_updates_personalisation_but_keeps_source_record', async ({ page }) => {
  await fixture(page); await page.goto('/memory');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('caremate-v4')!));
  await page.getByTestId('memory-mem-pen').click();
  await page.getByRole('button', { name: '更正', exact: true }).click();
  await page.getByLabel('更正內容').fill('本人更正的過敏資料');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByTestId('memory-mem-pen')).toContainText('本人更正的過敏資料');
  await page.goto('/ask');
  await page.getByTestId('ask-input').fill('康伴記住甚麼');
  await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('chat-log')).toContainText('本人更正的過敏資料');
  await page.goto('/memory'); await page.getByTestId('memory-mem-pen').click();
  await page.getByRole('button', { name: '不再用作個人化建議', exact: true }).click();
  await page.getByRole('button', { name: '不再用作個人化建議', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('memory-mem-pen')).toContainText('已停止個人化');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('caremate-v4')!));
  expect(after.healthRecords).toEqual(before.healthRecords); expect(after.reports).toEqual(before.reports);
  expect(after.memories.find((m: { id: string }) => m.id === 'mem-pen')).toMatchObject({ enabled: false, value: { zh: '本人更正的過敏資料', en: '本人更正的過敏資料' } });
  await page.goto('/ask'); await page.getByTestId('ask-input').fill('康伴記住甚麼'); await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('chat-log').locator('> *').last()).not.toContainText('本人更正的過敏資料');
});
test('compatibility_routes_are_useful_and_reset_preserves_preferences', async ({ page }) => {
  await fixture(page); await page.goto('/records'); await expect(page.getByTestId('health-tab-records')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/medications'); await expect(page.getByTestId('plan-page')).toBeVisible();
  await page.goto('/privacy'); await expect(page.getByTestId('sharing-page')).toBeVisible();
  await page.goto('/settings'); await page.getByTestId('lang-en-settings').click(); await page.getByTestId('lite-toggle-settings').click();
  await page.getByTestId('clear-device-data').click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByTestId('clear-device-data').click(); await page.getByTestId('clear-device-confirm').click(); await expect(page.getByTestId('today-page')).toBeVisible(); await page.reload();
  await expect(page.getByTestId('today-page')).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByTestId('toast')).toHaveCount(0);
  const result = await page.evaluate(() => ({ prefs: JSON.parse(localStorage.getItem('caremate-v4-preferences')!), demo: JSON.parse(localStorage.getItem('caremate-v4')!) }));
  expect(result.prefs).toMatchObject({ locale: 'en', liteMode: true, introComplete: true }); expect(result.demo.events).toEqual([]);
});

test('memory_dialog_traps_focus_and_restores_the_control', async ({ page }) => {
  await fixture(page); await page.goto('/memory');
  const opener = page.getByTestId('memory-mem-pen'); await opener.click();
  await expect(page.getByRole('button', { name: '關閉', exact: true })).toBeFocused();
  await expect(page.locator('body > div').first()).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '不再用作個人化建議', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('sharing_recipients_are_exclusive_named_choices', async ({ page }) => {
  await fixture(page); await page.goto('/sharing');
  await page.getByRole('radio', { name: '黃醫生 · 虛構聯絡人', exact: true }).check();
  await expect(page.getByRole('radio', { name: '黃醫生 · 虛構聯絡人', exact: true })).toBeChecked();
  await expect(page.getByTestId('recipient-david')).not.toBeChecked();
  await expect(page.getByRole('group', { name: '選擇分享內容', exact: true })).toBeVisible();
});

test('existing_personalisation_explanation_refreshes_after_correction_and_exclusion', async ({ page }) => {
  await fixture(page); await page.goto('/ask');
  await page.getByTestId('ask-input').fill('康伴記住甚麼'); await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('chat-log')).toContainText('對 Penicillin 過敏');
  await page.goto('/memory'); await page.getByTestId('memory-mem-pen').click(); await page.getByRole('button', { name: '更正', exact: true }).click();
  await page.getByLabel('更正內容').fill('更正後的個人化資料'); await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.goto('/ask'); await expect(page.getByTestId('chat-log')).toContainText('更正後的個人化資料');
  await expect(page.getByTestId('chat-log')).not.toContainText('對 Penicillin 過敏');
  await page.goto('/memory'); await page.getByTestId('memory-mem-pen').click();
  await page.getByRole('button', { name: '不再用作個人化建議', exact: true }).click(); await page.getByRole('button', { name: '不再用作個人化建議', exact: true }).click();
  await page.goto('/ask'); await page.reload(); await expect(page.getByTestId('chat-log')).not.toContainText('更正後的個人化資料');
});

for (const scenario of ['routine-day', 'dizziness', 'day-before-visit', 'low-mood', 'next-morning'] as const) test(`daily_entry_survives_hero_${scenario}`, async ({ page }) => {
  await fixture(page, scenario); await page.goto('/'); await page.getByTestId('daily-check-in').click(); await expect(page.getByTestId('checkin-page')).toBeVisible();
  if (scenario === 'low-mood') { await expect(page.getByTestId('body-tired')).toBeVisible(); await page.getByRole('button', { name: '返回上一步', exact: true }).click(); }
  await expect(page.getByTestId('mood-low')).toBeVisible();
});
for (const locale of ['zh-HK', 'en'] as const) for (const liteMode of [false, true]) test(`bilingual_mobile_controls_${locale}_lite_${liteMode}`, async ({ page }) => {
  await page.setViewportSize({ width: liteMode ? 320 : 390, height: 844 });
  await page.emulateMedia({ reducedMotion: liteMode ? 'reduce' : 'no-preference' });
  await page.addInitScript(({ locale, liteMode }) => { if (!localStorage.getItem('caremate-v4-preferences')) localStorage.setItem('caremate-v4-preferences', JSON.stringify({ locale, liteMode, introComplete: false })); }, { locale, liteMode });
  await page.goto('/welcome'); await expect(page.getByTestId('welcome-page')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`task-9-${locale}-${liteMode}-welcome.png`), fullPage: true });
  await page.getByRole('button', { name: locale === 'en' ? 'Start using CareMate' : '開始使用康伴', exact: true }).click();
  await expect(page.getByTestId('today-page')).toContainText(locale === 'en' ? 'May Chan' : 'May／陳女士');
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await page.evaluate(() => document.fonts.ready);
  const wordmarkLines = await page.locator('header').getByRole('link', { name: locale === 'en' ? 'CareMate' : '康伴', exact: true }).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length;
  });
  expect(wordmarkLines).toBe(1);
  const headerBoxes = await page.locator('header a').evaluateAll(links => links.map(link => { const box = link.getBoundingClientRect(); return { x: box.x, width: box.width, height: box.height }; }));
  expect(headerBoxes[1].x - (headerBoxes[0].x + headerBoxes[0].width)).toBeGreaterThanOrEqual(8);
  expect(headerBoxes.every(box => box.height >= 44 && box.width >= 44)).toBe(true);
  await page.getByRole('link', { name: locale === 'en' ? 'Settings' : '設定', exact: true }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`task-9-${locale}-${liteMode}-settings.png`), fullPage: true });
  await page.getByRole('link', { name: locale === 'en' ? 'What CareMate remembers' : '康伴記住的資料', exact: true }).click();
  await expect(page.getByTestId('memory-page')).toBeVisible();
  await page.getByTestId('memory-mem-pen').click();
  await page.getByRole('button', { name: locale === 'en' ? 'Correct' : '更正', exact: true }).click();
  await page.getByLabel(locale === 'en' ? 'Corrected content' : '更正內容').fill('𠮷龘 • May 香港，patient note');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Save' : '儲存', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath(`task-9-${locale}-${liteMode}-edit.png`), fullPage: true });
  await page.getByRole('button', { name: locale === 'en' ? 'Save' : '儲存', exact: true }).click();
  await expect(page.getByTestId('memory-mem-pen')).toContainText('𠮷龘');
  await page.getByTestId('memory-mem-pen').click(); await page.getByRole('button', { name: locale === 'en' ? 'Stop using for personalisation' : '不再用作個人化建議', exact: true }).click();
  await page.getByRole('button', { name: locale === 'en' ? 'Stop using for personalisation' : '不再用作個人化建議', exact: true }).click();
  await page.reload(); await expect(page.getByTestId('memory-mem-pen')).toContainText(locale === 'en' ? 'Personalisation stopped' : '已停止個人化');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`task-9-${locale}-${liteMode}-memory.png`), fullPage: true });
  await page.getByRole('link', { name: /Back to Settings|返回設定/ }).click();
  await page.getByRole('link', { name: locale === 'en' ? 'Sharing permissions' : '分享權限', exact: true }).click();
  await page.getByTestId('recipient-doctor-wong').check(); await page.getByTestId('level-summary').check(); await page.getByTestId('category-body').check(); await page.getByTestId('sharing-review').click();
  await page.getByTestId('sharing-confirm').click(); await expect(page.getByTestId('sharing-review')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`task-9-${locale}-${liteMode}-sharing.png`), fullPage: true });
});

test('stored_caregiver_context_does_not_flash_patient_memory_during_hydration', async ({ page }) => {
  const demo = createScenario('routine-day'); demo.context = { actorId: 'david', patientId: 'may', perspective: 'caregiver' };
  await page.addInitScript(demo => {
    localStorage.setItem('caremate-v4', JSON.stringify(demo)); sessionStorage.setItem('caremate-v4-actor', 'david');
    localStorage.setItem('caremate-v4-preferences', JSON.stringify({ locale: 'en', liteMode: false, introComplete: true }));
    (window as unknown as Window & { privateFlashes: string[] }).privateFlashes = [];
    new MutationObserver(() => { const text = document.body?.innerText ?? ''; if (/Penicillin|151\/94|6\.4%/.test(text)) (window as unknown as Window & { privateFlashes: string[] }).privateFlashes.push(text); }).observe(document, { childList: true, subtree: true });
  }, demo);
  await page.goto('/memory'); await expect(page.getByTestId('shared-view')).toBeVisible(); await expect(page.getByTestId('memory-page')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Window & { privateFlashes: string[] }).privateFlashes)).toEqual([]);
  await expect(page.getByRole('link', { name: 'Information shared by May', exact: true })).toBeVisible();
});

test('personalisation_history_does_not_replace_an_uncertain_safety_reply', async ({ page }) => {
  await fixture(page); await page.goto('/ask'); await page.getByTestId('quick-reply-unsure').click();
  await page.getByTestId('ask-input').fill('康伴記住甚麼'); await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('chat-log').locator('> *').last()).not.toContainText('對 Penicillin 過敏');
  await expect(page.getByTestId('chat-log').locator('> *').last()).toContainText('醫護');
});
