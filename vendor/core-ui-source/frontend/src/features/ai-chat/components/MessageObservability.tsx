import { useMessageTiming, useAuiState } from "@assistant-ui/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Surface, Text } from "../../../ui";
import type { ObservabilityStep } from "../useAIChatRuntime";

/** Keep the full table readable; only its own viewport scrolls sideways. */
function StatisticsScroll({ label, children }: { label: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = viewport.current;
    const measure = () => { if (element) setOverflowing(element.scrollWidth > element.clientWidth + 1); };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (element) {
      resize?.observe(element);
      if (element.firstElementChild) resize?.observe(element.firstElementChild);
    }
    window.addEventListener("resize", measure);
    return () => { resize?.disconnect(); window.removeEventListener("resize", measure); };
  }, [children]);
  return <div className="min-w-0 max-w-full">
    {overflowing && <Text as="p" variant="meta" tone="muted" className="mb-2">Scroll horizontally to see all columns.</Text>}
    <div ref={viewport} role="region" aria-label={label} tabIndex={overflowing ? 0 : undefined}
      className="max-w-full overflow-x-auto overscroll-x-contain pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      {children}
    </div>
  </div>;
}

/** native provider final-payload usage block (interaction.usage). */
type FinalUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  total_duration_seconds?: number;
  estimated_cost_usd?: number;
};

