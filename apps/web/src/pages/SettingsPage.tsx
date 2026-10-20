import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AI_PROVIDERS, aiProviderPreset, checkPasswordStrength, GITHUB_URL, LIMIT_CEILINGS, type AiProviderId, type Limits, type MemoryHistorySettings, type Settings, EMO_VERSION } from "@emo/shared";
import { Download, ExternalLink, LogOut, Monitor, Moon, Sun, Upload } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, ErrorNotice, Input, Label, PageHeader, Select, Spinner, Switch } from "../components/ui";
import { SemanticRecallCard } from "../components/SemanticRecallCard";
import { PushNotificationsCard } from "../components/PushNotificationsCard";
import { RemoteAccessCard } from "../components/RemoteAccessCard";
import { LanguageToggle } from "../components/LanguageToggle";
import { UsageBreakdown, UsagePricingNote } from "../components/UsageBreakdown";
import { keys, useApiMutation, useSessions, useSettings, useSystemInfo, useUpdateStatus, useUsage } from "../hooks/queries";
import { useSession } from "../hooks/session";
import { useToast, errorMessage } from "../hooks/toast";
import { api, ApiError } from "../lib/api";
import { applyTheme } from "../lib/theme";
import { cn, relativeTime } from "../lib/utils";
import { useI18n, type TranslationKey } from "../lib/i18n";

const PROVIDER_KEYS: Record<AiProviderId, { label: TranslationKey; description: TranslationKey }> = {
  "workers-ai": { label: "ai.workersAi.label", description: "ai.workersAi.description" },
  openai: { label: "ai.openai.label", description: "ai.openai.description" },
  openrouter: { label: "ai.openrouter.label", description: "ai.openrouter.description" },
  groq: { label: "ai.groq.label", description: "ai.groq.description" },
  nvidia: { label: "ai.nvidia.label", description: "ai.nvidia.description" },
  "opencode-zen": { label: "ai.opencodeZen.label", description: "ai.opencodeZen.description" },
  gemini: { label: "ai.gemini.label", description: "ai.gemini.description" },
  ollama: { label: "ai.ollama.label", description: "ai.ollama.description" },
  custom: { label: "ai.custom.label", description: "ai.custom.description" },
};

function passwordStrengthMessage(message: string, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  const min = /Use at least (\d+) characters/.exec(message);
  if (min) return t("settings.passwordMin", { count: min[1]! });
  if (message.startsWith("Use at most")) return t("settings.passwordMax");
  if (message.startsWith("Avoid repeating")) return t("settings.passwordRepeated");
  if (message.startsWith("Mix letters")) return t("settings.passwordMix");
  if (message.startsWith("Avoid common")) return t("settings.passwordCommon");
  return message;
}

const TABS = ["General", "AI", "Privacy", "Security", "About"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  General: "settings.general",
  AI: "settings.ai",
  Privacy: "settings.tab.privacy",
  Security: "settings.security",
  About: "settings.about",
};
type Tab = (typeof TABS)[number];

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-5 text-fg-subtle">{hint}</p>}
      </div>
      <div className="shrink-0 sm:w-64">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-fg-subtle">{title}</h2>
      <Card>
        <div className="divide-y divide-border">{children}</div>
      </Card>
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get("tab");
  const tab: Tab = TABS.find((t) => t === param) ?? "General";
  const setTab = (t: Tab) => setSearchParams(t === "General" ? {} : { tab: t }, { replace: true });
  const { data: settings, isLoading, error, refetch } = useSettings();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <PageHeader title={t("settings.title")} />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((tabId) => (
          <button type="button"
            key={tabId}
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === tabId ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t(TAB_LABELS[tabId])}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : isLoading || !settings ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {tab === "General" && <GeneralTab settings={settings} />}
          {tab === "General" && <PushNotificationsCard />}
          {tab === "AI" && <AiTab settings={settings} />}
          {tab === "Privacy" && <PrivacyTab />}
          {tab === "Security" && <SecurityTab />}
          {tab === "About" && <AboutTab settings={settings} />}
        </div>
      )}
    </div>
  );
}

