import { briefText } from "./selectors";
import type { Locale } from "./types";

export function buildVisitBrief(
  state: Parameters<typeof briefText>[0],
  locale: Locale,
) {
  return briefText(state, locale);
}
