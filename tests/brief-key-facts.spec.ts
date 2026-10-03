import { expect, test, type Page } from '@playwright/test';
import { buildBrief, prepareBriefExport, reconcileBriefs } from '../src/lib/demo/brief';
import { createScenario } from '../src/lib/demo/scenarios';
import { isDemoState } from '../src/lib/demo/persistence';
import { formatDateTime } from '../src/lib/clock';
import { messages } from '../src/lib/i18n';
import type { DemoState, Locale } from '../src/lib/demo/types';

function fixture(recipient: boolean) {
  const state = createScenario('day-before-visit');
  state.healthRecords.push({ id: 'body-history', patientId: 'may', category: 'body', source: 'user', occurredAt: '2026-09-16T08:35:00+08:00', enteredAt: '2026-09-16T08:35:00+08:00', text: { zh: '較早記錄：當時頭暈', en: 'Earlier record: dizzy at that time' }, title: { zh: '身體紀錄', en: 'Body record' }, kind: 'symptom', revision: 1 });
  state.checkIns.push({ id: 'check-current', patientId: 'may', draftId: 'draft-current', occurredAt: '2026-09-21T08:40:00+08:00', enteredAt: '2026-09-21T08:42:00+08:00', body: 'well', mood: 'okay', note: 'PRIVATE_NOTE', revision: 1 });
  if (recipient) state.grants.push({ id: 'grant-doctor', patientId: 'may', recipientId: 'doctor-wong', level: 'full', categories: ['body', 'medication', 'appointments'], status: 'active', revision: 1, updatedAt: state.clock });
  return state;
}
async function start(page: Page, state: DemoState, locale: Locale, recipient: boolean) {
  await page.addInitScript(({state,locale}) => {
    if (!localStorage.getItem('caremate-v4-preferences')) localStorage.setItem('caremate-v4-preferences', JSON.stringify({locale,liteMode:false,introComplete:true}));
    if (!localStorage.getItem('caremate-v4')) localStorage.setItem('caremate-v4', JSON.stringify(state));
  }, {state,locale});
  await page.goto(recipient ? '/brief?recipient=doctor-wong' : '/brief');
  await expect(page.getByTestId('brief-key-facts')).toBeVisible();
}
for (const locale of ['zh-HK','en'] as const) for (const recipient of [false,true]) {
  test(`key_facts_preserve_mixed_medication_uncertainty_and_appointment_time_${locale}_${recipient?'recipient':'personal'}`, async ({page}) => {
    const state=fixture(recipient); await start(page,state,locale,recipient);
    const facts=page.getByTestId('brief-key-facts');
    await expect(facts).toContainText('Amlodipine'); await expect(facts).toContainText('Atorvastatin');
    await expect(facts).toContainText(locale==='en' ? `${messages['packet.unknown'].en}: 3` : `${messages['packet.unknown'].zh}：3`);
    await expect(facts).toContainText(locale==='en' ? `${messages['care.recordedTaken'].en}: 2` : `${messages['care.recordedTaken'].zh}：2`);
    await expect(facts).toContainText(formatDateTime(state.appointments[0].scheduledAt,locale));
    await expect(facts).toContainText(formatDateTime(state.medicationDoses.find(d=>d.id==='dose-ator-14')!.scheduledAt,locale));
    if (recipient) { await expect(facts).not.toContainText('PRIVATE_NOTE'); await expect(facts).not.toContainText('Penicillin'); }
    await page.setViewportSize({width:390,height:844});
    await facts.screenshot({path:`.superpowers/sdd/2026-10-03-caremate-complete-demo/task-9-fix1-${locale}-${recipient?'recipient':'personal'}-keyfacts.png`});
  });
  test(`key_facts_show_latest_body_checkin_and_label_retained_history_${locale}_${recipient?'recipient':'personal'}`, async ({page}) => {
    const state=fixture(recipient); await start(page,state,locale,recipient);
    const facts=page.getByTestId('brief-key-facts');
    await expect(facts).toContainText(locale==='en' ? 'Feeling well' : '身體感覺良好');
    await expect(facts).toContainText(formatDateTime(state.checkIns[0].occurredAt,locale));
    await expect(facts).toContainText(locale==='en' ? 'Other body-history entries: 1' : '其他身體歷史紀錄：1');
    await expect(facts).not.toContainText(locale==='en' ? 'Earlier record: dizzy at that time' : '較早記錄：當時頭暈');
    await expect(page.getByTestId('brief-section-body')).toContainText(locale==='en' ? 'Earlier record: dizzy at that time' : '較早記錄：當時頭暈');
    await page.getByTestId('brief-confirm').click();
    await page.evaluate(() => {
      const changed=JSON.parse(localStorage.getItem('caremate-v4')!) as DemoState;
      changed.checkIns[0].body='dizzy'; changed.checkIns[0].revision++;
      const dose=changed.medicationDoses.find(d=>d.id==='dose-ator-14')!; dose.status='user_confirmed_taken'; dose.occurredAt=dose.scheduledAt; dose.enteredAt=changed.clock; dose.revision++;
      localStorage.setItem('caremate-v4',JSON.stringify(changed)); window.dispatchEvent(new StorageEvent('storage',{key:'caremate-v4'}));
    });
    await expect(facts).toContainText(locale==='en' ? messages['sharing.body.dizzy'].en : messages['sharing.body.dizzy'].zh);
    await expect(facts).toContainText(locale==='en' ? `${messages['packet.unknown'].en}: 2` : `${messages['packet.unknown'].zh}：2`);
    await expect(page.getByTestId('brief-status')).toHaveText(locale==='en' ? 'Not yet confirmed' : '尚未確認');
    await expect(page.getByTestId('visit-print')).toBeDisabled();
  });
}