function useSaveSettings() {
  const qc = useQueryClient();
  const { t } = useI18n();
  type Patch = Partial<Omit<Settings, "limits" | "memoryHistory">> & {
    limits?: Partial<Limits>;
    memoryHistory?: Partial<MemoryHistorySettings>;
    /** Write-only. Null clears the stored key. */
    aiApiKey?: string | null;
  };
  return useApiMutation((patch: Patch) => api<{ settings: Settings; aiKeySet: boolean }>("/settings", { method: "PATCH", body: patch }), {
    success: t("settings.saved"),
    onSuccess: (r) => {
      qc.setQueryData(keys.settings, r.settings);
      void qc.invalidateQueries({ queryKey: ["session"] });
      void qc.invalidateQueries({ queryKey: keys.automations });
      void qc.invalidateQueries({ queryKey: keys.update });
      void qc.invalidateQueries({ queryKey: keys.system });
    },
  });
}

function GeneralTab({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const save = useSaveSettings();
  const [name, setName] = useState(settings.agentName);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [settings.timezone];
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Section title={t("settings.general.title")}>
      <Row label={t("settings.nameLabel")} hint={t("settings.nameDescription")}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name !== settings.agentName) save.mutate({ agentName: name.trim() });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label={t("settings.nameLabel")} />
          <Button type="submit" variant="outline" disabled={!name.trim() || name === settings.agentName}>
            {t("common.save")}
          </Button>
        </form>
      </Row>
      <Row
        label={t("settings.timezone")}
        hint={
          settings.timezone !== browserTz ? (
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => save.mutate({ timezone: browserTz })}>
              {t("settings.useDeviceTimezone", { zone: browserTz })}
            </button>
          ) : (
            t("settings.timezoneDescription")
          )
        }
      >
        <Select value={settings.timezone} onChange={(e) => save.mutate({ timezone: e.target.value })} aria-label={t("settings.timezone")}>
          {(zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones]).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Row>
      <Row label={t("settings.language")} hint={t("settings.languageHint")}>
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
      </Row>
      <Row label={t("settings.themeLabel")}>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["system", Monitor],
              ["light", Sun],
              ["dark", Moon],
            ] as const
          ).map(([value, Icon]) => (
            <button type="button"
              key={value}
              onClick={() => {
                applyTheme(value);
                save.mutate({ theme: value });
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium capitalize",
                settings.theme === value ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`settings.theme.${value}`)}
            </button>
          ))}
        </div>
      </Row>
    </Section>
  );
}

const LIMIT_FIELDS: { key: keyof Limits; label: string; hint: string }[] = [
  { key: "maxOutputTokens", label: "settings.limitOutput", hint: "settings.limitOutputHint" },
  { key: "maxContextTokens", label: "settings.limitContext", hint: "settings.limitContextHint" },
  { key: "maxToolCalls", label: "settings.limitTools", hint: "settings.limitToolsHint" },
  { key: "maxAgentIterations", label: "settings.limitSteps", hint: "settings.limitStepsHint" },
  { key: "maxAiRequestsPerDay", label: "settings.limitRequests", hint: "settings.limitRequestsHint" },
  { key: "maxScheduledAiRunsPerDay", label: "settings.limitRuns", hint: "settings.limitRunsHint" },
];

