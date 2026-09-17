"use client";

import { useState } from "react";
import Link from "next/link";
import { NIDDK_A1C, report } from "@/lib/seed";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { Button } from "@/components/system";

export function ReportPage() {
  const { t, L } = useI18n();
  const expanded = useAppStore((s) => s.expandedLab);
  const setExpandedLab = useAppStore((s) => s.setExpandedLab);
  const questions = useAppStore((s) => s.questions);
  const toggleQuestion = useAppStore((s) => s.toggleQuestion);
  const [source, setSource] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  return (
    <div className="mx-auto max-w-[720px]" data-testid="lab-page">
      <h1 className="text-[30px] leading-tight">{t("report.title")}</h1>
      <p className="mt-2 text-[15px] text-ink-muted">{t("report.sub")}</p>

      <div className="mt-8 divide-y divide-line rounded-[20px] bg-surface">
        {report.results.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`lab-${r.id}`}
            className="block w-full px-5 py-4 text-left"
            onClick={() => setExpandedLab(expanded === r.id ? null : r.id)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span>{L(r.name)}</span>
              <span className="text-[20px]">
                {r.value} <span className="text-[14px] text-ink-soft">{r.unit}</span>
              </span>
            </div>
            {expanded === r.id ? <p className="measure mt-3 text-[15px] text-ink-muted">{L(r.explain)}</p> : null}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-ink-soft" data-testid="lab-count">
        {report.results.length}
      </p>

      <h2 className="mt-10 text-[20px]">{t("report.explain")}</h2>
      <p className="measure mt-3 leading-relaxed">{L(report.results[0].explain)}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="text-[15px] text-brand" onClick={() => setSource((v) => !v)}>
          {t("report.source")}
        </button>
        <button type="button" className="text-[15px] text-brand" onClick={() => setRefOpen((v) => !v)}>
          {t("report.ref")}
        </button>
      </div>
      {source ? (
        <pre className="mt-3 overflow-x-auto rounded-[14px] bg-surface-secondary p-4 text-[14px] whitespace-pre-wrap">
          {`Blood test · 13 Sep 2026
HbA1c 6.4 %
LDL cholesterol 2.7 mmol/L
Creatinine 71 μmol/L`}
        </pre>
      ) : null}
      {refOpen ? (
        <p className="mt-3">
          <a href={NIDDK_A1C} target="_blank" rel="noreferrer" className="text-brand underline">
            {t("report.refName")}
          </a>
        </p>
      ) : null}

      <div className="mt-8 space-y-3">
        {questions
          .filter((q) => q.id.startsWith("q-hba1c"))
          .map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-3">
              <span>{L(q.text)}</span>
              <Button data-testid={`add-q-${q.id}`} variant={q.added ? "secondary" : "primary"} onClick={() => toggleQuestion(q.id)}>
                {q.added ? t("brief.removeQ") : t("report.add")}
              </Button>
            </div>
          ))}
      </div>

      <Link href="/brief" className="mt-10 inline-flex min-h-12 items-center text-brand">
        {t("report.back")}
      </Link>
    </div>
  );
}
