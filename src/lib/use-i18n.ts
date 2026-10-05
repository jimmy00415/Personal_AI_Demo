"use client";

import { useAppStore } from "./store";
import { translate, type MessageKey } from "./i18n";
import { tx } from "./utils";
import { productCopy } from "./product-copy";
import type { Localized } from "./types";

export function useI18n() {
  const locale = useAppStore((s) => s.locale);
  const liteMode = useAppStore((s) => s.liteMode);
  const t = (key: MessageKey) => translate(key, locale);
  const L = (text: Localized) => productCopy(tx(text, locale));
  return { locale, liteMode, t, L };
}