function AiTab({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const save = useSaveSettings();
  const usage = useUsage();
  const info = useSystemInfo();
  const [provider, setProvider] = useState<AiProviderId>(settings.aiProvider);
  const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.aiBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [limits, setLimits] = useState<Limits>(settings.limits);
  const [temperature, setTemperature] = useState(settings.temperature);
  const dirtyLimits = JSON.stringify(limits) !== JSON.stringify(settings.limits) || temperature !== settings.temperature;
  const preset = aiProviderPreset(provider);
  const needsKey = !preset.keyless;
  const keySet = info.data?.ai_key_set ?? false;
  const changed = provider !== settings.aiProvider || model !== settings.model || baseUrl !== settings.aiBaseUrl || apiKey.trim() !== "";
  const valid = model.trim().length > 0 && (provider !== "custom" || baseUrl.trim().length > 0);

  const changeProvider = (next: AiProviderId) => {
    const previous = aiProviderPreset(provider);
    setProvider(next);
    // Move the placeholder model along, but never overwrite an id the owner typed.
    if (!model.trim() || model === previous.defaultModel) setModel(aiProviderPreset(next).defaultModel);
    if (next !== "custom") setBaseUrl("");
  };

  const saveModel = () => {
    save.mutate({
      aiProvider: provider,
      model: model.trim(),
      aiBaseUrl: baseUrl.trim(),
      ...(apiKey.trim() ? { aiApiKey: apiKey.trim() } : {}),
    });
    setApiKey("");
  };

  return (
    <>
      <Section title={t("settings.modelSection")}>
        <Row label={t("settings.provider")} hint={t(PROVIDER_KEYS[provider].description)}>
          <Select value={provider} onChange={(e) => changeProvider(e.target.value as AiProviderId)} aria-label={t("settings.providerAria")}>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(PROVIDER_KEYS[p.id].label)}
              </option>
            ))}
          </Select>
        </Row>
        <Row label={t("settings.model")} hint={t("settings.modelHint", { default: preset.defaultModel ? t("settings.modelDefault", { model: preset.defaultModel }) : "" })}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} aria-label={t("settings.modelAria")} className="font-mono text-xs" placeholder={preset.defaultModel} />
        </Row>
        <Row
          label={provider === "custom" ? t("settings.baseUrl") : t("settings.baseUrlOverride")}
          hint={provider === "custom" ? t("settings.baseUrlRequired") : t("settings.baseUrlHint", { target: preset.baseUrl ?? t("settings.providerDefault") })}
        >
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            aria-label={t("settings.baseUrl")}
            className="font-mono text-xs"
            placeholder={preset.baseUrl ?? "https://example.com/v1"}
          />
        </Row>
        {needsKey && (
          <Row
            label={t("settings.apiKey")}
            hint={keySet ? t("settings.apiKeyStored") : t("settings.apiKeyHint")}
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-label={t("settings.apiKeyAria")}
              autoComplete="off"
              placeholder={keySet ? t("settings.apiKeyConfiguredPlaceholder") : t("settings.apiKeyPlaceholder")}
              className="font-mono text-xs"
            />
          </Row>
        )}
        <Row label={t("settings.status")} hint={t("settings.statusHint")}>
          <div className="space-y-1 text-end text-xs text-fg-muted">
            <Badge tone={info.data?.ai_ready ? "success" : "warning"}>{info.data?.ai_ready ? t("settings.ready") : t("settings.notConfigured")}</Badge>
            <p>
              {t("settings.keyLabel")}: {needsKey ? (keySet ? t("settings.keyConfigured") : t("settings.keyMissing")) : t("settings.keyNotRequired")}
            </p>
          </div>
        </Row>
        <div className="flex justify-end gap-2 px-5 py-3">
          {needsKey && keySet && (
            <Button
              variant="ghost"
              onClick={() => {
                save.mutate({ aiApiKey: null });
                setApiKey("");
              }}
            >
              {t("settings.clearKey")}
            </Button>
          )}
          <Button onClick={saveModel} disabled={!changed || !valid} loading={save.isPending}>
            {t("settings.saveModel")}
          </Button>
        </div>
        <Row label={t("settings.learn")} hint={t("settings.learnHint")}>
          <div className="flex justify-end">
            <Switch checked={settings.autoMemory} onChange={(v) => save.mutate({ autoMemory: v })} label={t("settings.learn")} />
          </div>
        </Row>
        <Row label={t("settings.demo")} hint={t("settings.demoDescription")}>
          <div className="flex justify-end">
            <Switch checked={settings.demoMode} onChange={(v) => save.mutate({ demoMode: v })} label={t("settings.demo")} />
          </div>
        </Row>
      </Section>

      <Section title={t("settings.limitsSection")}>
        <Row label={t("settings.temperature")} hint={t("settings.temperatureHint")}>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={1.5} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" aria-label={t("settings.temperatureAria")} />
            <span className="w-8 text-end text-sm tabular-nums">{temperature.toFixed(1)}</span>
          </div>
        </Row>
        {LIMIT_FIELDS.map((f) => (
          <Row key={f.key} label={t(f.label)} hint={`${t(f.hint)} ${t("settings.maxValue", { value: LIMIT_CEILINGS[f.key] })}`}>
            <Input
              type="number"
              min={0}
              max={LIMIT_CEILINGS[f.key]}
              value={limits[f.key]}
              onChange={(e) => setLimits({ ...limits, [f.key]: Number(e.target.value) })}
              aria-label={t(f.label)}
            />
          </Row>
        ))}
        <div className="flex justify-end gap-2 px-5 py-3">
          <Button
            variant="ghost"
            disabled={!dirtyLimits}
            onClick={() => {
              setLimits(settings.limits);
              setTemperature(settings.temperature);
            }}
          >
            {t("settings.reset")}
          </Button>
          <Button disabled={!dirtyLimits} loading={save.isPending} onClick={() => save.mutate({ limits, temperature })}>
            {t("settings.saveLimits")}
          </Button>
        </div>
      </Section>

      <Section title={t("settings.usageSection")}>
        {usage.isLoading || !usage.data ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              {[
                [t("settings.requestsToday"), `${usage.data.today.ai_requests} / ${usage.data.limits.maxAiRequestsPerDay}`],
                [t("settings.errorsToday"), usage.data.today.ai_errors.toLocaleString()],
                [t("settings.toolCallsToday"), String(usage.data.today.tool_calls)],
                [t("settings.scheduledRunsToday"), `${usage.data.today.scheduled_ai_runs} / ${usage.data.limits.maxScheduledAiRunsPerDay}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-5 py-4">
                  <p className="text-xs text-fg-subtle">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-px bg-border md:grid-cols-2">
              <div className="bg-surface px-5 py-4">
                <h3 className="mb-3 text-sm font-medium">{t("settings.todayUTC")}</h3>
                <UsageBreakdown counters={usage.data.today} />
              </div>
              <div className="bg-surface px-5 py-4">
                <h3 className="mb-3 text-sm font-medium">{t("settings.last7")}</h3>
                <p className="mb-3 text-xs tabular-nums text-fg-muted">
                  {t("settings.last7Summary", { requests: usage.data.last_7_days.ai_requests.toLocaleString(), errors: usage.data.last_7_days.ai_errors.toLocaleString(), tools: usage.data.last_7_days.tool_calls.toLocaleString(), runs: usage.data.last_7_days.scheduled_ai_runs.toLocaleString() })}
                </p>
                <UsageBreakdown counters={usage.data.last_7_days} />
              </div>
            </div>
            <div className="px-5 py-4 text-xs leading-5 text-fg-subtle">
              <Badge tone="warning" className="mb-2">
                {t("settings.estimatesBadge")}
              </Badge>
              <UsagePricingNote data={usage.data} />
              {usage.data.dashboard_url && (
                <a href={usage.data.dashboard_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent hover:underline">
                  {settings.aiProvider === "workers-ai" ? t("settings.openWorkersUsage") : t("settings.openProviderDocs", { provider: aiProviderPreset(settings.aiProvider).label })}{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </>
        )}
      </Section>
      <SemanticRecallCard />
      <MemoryHistorySection settings={settings} />
    </>
  );
}

function MemoryHistorySection({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const save = useSaveSettings();
  const mh = settings.memoryHistory;
  return (
    <Section title={t("settings.memoryHistorySection")}>
      <Row
        label={t("settings.conflictReview")}
        hint={t("settings.conflictReviewHint")}
      >
        <div className="flex justify-end">
          <Switch checked={mh.conflictReview} onChange={(v) => save.mutate({ memoryHistory: { conflictReview: v } })} label={t("settings.conflictReview")} />
        </div>
      </Row>
      {mh.conflictReview && (
        <Row label={t("settings.aiConflict")} hint={t("settings.aiConflictHint")}>
          <div className="flex justify-end">
            <Switch checked={mh.aiConflictCheck} onChange={(v) => save.mutate({ memoryHistory: { aiConflictCheck: v } })} label={t("settings.aiConflict")} />
          </div>
        </Row>
      )}
    </Section>
  );
}

function PrivacyTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<"history" | "memories" | null>(null);
  const clear = useApiMutation(
    (what: "history" | "memories") => api(what === "history" ? "/conversations" : "/memories", { method: "DELETE", body: { confirm: "DELETE" } }),
    {
      invalidate: [["conversations"], ["memories"]],
      success: (r) => t("settings.deletedItems", { count: (r as { deleted: number }).deleted }),
      onSuccess: () => setConfirm(null),
    },
  );

  async function onImport(file: File) {
    setImporting(true);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(t("settings.backupTooLarge"));
      const json = JSON.parse(await file.text());
      const r = await api<{ imported: Record<string, number> & { automations_paused: number; ignored_settings: string[] } }>("/import", {
        method: "POST",
        body: json,
      });
      const { automations_paused, ignored_settings, ...counts } = r.imported;
      const notes = [
        automations_paused ? t("settings.importedPaused", { count: automations_paused }) : "",
        ignored_settings.length ? t("settings.importedKept", { keys: ignored_settings.join(", ") }) : "",
      ].filter(Boolean);
      toast(t("settings.imported", { counts: Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", "), notes: notes.length ? `. ${notes.join("; ")}.` : "" }));
      await qc.invalidateQueries();
    } catch (error) {
      toast(error instanceof SyntaxError ? t("settings.invalidJson") : errorMessage(error), "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Section title={t("settings.dataSection")}>
        <div className="px-5 py-4 text-sm leading-6 text-fg-muted">
          {t("settings.dataDescription")}
        </div>
        <Row label={t("settings.export")} hint={t("settings.exportHint")}>
          <a href="/api/export" download="emo-backup.json" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-subtle">
            <Download className="h-4 w-4" /> {t("settings.downloadBackup")}
          </a>
        </Row>
        <Row label={t("settings.import")} hint={t("settings.importHint")}>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          <Button variant="outline" className="w-full justify-center" loading={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {t("settings.chooseBackup")}
          </Button>
        </Row>
      </Section>
      <Section title={t("settings.dangerSection")}>
        <Row label={t("settings.deleteHistory")} hint={t("settings.deleteHistoryHint")}>
          <Button variant="outline" className="w-full justify-center text-danger" onClick={() => setConfirm("history")}>
            {t("settings.deleteHistoryButton")}
          </Button>
        </Row>
        <Row label={t("settings.clearMemories")} hint={t("settings.clearMemoriesHint")}>
          <Button variant="outline" className="w-full justify-center text-danger" onClick={() => setConfirm("memories")}>
            {t("settings.clearMemoriesButton")}
          </Button>
        </Row>
      </Section>
      <ConfirmDialog
        open={!!confirm}
        title={confirm === "history" ? t("settings.deleteAllTitle") : t("settings.clearAllTitle")}
        message={t("settings.deleteAllMessage")}
        confirmLabel={confirm === "history" ? t("settings.deleteAll") : t("settings.clearAll")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && clear.mutate(confirm)}
        loading={clear.isPending}
      />
    </>
  );
}

function SecurityTab() {
  const { t } = useI18n();
  const { logout } = useSession();
  const sessions = useSessions();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const strength = next ? checkPasswordStrength(next) : null;
  const change = useApiMutation(() => api("/auth/password", { method: "POST", body: { current_password: current, new_password: next } }), {
    invalidate: [keys.sessions],
    success: t("settings.passwordChanged"),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirmNext("");
    },
  });
  const revoke = useApiMutation((id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }), { invalidate: [keys.sessions], success: t("settings.sessionSignedOut") });
  const revokeOthers = useApiMutation(() => api("/auth/sessions/revoke-others", { method: "POST", body: {} }), {
    invalidate: [keys.sessions],
    success: t("settings.signedOutOthers"),
  });
  useEffect(() => setFormError(change.error instanceof ApiError ? change.error.message : null), [change.error]);

  return (
    <>
      <Section title={t("settings.changePassword")}>
        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== confirmNext) return setFormError(t("settings.passwordsMismatch"));
            if (strength) return setFormError(passwordStrengthMessage(strength, t));
            setFormError(null);
            change.mutate(undefined);
          }}
        >
          <input type="text" autoComplete="username" value="owner" readOnly hidden />
          <div>
            <Label htmlFor="pw-current">{t("settings.currentPassword")}</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pw-new">{t("settings.newPassword")}</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              {next && <p className={cn("mt-1 text-xs", strength ? "text-warning" : "text-success")}>{strength ? passwordStrengthMessage(strength, t) : t("settings.strongEnough")}</p>}
            </div>
            <div>
              <Label htmlFor="pw-confirm">{t("settings.confirmPassword")}</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} />
            </div>
          </div>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end">
            <Button type="submit" loading={change.isPending} disabled={!current || !next || !confirmNext}>
              {t("settings.changePasswordButton")}
            </Button>
          </div>
        </form>
      </Section>
      <Section title={t("settings.activeSessions")}>
        {sessions.isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : (
          sessions.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {describeAgent(s.user_agent)} {s.current && <Badge tone="accent">{t("settings.thisDevice")}</Badge>}
                </p>
                <p className="text-xs text-fg-subtle">
                  {t("settings.signedIn", { created: relativeTime(s.created_at), seen: relativeTime(s.last_seen_at) })}
                </p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}>
                  {t("settings.signOut")}
                </Button>
              )}
            </div>
          ))
        )}
        <div className="flex flex-wrap justify-end gap-2 px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => revokeOthers.mutate(undefined)} loading={revokeOthers.isPending}>
            {t("settings.signOutOthers")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" /> {t("settings.lockDevice")}
          </Button>
        </div>
      </Section>
      <p className="px-1 text-xs leading-5 text-fg-subtle">
        {t("settings.forgotPassword", { command: "" })}
        <code className="rounded bg-muted px-1" dir="ltr">npx create-emo@latest reset-password</code>
      </p>
      <RemoteAccessCard />
    </>
  );
}

function describeAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function AboutTab({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const info = useSystemInfo();
  const update = useUpdateStatus();
  const save = useSaveSettings();
  const latest = update.data?.update_available ? update.data.latest : null;
  return (
    <Section title={t("settings.aboutSection")}>
      <Row label={t("settings.version")} hint={latest ? t("settings.versionAvailable", { version: latest }) : undefined}>
        <div className="flex items-center justify-end gap-2">
          {latest && <Badge tone="accent">{t("settings.new")}</Badge>}
          <p className="font-mono text-sm">{info.data?.deployed_version ?? EMO_VERSION}</p>
        </div>
      </Row>
      <Row label={t("settings.updateCheck")} hint={t("settings.checkUpdatesHint")}>
        <div className="flex justify-end">
          <Switch checked={settings.updateCheck} onChange={(v) => save.mutate({ updateCheck: v })} label={t("settings.updateCheck")} />
        </div>
      </Row>
      <Row label={t("settings.deployment")} hint={t("settings.deploymentHint")}>
        <div className="space-y-1 text-end text-xs text-fg-muted">
          {info.data ? (
            <>
              <p>{t("settings.installation")}: <span className="font-mono">{info.data.installation_id ?? "local"}</span></p>
              <p>{t("settings.schema", { schema: info.data.schema_version, env: info.data.environment })}</p>
              <p>
                {t("settings.ai")}:{" "}
                {info.data.ai_provider === "mock"
                  ? t("settings.demoResponder")
                  : info.data.ai_ready
                    ? aiProviderPreset(info.data.ai_selected_provider as AiProviderId).label
                    : t("settings.notConfigured")}
              </p>
            </>
          ) : (
            <Spinner className="ms-auto h-4 w-4" />
          )}
        </div>
      </Row>
      <Row label={t("settings.sourceCode")} hint={t("settings.sourceHint")}>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-1 text-sm text-accent hover:underline">
          GitHub <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Row>
      <Row label={t("settings.update")} hint={t("settings.updateHint")}>
        <code className="block rounded bg-muted px-2 py-1 text-end text-xs">npx create-emo@latest update</code>
      </Row>
    </Section>
  );
}
