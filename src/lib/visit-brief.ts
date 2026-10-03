import { briefToText, prepareBriefExport } from "./demo/brief";
import type { DemoState, Locale, RecipientId } from "./demo/types";

/** Confirmed local handoff; caller passes the latest state at the action boundary. */
export function buildVisitBrief(state: DemoState, briefId: string, locale: Locale, recipientId?: RecipientId) {
  const packet = prepareBriefExport(state, briefId, recipientId);
  return packet.ok ? { ok: true as const, value: briefToText(packet.value, locale) } : packet;
}
