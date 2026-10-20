import type { UsageCounters, UsageReport } from "@emo/shared";
import { useI18n } from "../lib/i18n";

/** Estimates carry little precision, so show two or three significant digits. */
function formatEstimate(value: number | null, currency = false): string {
  if (value === null) return "—";
  if (currency) {
    if (value > 0 && value < 0.0001) return "<$0.0001";
    return `$${value >= 0.01
      ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumSignificantDigits: 2 })}`;
  }
  if (value > 0 && value < 0.01) return "<0.01";
  return value >= 100
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

/** Reported count first; estimated and legacy parts only when present, e.g. "39,527 + 23 est.". */
function formatTokens(reported: number, estimated: number, legacy: number, estLabel: string, legacyLabel: string): string {
  const parts = [reported.toLocaleString()];
  if (estimated > 0) parts.push(`${estimated.toLocaleString()} ${estLabel}`);
  if (legacy > 0) parts.push(`${legacy.toLocaleString()} ${legacyLabel}`);
  return parts.join(" + ");
}

export function UsageBreakdown({ counters, compact = false }: { counters: UsageCounters; compact?: boolean }) {
  const { t } = useI18n();
  const legacy = counters.input_tokens_legacy + counters.output_tokens_legacy;
  const partial = counters.unpriced_calls > 0 || legacy > 0;
  const partialLabel = partial ? ` · ${t("usage.partial")}` : "";
  const cost: [string, string] = [`${t("usage.estCost")}${partialLabel}`, formatEstimate(counters.cost_usd_estimate, true)];
  const rows: [string, string][] = compact ? [
    [t("usage.tokens"), formatTokens(
      counters.input_tokens_reported + counters.output_tokens_reported,
      counters.input_tokens_estimated + counters.output_tokens_estimated,
      legacy, t("usage.est"), t("usage.legacy"),
    )],
    cost,
    [t("usage.embeddings"), counters.embedding_requests.toLocaleString()],
  ] : [
    [t("usage.inputTokens"), formatTokens(counters.input_tokens_reported, counters.input_tokens_estimated, counters.input_tokens_legacy, t("usage.est"), t("usage.legacy"))],
    [t("usage.outputTokens"), formatTokens(counters.output_tokens_reported, counters.output_tokens_estimated, counters.output_tokens_legacy, t("usage.est"), t("usage.legacy"))],
    [`${t("usage.neurons")}${partialLabel}`, formatEstimate(counters.neurons_estimate)],
    cost,
    [t("usage.embeddingRequests"), counters.embedding_requests.toLocaleString()],
  ];
  if (counters.mock_calls > 0) rows.push([t("usage.mockCalls"), counters.mock_calls.toLocaleString()]);

  const coverage = [counters.priced_calls === 0 ? t("usage.noPriced") : t("usage.pricedCalls", { count: counters.priced_calls.toLocaleString() })];
  if (counters.unpriced_calls > 0) coverage.push(t("usage.unpricedCalls", { count: counters.unpriced_calls.toLocaleString() }));
  if (legacy > 0) coverage.push(t("usage.legacyUnpriced"));
  if (counters.mock_calls > 0) coverage.push(t("usage.mockFree"));

  return <div>
    <dl className="space-y-2 text-xs text-fg-muted">
      {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3">
        <dt>{label}</dt><dd className="shrink-0 tabular-nums text-fg">{value}</dd>
      </div>)}
    </dl>
    {/* The compact popover links to Settings, which carries this note. */}
    {!compact && <p className="mt-3 text-xs leading-5 text-fg-subtle">{coverage.join(" · ")}</p>}
  </div>;
}

export function UsagePricingNote({ data }: { data: UsageReport }) {
  const { t } = useI18n();
  return <p className="text-xs leading-5 text-fg-subtle">
    {data.note} {t("usage.rates")} <a href={data.pricing.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{t("usage.pricing")}</a> {t("usage.asOf")} {data.pricing.as_of}: ${data.pricing.usd_per_1000_neurons.toLocaleString(undefined, { maximumFractionDigits: 8 })} {t("usage.perNeurons")}
  </p>;
}
