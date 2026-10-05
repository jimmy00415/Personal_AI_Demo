import { formatDateTime } from "../clock";
import type { DemoState, HealthEpisode, HealthRecord, Localized } from "./types";

/** A source ID is not permission. Only the patient's linked, occurred observation is eligible. */
export function selectEpisodeObservation(state: DemoState, episode: HealthEpisode | undefined) {
  if (state.context.actorId !== "may" || !episode || episode.patientId !== state.context.patientId) return undefined;
  return state.observations.filter(o => o.patientId === episode.patientId && episode.sourceRecordIds.includes(o.id) && Number.isFinite(Date.parse(o.occurredAt)) && Date.parse(o.occurredAt) <= Date.parse(state.clock))
    .toSorted((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

export function episodeBloodPressure(state: DemoState, episode: HealthEpisode | undefined): Localized {
  const o = selectEpisodeObservation(state, episode);
  return o ? {
    zh: `${o.systolic}/${o.diastolic} mmHg · ${formatDateTime(o.occurredAt, "zh-HK")}`,
    en: `${o.systolic}/${o.diastolic} mmHg · ${formatDateTime(o.occurredAt, "en")}`,
  } : { zh: "未有相連的血壓紀錄", en: "No linked blood-pressure reading" };
}

/** Recompose only a linked organised record produced by the two-line summary protocol.
 * Its stored text remains historical evidence. Authored/imported records are never rewritten.
 */
export function currentOrganisedRecord(state: DemoState, record: HealthRecord): HealthRecord {
  if (record.source !== "organised" || record.kind !== "symptom") return record;
  const episode = state.episodes.find(e => e.patientId === record.patientId && e.sourceRecordIds.includes(record.id));
  const zh = record.text.zh.split("\n"), en = record.text.en.split("\n");
  if (!episode || zh.length !== 2 || en.length !== 2 || !zh[0] || !en[0]) return record;
  const pressure = episodeBloodPressure(state, episode);
  return { ...record, text: { zh: `${zh[0]}\n${pressure.zh}`, en: `${en[0]}\n${pressure.en}` } };
}