/** native provider final-payload per-call metric (interaction.observability_metrics[]). */
type FinalMetric = {
  event_type?: string;
  data?: {
    model?: string;
    duration?: number;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
};

function formatTimeSec(seconds: number | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  return formatTime(seconds * 1000);
}

function formatExactTokens(n: number | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function costSourceLabel(source: ObservabilityStep["costSource"]): string {
  if (source === "litellm_calculated") return "Estimated cost";
  if (source === "provider_response") return "Provider-reported cost";
  if (source === "litellm_response") return "LiteLLM-reported cost";
  return "Cost unavailable";
}

function formatTime(ms: number | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatTps(tps: number | undefined): string | null {
  if (tps == null || tps <= 0) return null;
  return `${tps.toFixed(1)} tok/s`;
}

function shortModel(modelId: string | undefined): string {
  if (!modelId) return "unknown";
  const parts = modelId.split("/");
  return parts[parts.length - 1];
}

/** Model names share the activity disclosure, including turns without tools. */
export function useMessageModelLabel(): string | undefined {
  return useAuiState((s) => {
    const custom = s.message.metadata?.custom as {
      steps?: ObservabilityStep[];
      finalPayload?: { interaction?: { observability_metrics?: FinalMetric[] } };
    } | undefined;
    const models: string[] = (custom?.steps ?? []).flatMap(step => step.modelId ? [step.modelId] : []);
    if (models.length === 0) {
      models.push(...(custom?.finalPayload?.interaction?.observability_metrics ?? [])
        .filter(metric => metric.event_type === "model_call")
        .flatMap(metric => metric.data?.model ? [metric.data.model] : []));
    }
    const unique = [...new Set(models)];
    return unique.length ? unique.map(shortModel).join(" / ") : undefined;
  });
}

/** Whole-turn elapsed time and reported usage, without double-counting final metrics. */
export function useMessageTurnMetrics(): string {
  const timing = useMessageTiming();
  const custom = useAuiState((s) => s.message.metadata?.custom as {
    latency?: { totalMs?: number };
    steps?: ObservabilityStep[];
    finalPayload?: { interaction?: { usage?: FinalUsage; observability_metrics?: FinalMetric[] } };
  } | undefined);
  const interaction = custom?.finalPayload?.interaction;
  const steps = custom?.steps?.length ? custom.steps :
    (interaction?.observability_metrics ?? []).filter(metric => metric.event_type === "model_call")
      .map(metric => ({ usage: { inputTokens: metric.data?.usage?.prompt_tokens, outputTokens: metric.data?.usage?.completion_tokens } }));
  const validTokens = (value: number | undefined): value is number =>
    value != null && Number.isFinite(value) && value >= 0;
  const reported = steps.flatMap(step => [step.usage?.inputTokens, step.usage?.outputTokens]).filter(validTokens);
  const complete = steps.length > 0 && steps.every(step =>
    !("usageComplete" in step && step.usageComplete === false) &&
    validTokens(step.usage?.inputTokens) && validTokens(step.usage?.outputTokens));
  const finalUsage = interaction?.usage;
  const finalTotal = validTokens(finalUsage?.total_tokens) ? finalUsage.total_tokens :
    validTokens(finalUsage?.prompt_tokens) && validTokens(finalUsage?.completion_tokens) ?
      finalUsage.prompt_tokens + finalUsage.completion_tokens : undefined;
  const tokens = reported.length > 0 ? reported.reduce((sum, value) => sum + value, 0) : finalTotal;
  const partial = reported.length > 0 && !complete;
  // Model-call durations exclude queue, preparation and tools; never sum them here.
  const elapsed = custom?.latency?.totalMs ?? timing?.totalStreamTime;
  const compactTokens = tokens == null ? undefined : new Intl.NumberFormat("en", {
    notation: "compact", maximumFractionDigits: 1,
  }).format(tokens);
  return [formatTime(elapsed), compactTokens != null ? `${compactTokens} tokens${partial ? " reported" : ""}` : undefined]
    .filter(Boolean).join(" · ");
}

export function MessageObservability() {
  const role = useAuiState((s) => s.message.role);
  const statusType = useAuiState((s) =>
    s.message.role === "assistant" ? s.message.status.type : null,
  );
  const customSteps = useAuiState(
    (s) => (s.message.metadata?.custom as { steps?: ObservabilityStep[] })?.steps,
  );
  // Authoritative usage from native provider's final payload (interaction.usage):
  // {prompt_tokens, completion_tokens, total_tokens, ...}. This is the source
  // of truth for token spend — observability_metrics-derived steps can be
  // empty when the metric shape doesn't match the per-step extractor.
  const finalUsage = useAuiState(
    (s) =>
      (
        (s.message.metadata?.custom as { finalPayload?: { interaction?: { usage?: FinalUsage } } })
          ?.finalPayload?.interaction?.usage
      ) ?? undefined,
  );
  // Authoritative per-model_call metrics from the final payload — the model
  // name lives here (`data.model`); the per-step extractor's `steps` is often
  // empty (metric-shape mismatch), so this is the reliable model source.
  const finalMetrics = useAuiState(
    (s) =>
      (
        s.message.metadata?.custom as {
          finalPayload?: {
            interaction?: { observability_metrics?: FinalMetric[] };
          };
        }
      )?.finalPayload?.interaction?.observability_metrics ?? undefined,
  );
  const timing = useMessageTiming();
  const latency = useAuiState(s => (s.message.metadata?.custom as { latency?: import('../providers/types').ChatLatency } | undefined)?.latency);

  if (role !== "assistant") return null;
  if (statusType === "running") return null;

  const steps = customSteps ?? [];
  const durationFromFinal =
    finalUsage?.total_duration_seconds != null &&
    finalUsage.total_duration_seconds > 0
      ? finalUsage.total_duration_seconds * 1000
      : undefined;
  const totalStreamMs =
    (timing?.totalStreamTime ?? 0) > 0
      ? timing!.totalStreamTime
      : durationFromFinal;
  const hasTiming = (totalStreamMs ?? 0) > 0;

  // Per-model_call rows for the breakdown table — driven by the final
  // payload's observability_metrics (the per-step extractor's `steps` is often
  // empty), mirroring jvchat's stats readout. embedding_call rolls into totals
  // but isn't listed as a step.
  const metricSteps = (finalMetrics ?? []).filter(
    (m) => m.event_type === "model_call",
  );
  const metricModels = metricSteps
    .map((m) => m.data?.model)
    .filter((m): m is string => !!m);
  const hasModel = !!(steps[0]?.modelId ?? metricModels[0]);
  const usageSteps = steps.length > 0
    ? steps
    : metricSteps.map((metric) => ({
        usage: {
          inputTokens: metric.data?.usage?.prompt_tokens,
          outputTokens: metric.data?.usage?.completion_tokens,
        },
      }));
  const inputReportedCount = usageSteps.filter((step) => step.usage?.inputTokens != null).length;
  const outputReportedCount = usageSteps.filter((step) => step.usage?.outputTokens != null).length;
  const hasStepUsage = inputReportedCount > 0 || outputReportedCount > 0;
  const totalIn = hasStepUsage
    ? usageSteps.reduce((sum, step) => sum + (step.usage?.inputTokens ?? 0), 0)
    : finalUsage?.prompt_tokens;
  const totalOut = hasStepUsage
    ? usageSteps.reduce((sum, step) => sum + (step.usage?.outputTokens ?? 0), 0)
    : finalUsage?.completion_tokens;
  const inputCoverageCount = hasStepUsage ? inputReportedCount : (totalIn != null ? 1 : 0);
  const outputCoverageCount = hasStepUsage ? outputReportedCount : (totalOut != null ? 1 : 0);
  const inputCoverageTotal = hasStepUsage ? usageSteps.length : (totalIn != null ? 1 : 0);
  const outputCoverageTotal = hasStepUsage ? usageSteps.length : (totalOut != null ? 1 : 0);
  const inputComplete = inputCoverageTotal > 0 && inputCoverageCount === inputCoverageTotal;
  const outputComplete = outputCoverageTotal > 0 && outputCoverageCount === outputCoverageTotal;
  const totalTokens = inputComplete && outputComplete && totalIn != null && totalOut != null
    ? (finalUsage?.total_tokens ?? totalIn + totalOut)
    : 0;
  const costableSteps = steps.filter((step) => step.providerCostUsd != null);
  const providerCostSteps = costableSteps.filter((step) => step.costSource === "provider_response");
  const litellmCostSteps = costableSteps.filter((step) => step.costSource === "litellm_response");
  const estimatedCostSteps = costableSteps.filter((step) => step.costSource === "litellm_calculated");
  const providerCostTotal = providerCostSteps.reduce((sum, step) => sum + (step.providerCostUsd ?? 0), 0);
  const litellmCostTotal = litellmCostSteps.reduce((sum, step) => sum + (step.providerCostUsd ?? 0), 0);
  const estimatedCostTotal = estimatedCostSteps.reduce((sum, step) => sum + (step.providerCostUsd ?? 0), 0);
  const unavailableCostCount = Math.max(0, steps.length - providerCostSteps.length - litellmCostSteps.length - estimatedCostSteps.length);
  const incompleteUsageCount = steps.filter((step) => step.usageComplete === false).length;
  const incompleteCostCount = steps.filter((step) => step.costComplete === false && step.providerCostUsd != null).length;
  const legacyEstimatedCost = steps.length === 0 && finalUsage?.estimated_cost_usd != null && finalUsage.estimated_cost_usd > 0
    ? finalUsage.estimated_cost_usd
    : undefined;
  const hasNativeCallDetails = steps.some(
    (step) => step.durationMs != null || step.provider != null || step.outcome != null,
  );

  if (
    steps.length === 0 &&
    metricSteps.length === 0 &&
    !hasTiming &&
    totalTokens === 0 && totalIn == null && totalOut == null &&
    legacyEstimatedCost == null &&
    !hasModel
  ) {
    return null;
  }

  const timeStr = formatTime(totalStreamMs);
  const tpsStr = formatTps(timing?.tokensPerSecond);

  return (
    <Surface data-slot="aui_usage-details" tone="panel-2" border="none" radius="input" padding="sm" className="min-w-0 max-w-full shrink-0">
      <Text as="div" variant="body-sm" tone="default">
      {hasNativeCallDetails && (
        <StatisticsScroll label="Model call statistics">
        <table aria-label="Model calls" className="w-full min-w-[44rem] whitespace-nowrap text-left tabular-nums">
          <thead>
            <Text as="tr" variant="label" tone="muted" className="uppercase tracking-wide">
              <th scope="col" className="pb-2 pr-4 font-medium">Call</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Model</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">In</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Out</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Cost</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Time</th>
              <th scope="col" className="pb-2 font-medium text-right">State</th>
            </Text>
          </thead>
          <tbody>
            {steps.map((step, index) => (
              <tr key={step.requestId ?? index}>
                <td className="pr-4 py-2">{index + 1}</td>
                <td className="pr-4 py-2 font-mono">
                  <span title={step.modelId ?? step.provider}>
                    {step.modelRole ? `${step.modelRole === "light" ? "Light" : "Heavy"} · ` : ""}{step.modelId ?? step.provider ?? "unknown"}
                  </span>
                </td>
                <td className="pr-4 py-2 text-right">
                  {formatExactTokens(step.usage?.inputTokens)}
                </td>
                <td className="pr-4 py-2 text-right">
                  {formatExactTokens(step.usage?.outputTokens)}
                </td>
                <td
                  className="pr-4 py-2 text-right"
                  title={step.costSource ? costSourceLabel(step.costSource) : undefined}
                >
                  {step.providerCostUsd == null
                    ? "—"
                    : `${step.costSource === "litellm_calculated" ? "~" : ""}$${step.providerCostUsd.toFixed(4)}`}
                </td>
                <td className="pr-4 py-2 text-right">
                  {formatTime(step.durationMs) ?? "—"}
                </td>
                <td className="py-2 text-right">{step.outcome ?? "—"}</td>
              </tr>
            ))}
            {steps.length > 1 && (
              <tr className="border-t border-[var(--border-subtle)] text-[var(--text)]">
                <td className="pr-4 pt-2" colSpan={2}>Total</td>
                <td className="pr-4 pt-2 text-right">{formatExactTokens(totalIn)}</td>
                <td className="pr-4 pt-2 text-right">{formatExactTokens(totalOut)}</td>
                <td className="pr-4 pt-2 text-right">
                  {costableSteps.length === 0 || [providerCostSteps, litellmCostSteps, estimatedCostSteps].filter((group) => group.length > 0).length > 1
                    ? "—"
                    : `${estimatedCostSteps.length > 0 ? "~" : ""}$${costableSteps.reduce((sum, step) => sum + (step.providerCostUsd ?? 0), 0).toFixed(4)}`}
                </td>
                <td className="pt-2" colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
        </StatisticsScroll>
      )}
      {metricSteps.length > 0 && (
        <StatisticsScroll label="Model step statistics">
        <table aria-label="Model steps" className="w-full min-w-[36rem] whitespace-nowrap text-left tabular-nums">
          <thead>
            <Text as="tr" variant="label" tone="muted" className="uppercase tracking-wide">
              <th scope="col" className="pb-2 pr-4 font-medium">Step</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Model</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">In</th>
              <th scope="col" className="pb-2 pr-4 font-medium text-right">Out</th>
              <th scope="col" className="pb-2 font-medium text-right">Time</th>
            </Text>
          </thead>
          <tbody>
            {metricSteps.map((step, i) => (
              <tr key={i}>
                <td className="pr-4 py-2">{i + 1}</td>
                <td className="pr-4 py-2 font-mono">
                  {step.data?.model ?? "—"}
                </td>
                <td className="pr-4 py-2 text-right">
                  {formatExactTokens(step.data?.usage?.prompt_tokens)}
                </td>
                <td className="pr-4 py-2 text-right">
                  {formatExactTokens(step.data?.usage?.completion_tokens)}
                </td>
                <td className="py-2 text-right">
                  {formatTimeSec(step.data?.duration) ?? "—"}
                </td>
              </tr>
            ))}
            {metricSteps.length > 1 && (
              <tr className="border-t border-[var(--border-subtle)] text-[var(--text)]">
                <td className="pr-4 pt-2" colSpan={2}>
                  Total
                </td>
                <td className="pr-4 pt-2 text-right">
                  {formatExactTokens(totalIn)}
                </td>
                <td className="pr-4 pt-2 text-right">
                  {formatExactTokens(totalOut)}
                </td>
                <td className="pt-2" />
              </tr>
            )}
          </tbody>
        </table>
        </StatisticsScroll>
      )}

      {(hasTiming || totalTokens > 0 || totalIn != null || totalOut != null || steps.length > 0 || legacyEstimatedCost != null) && (
        <Text as="div" variant="meta" tone="muted" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {timing?.firstTokenTime != null && timing.firstTokenTime > 0 && (
            <span>First answer text: {formatTime(timing.firstTokenTime)}</span>
          )}
          {timeStr && <span>Total: {timeStr}</span>}
          {latency && ([
            ['queueMs', 'Queue'], ['preparationMs', 'Preparation'],
            ['providerFirstTokenMs', 'First provider output'],
            ['lightPassMs', 'Light pass'],
            ['escalationMs', 'Escalation'],
            ['heavyFirstTokenMs', 'First heavy answer text'],
            ['firstToolRequestedMs', 'First tool requested'],
            ['firstToolStartedMs', 'First tool started'],
            ['firstOperationalToolMs', 'First operational tool'],
            ['clientFirstTextMs', 'First text received'],
            ['clientFirstToolMs', 'First tool received'],
            ['clientCompletionMs', 'Completion received'],
          ] as const).map(([key, label]) => latency[key] != null && <span key={key}>{label}: {formatTime(latency[key]) ?? '0s'}</span>)}
          {tpsStr && <span>{tpsStr}</span>}
          {totalIn != null && <span>Input {formatExactTokens(totalIn)} tokens{hasStepUsage ? ` (${inputCoverageCount}/${inputCoverageTotal} calls reported)` : ""}</span>}
          {totalOut != null && <span>Output {formatExactTokens(totalOut)} tokens{hasStepUsage ? ` (${outputCoverageCount}/${outputCoverageTotal} calls reported)` : ""}</span>}
          {totalTokens > 0 && !hasStepUsage && totalIn == null && totalOut == null && <span>{totalTokens.toLocaleString()} tokens total</span>}
          {providerCostSteps.length > 0 && <span>Provider-reported cost ${providerCostTotal.toFixed(4)} ({providerCostSteps.length}/{steps.length} calls)</span>}
          {litellmCostSteps.length > 0 && <span>LiteLLM-reported cost ${litellmCostTotal.toFixed(4)} ({litellmCostSteps.length}/{steps.length} calls)</span>}
          {estimatedCostSteps.length > 0 && <span>Estimated cost ${estimatedCostTotal.toFixed(4)} ({estimatedCostSteps.length}/{steps.length} calls)</span>}
          {legacyEstimatedCost != null && <span>Estimated cost ${legacyEstimatedCost.toFixed(4)}</span>}
          {steps.length > 0 && unavailableCostCount > 0 && <span>Cost unavailable for {unavailableCostCount}/{steps.length} calls</span>}
          {incompleteUsageCount > 0 && <span>Token usage incomplete for {incompleteUsageCount}/{steps.length} calls</span>}
          {incompleteCostCount > 0 && <span>Reported cost incomplete for {incompleteCostCount}/{steps.length} calls</span>}
        </Text>
      )}
      </Text>
    </Surface>
  );
}