test('older_confirmed_packet_rebuilds_as_unconfirmed_before_summary_export', () => {
  const state=fixture(false); const built=buildBrief(state,'may',{appointmentId:'appt-gp',includeMood:true}); expect(built.ok).toBe(true); if (!built.ok) return;
  const old=structuredClone(built.value);
  for (const section of old.sections) delete section.summary;
  old.sourceFingerprint=JSON.stringify({...JSON.parse(old.sourceFingerprint!),sections:old.sections});
  old.contentFingerprint=JSON.stringify({...JSON.parse(old.contentFingerprint!),sourceFingerprint:old.sourceFingerprint});
  old.status='confirmed'; old.confirmedAt=state.clock; state.briefs=[old];
  expect(isDemoState(state)).toBe(true);
  const next=reconcileBriefs(state); expect(next.briefs[0]).toMatchObject({status:'draft',confirmedAt:null,revision:old.revision+1});
  expect(next.briefs[0].sections.find(s=>s.id==='body')?.summary?.en).toContain('Feeling well');
  expect(prepareBriefExport(next,old.id)).toEqual({ok:false,code:'review-required'});
  expect(reconcileBriefs(next)).toEqual(next);
});

for (const locale of ['zh-HK','en'] as const) test(`summary_recipient_retains_authorised_aggregates_without_detailed_dates_${locale}`, async ({page}) => {
  const state=fixture(true); state.grants[0].level='summary'; state.grants[0].categories=['body','medication']; await start(page,state,locale,true);
  const facts=page.getByTestId('brief-key-facts');
  await expect(facts).toContainText(locale==='en' ? messages['sharing.unknown'].en : messages['sharing.unknown'].zh);
  await expect(facts).toContainText(locale==='en' ? 'Feeling well' : '身體感覺良好');
  await expect(facts).not.toContainText('Atorvastatin'); await expect(facts).not.toContainText('PRIVATE_NOTE');
  await expect(facts).not.toContainText(formatDateTime(state.checkIns[0].occurredAt,locale));
  await expect(facts).not.toContainText(formatDateTime(state.appointments[0].scheduledAt,locale));
});

test('bounded_dose_summary_counts_all_statuses_without_silently_omitting_history', () => {
  const state=fixture(false); const template=state.medicationDoses[1];
  for (let i=0;i<12;i++) state.medicationDoses.push({...template,id:`extra-dose-${i}`,medicationId:`extra-med-${i}`,name:`Medicine-${i}`,scheduledAt:`2026-09-20T08:${String(i).padStart(2,'0')}:00+08:00`});
  const built=buildBrief(state,'may',{appointmentId:'appt-gp',includeMood:true}); expect(built.ok).toBe(true); if (!built.ok) return;
  const section=built.value.sections.find(s=>s.id==='medication')!;
  expect(section.summary?.en).toContain(`${messages['packet.unknown'].en}: 15`);
  expect(section.summary?.en).toContain('Other dose-history entries: 13');
  expect(section.summary?.en.match(/Medicine-\d+/g)).toHaveLength(4);
  expect(section.text.en.match(/Medicine-\d+/g)).toHaveLength(12);
  state.briefs=[built.value];
  const malformed=structuredClone(state); malformed.briefs[0].sections[0].summary={zh:'ok',en:123 as unknown as string};
  expect(isDemoState(malformed)).toBe(false);
});
