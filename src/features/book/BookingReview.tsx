"use client";

import { Button } from "@/components/system";
import { formatDateTime } from "@/lib/clock";
import type { Appointment } from "@/lib/demo/types";
import type { ClinicSlot } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";

export function BookingReview({ appointment, slot, onBack, onConfirm }: { appointment: Appointment; slot: ClinicSlot; onBack: () => void; onConfirm: () => void }) {
  const { t, locale, L } = useI18n();
  return <section className="mt-8 rounded-[20px] bg-surface px-5 py-5" data-testid="booking-review">
    <h2 className="text-[24px]">{t("book.review")}</h2>
    <p className="mt-3">{t("book.identity")}</p>
    <p className="mt-3">{t("book.original")}: <time dateTime={appointment.scheduledAt}>{formatDateTime(appointment.scheduledAt, locale)}</time> · {t(appointment.status === "cancelled" ? "book.cancelled" : "follow.scheduled")}</p>
    <p className="mt-3">{t("book.newTime")}: <time dateTime={slot.at}>{formatDateTime(slot.at, locale)}</time></p>
    <p className="mt-3">{L(slot.clinic)}</p>
    <p className="mt-3 text-ink-muted">{t("book.receiptBody")}</p>
    <div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" data-testid="book-review-back" onClick={onBack}>{t("book.changeSelection")}</Button><Button data-testid="book-confirm" onClick={onConfirm}>{t("book.confirm")}</Button></div>
  </section>;
}
