import { formatIcsUtc } from "../clock";
import type { ActionResult, CareTask } from "./types";
import { validInstant } from "./care";

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
/** All calendar output uses the same scheduled instant displayed in the task. */
export function taskToIcs(task: CareTask): string {
  if (!task.scheduledAt || !validInstant(task.scheduledAt)) return "";
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CareMate//Care tasks//EN", "BEGIN:VEVENT", `UID:${escape(task.patientId)}-${escape(task.id)}@caremate.local`, `DTSTART:${formatIcsUtc(task.scheduledAt)}`, `SUMMARY:${escape(task.title.en)}`, `DESCRIPTION:${escape(`Care task for ${task.patientId}.`)}`, `STATUS:${task.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
export function downloadTaskIcs(task: CareTask): boolean {
  const ics = taskToIcs(task); if (!ics) return false;
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `caremate-${task.id}.ics`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** A rejected clipboard operation is not a successful copy. UI owns the manual fallback. */
export async function copyText(text: string): Promise<ActionResult<void>> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return { ok: false, code: "clipboard-unavailable" };
    await navigator.clipboard.writeText(text);
    return { ok: true, value: undefined };
  } catch { return { ok: false, code: "clipboard-rejected" }; }
}
