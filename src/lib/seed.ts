/** Transitional accessors. Mutable facts come from the one active DemoState. */
import type { Allergy, BpReading, ImportedReport, Medication, Person } from "./types";
import type { DemoState } from "./demo/types";
import { createScenario } from "./demo/scenarios";
import { projectLegacy } from "./demo/legacy";
export { averageBp, clinicSlots, emptyAnswers, NIDDK_A1C, CHP_STROKE, openingClock } from "./demo/fixtures";

let readDemo: (() => DemoState) | null = null;
export function bindDemoReader(reader: () => DemoState) { readDemo = reader; }
export function currentDemo() { return readDemo ? readDemo() : createScenario("dizziness"); }
const projection = () => projectLegacy(currentDemo(), null);
function arrayAccessor<T>(read: () => T[]): T[] {
  return new Proxy([] as T[], { get: (_target, property) => {
    const value = Reflect.get(read(), property);
    return typeof value === "function" ? value.bind(read()) : value;
  } });
}
function objectAccessor<T extends object>(read: () => T): T {
  return new Proxy({} as T, { get: (_target, property) => Reflect.get(read(), property), ownKeys: () => Reflect.ownKeys(read()), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
}
export const persons: Person[] = arrayAccessor(() => currentDemo().profiles.map(p => ({ id: p.id === "may" ? "michelle" : "lai-wah", name: p.name, displayName: p.displayName, age: p.age, role: p.id === "may" ? "self" : "mother" })));
export const bpReadings: BpReading[] = arrayAccessor(() => currentDemo().context.actorId === "may" ? currentDemo().observations.map(r => ({ id: r.id, personId: "michelle", occurredAt: r.occurredAt, systolic: r.systolic, diastolic: r.diastolic })) : []);
export const michelleMeds: Medication[] = arrayAccessor(() => {
  const state = currentDemo();
  if (state.context.actorId !== "may") return [];
  return [...new Map(state.medicationDoses.map(d => [d.medicationId, { id: d.medicationId, personId: "michelle" as const, name: d.name, dose: d.dose, scheduleHour: Number(d.scheduledAt.slice(11, 13)), scheduleMinute: Number(d.scheduledAt.slice(14, 16)) }])).values()];
});
export const allergy: Allergy = objectAccessor(() => {
  const item = currentDemo().context.actorId === "may" ? currentDemo().memories.find(m => m.id === "mem-pen") : undefined;
  return { id: item?.id ?? "", personId: "michelle", name: item ? item.value.en : "", source: item?.source ?? "user", enteredAt: item?.enteredAt ?? currentDemo().clock };
});
export const report: ImportedReport = objectAccessor(() => {
  const item = currentDemo().context.actorId === "may" ? currentDemo().reports[0] : undefined;
  return { id: item?.id ?? "", personId: "michelle", title: item?.title ?? { zh: "", en: "" }, occurredAt: item?.occurredAt ?? currentDemo().clock, enteredAt: item?.enteredAt ?? currentDemo().clock, results: item?.results ?? [] };
});
export const createAppointments = () => projection().appointments;
export const createDoses = () => projection().doses;
export const createRecords = () => projection().records;
export const createTasks = () => projection().tasks;
export const createMemories = () => projection().memories;
export const appointments = arrayAccessor(createAppointments);
export const defaultQuestions = arrayAccessor(() => projection().questions);
export const familyConsent = objectAccessor(() => projection().consent);
