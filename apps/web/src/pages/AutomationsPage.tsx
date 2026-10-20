import { useMemo, useState } from "react";
import { type Automation, type AutomationKind, type AutomationRun, type ScheduleSpec, scheduleSpecSchema, upcomingRuns } from "@emo/shared";
import { AlarmClock, Bell, Bot, CalendarClock, ChevronDown, History, ListChecks, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorNotice, Input, Label, PageHeader, Select, Spinner, Switch, Textarea } from "../components/ui";
import { keys, useApiMutation, useAutomationRuns, useAutomations } from "../hooks/queries";
import { api } from "../lib/api";
import { cn, formatDateTime, relativeTime } from "../lib/utils";
import { useI18n, type TranslationKey, type Translate } from "../lib/i18n";

const KIND_META: Record<AutomationKind, { label: TranslationKey; icon: typeof Bell; hint: TranslationKey }> = {
  reminder: { label: "automations.kindReminder", icon: Bell, hint: "automations.kindReminderHint" },
  task_digest: { label: "automations.kindTaskDigest", icon: ListChecks, hint: "automations.kindTaskDigestHint" },
  agent_prompt: { label: "automations.kindAgentPrompt", icon: Bot, hint: "automations.kindAgentPromptHint" },
};

const DAY_KEYS: TranslationKey[] = [
  "automations.sun",
  "automations.mon",
  "automations.tue",
  "automations.wed",
  "automations.thu",
  "automations.fri",
  "automations.sat",
];

function scheduleText(spec: ScheduleSpec, t: Translate): string {
  switch (spec.type) {
    case "once":
      return t("automations.scheduleOnce", { time: spec.at.replace("T", " ") });
    case "daily":
      return t("automations.scheduleDaily", { time: spec.time });
    case "weekly": {
      const days = [...new Set(spec.days)].sort((a, b) => a - b);
      const key = days.join("");
      if (days.length === 7) return t("automations.scheduleDaily", { time: spec.time });
      if (key === "12345") return t("automations.scheduleWeekday", { time: spec.time });
      if (key === "06") return t("automations.scheduleWeekend", { time: spec.time });
      const names = days.map((d) => t(DAY_KEYS[d]!));
      const join = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join("، ")} ${t("automations.and")} ${names[names.length - 1]}`;
      return t("automations.scheduleWeekly", { days: join, time: spec.time });
    }
    case "monthly":
      return t("automations.scheduleMonthly", { day: spec.day, time: spec.time });
    case "interval":
      return spec.minutes % 60 === 0
        ? t("automations.scheduleIntervalHours", { hours: spec.minutes / 60 })
        : t("automations.scheduleInterval", { minutes: spec.minutes });
  }
}

export default function AutomationsPage() {
  const { t } = useI18n();
  const { data, isLoading, error, refetch } = useAutomations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [history, setHistory] = useState<Automation | null>(null);
  const [runFilter, setRunFilter] = useState<RunFilter>("all");
  const tz = data?.timezone ?? "UTC";

  const toggle = useApiMutation(
    (a: Automation) => api(`/automations/${a.id}`, { method: "PATCH", body: { enabled: !a.enabled } }),
    { invalidate: [keys.automations] },
  );
  const remove = useApiMutation((id: string) => api(`/automations/${id}`, { method: "DELETE" }), {
    invalidate: [keys.automations],
    success: t("automations.deleted"),
    onSuccess: () => setDeleting(null),
  });

  const runNow = useApiMutation(
    (a: Automation) => api<{ run: AutomationRun }>(`/automations/${a.id}/run`, { method: "POST" }),
    {
      invalidate: [keys.automations, keys.notifications],
      success: ({ run }) => (run.status === "error" ? t("automations.runFailed", { error: run.error ?? t("automations.unknownError") }) : run.status === "skipped" ? t("automations.runSkipped") : t("automations.ranSuccessfully")),
    },
  );

  const recentRuns = useMemo(() => {
    if (!data) return [];
    if (runFilter === "error") return data.failed_runs;
    return runFilter === "all" ? data.runs : data.runs.filter((r) => r.status === runFilter);
  }, [data, runFilter]);
  const byId = useMemo(() => new Map((data?.automations ?? []).map((a) => [a.id, a])), [data]);

  const { active, inactive, upcoming } = useMemo(() => {
    const all = data?.automations ?? [];
    return {
      active: all.filter((a) => a.enabled),
      inactive: all.filter((a) => !a.enabled),
      upcoming: all
        .filter((a) => a.enabled && a.next_run)
        .sort((a, b) => a.next_run!.localeCompare(b.next_run!))
        .slice(0, 5),
    };
  }, [data]);

  const row = (a: Automation) => {
    const meta = KIND_META[a.kind];
    const Icon = meta.icon;
    return (
      <li key={a.id} className="flex items-start gap-3 px-4 py-3">
        <div className={cn("mt-0.5 rounded-lg p-2", a.enabled ? "bg-accent-soft text-accent" : "bg-muted text-fg-subtle")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{a.name}</p>
            {a.status === "failed" && <Badge tone="danger">{t("automations.lastRunFailed")}</Badge>}
            {a.status === "completed" && <Badge>{t("automations.completed")}</Badge>}
            {a.status === "running" && <Badge tone="accent">{t("automations.running")}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">{scheduleText(a.schedule, t)}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {a.next_run && a.enabled
              ? t("automations.next", { time: formatDateTime(a.next_run, tz), relative: relativeTime(a.next_run) })
              : a.status === "completed"
                ? t("automations.finished")
                : a.enabled
                  ? t("automations.notScheduled")
                  : t("automations.paused")}
            {a.last_run && ` · ${t("automations.lastRun", { time: relativeTime(a.last_run) })}`}
            {a.run_count > 0 && ` · ${a.run_count === 1 ? t("automations.runCount") : t("automations.runCountPlural", { count: a.run_count })}`}
          </p>
          {a.last_error && <p className="mt-1 text-xs text-danger">{a.last_error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => runNow.mutate(a)}
            disabled={a.status === "running" || (runNow.isPending && runNow.variables?.id === a.id)}
            aria-label={t("automations.runNow", { name: a.name })}
            title={t("automations.runNowTitle")}
          >
            {runNow.isPending && runNow.variables?.id === a.id ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setHistory(a)} aria-label={t("automations.runHistory", { name: a.name })} title={t("automations.runHistoryTitle")}>
            <History className="h-4 w-4" />
          </Button>
          {a.status !== "completed" && (
            <Switch checked={a.enabled} onChange={() => toggle.mutate(a)} label={a.enabled ? t("automations.pause", { name: a.name }) : t("automations.resume", { name: a.name })} />
          )}
          <Button variant="ghost" size="icon" onClick={() => setEditing(a)} aria-label={t("automations.edit", { name: a.name })}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleting(a)} aria-label={t("automations.delete", { name: a.name })}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <PageHeader
        title={t("automations.title")}
        description={t("automations.description", { tz })}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("automations.new")}
          </Button>
        }
      />

      {error ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.automations.length && !data?.runs.length ? (
        <EmptyState
          icon={<CalendarClock className="h-9 w-9" />}
          title={t("automations.none")}
          action={<Button variant="outline" onClick={() => setCreating(true)}>{t("automations.createReminder")}</Button>}
        >
          {t("automations.emptyHint")}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">{t("automations.upcoming")}</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {upcoming.map((a) => (
                  <div key={a.id} className="min-w-44 rounded-xl border border-border bg-surface px-4 py-3">
                    <AlarmClock className="h-4 w-4 text-accent" />
                    <p className="mt-2 truncate text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-fg-subtle">{relativeTime(a.next_run)}</p>
                    <p className="text-xs text-fg-subtle">{formatDateTime(a.next_run, tz)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">{t("automations.activeSchedules")}</h2>
              <Card>
                <ul className="divide-y divide-border">{active.map(row)}</ul>
              </Card>
            </section>
          )}
          {inactive.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">{t("automations.pausedCompleted")}</h2>
              <Card>
                <ul className="divide-y divide-border">{inactive.map(row)}</ul>
              </Card>
            </section>
          )}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{t("automations.recentExecutions")}</h2>
              <RunFilterTabs value={runFilter} onChange={setRunFilter} />
            </div>
            {!recentRuns.length ? (
              <p className="text-sm text-fg-subtle">{runFilter === "all" ? t("automations.nothingRun") : t("automations.noRunsOfType", { type: runFilter === "error" ? t("automations.filterFailed") : t("automations.filterSkipped") })}</p>
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {recentRuns.slice(0, 20).map((r) => {
                    const owner = byId.get(r.automation_id);
                    return <RunItem key={r.id} run={r} tz={tz} showName onOpenHistory={owner ? () => setHistory(owner) : undefined} />;
                  })}
                </ul>
              </Card>
            )}
          </section>
        </div>
      )}

      <AutomationForm key={editing?.id ?? "new"} open={creating || !!editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} tz={tz} automation={editing} />
      <RunHistoryDialog key={history?.id ?? "none"} automation={history} tz={tz} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={!!deleting}
        title={t("automations.deleteTitle")}
        message={t("automations.deleteMessage", { name: deleting?.name ?? "" })}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
      />
    </div>
  );
}

type RunFilter = "all" | "error" | "skipped";
const RUN_FILTERS: Record<RunFilter, TranslationKey> = { all: "automations.filterAll", error: "automations.filterFailed", skipped: "automations.filterSkipped" };
const RUN_TONE = { success: "success", error: "danger", skipped: "warning", running: "accent" } as const;
const RUN_LABEL: Record<AutomationRun["status"], TranslationKey> = {
  success: "automations.statusSuccess",
  error: "automations.statusFailed",
  skipped: "automations.statusSkipped",
  running: "automations.statusRunning",
};

function RunFilterTabs({ value, onChange }: { value: RunFilter; onChange: (v: RunFilter) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-1 rounded-lg bg-subtle p-0.5" role="group" aria-label={t("automations.filterRuns")}>
      {(Object.keys(RUN_FILTERS) as RunFilter[]).map((f) => (
        <button
          type="button"
          key={f}
          onClick={() => onChange(f)}
          aria-pressed={value === f}
          className={cn("rounded-md px-2 py-0.5 text-xs font-medium", value === f ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
        >
          {t(RUN_FILTERS[f])}
        </button>
      ))}
    </div>
  );
}

function duration(run: AutomationRun): string {
  if (!run.finished_at) return "";
  const ms = Date.parse(run.finished_at) - Date.parse(run.started_at);
  if (!(ms >= 0)) return "";
  return ms < 1000 ? "<1s" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** One execution; click to expand the full output or error. */
function RunItem({ run, tz, showName, onOpenHistory }: { run: AutomationRun; tz: string; showName?: boolean; onOpenHistory?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const detail = run.error ?? run.result ?? (run.status === "running" ? t("automations.runningEllipsis") : "");
  const took = duration(run);
  return (
    <li className="text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-2.5 text-start hover:bg-subtle">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {showName ? run.automation_name : formatDateTime(run.started_at, tz)}
          </p>
          <p className={cn("text-xs", open ? "hidden" : "truncate", run.status === "error" ? "text-danger" : "text-fg-subtle")}>{detail}</p>
        </div>
        <div className="shrink-0 text-end">
          <Badge tone={RUN_TONE[run.status]}>{t(RUN_LABEL[run.status])}</Badge>
          <p className="mt-0.5 text-xs text-fg-subtle" title={formatDateTime(run.started_at, tz)}>
            {relativeTime(run.started_at)}
            {took && ` · ${took}`}
          </p>
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-3">
          {detail ? (
            <p className={cn("whitespace-pre-wrap break-words rounded-lg bg-subtle px-3 py-2 text-xs", run.status === "error" ? "text-danger" : "text-fg-muted")}>{detail}</p>
          ) : (
            <p className="text-xs text-fg-subtle">{t("automations.noOutput")}</p>
          )}
          <p className="text-xs text-fg-subtle">
            {t("automations.started", { time: formatDateTime(run.started_at, tz) })}
            {run.finished_at && ` · ${t("automations.finishedAt", { time: formatDateTime(run.finished_at, tz) })}`}
            {onOpenHistory && (
              <>
                {" · "}
                <button type="button" onClick={onOpenHistory} className="text-accent hover:underline">
                  {t("automations.allRuns")}
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

function RunHistoryDialog({ automation, tz, onClose }: { automation: Automation | null; tz: string; onClose: () => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<RunFilter>("all");
  const query = useAutomationRuns(automation?.id ?? null, filter === "all" ? undefined : filter);
  const runs = query.data?.pages.flatMap((p) => p.runs) ?? [];
  return (
    <Dialog open={!!automation} onClose={onClose} title={automation ? t("automations.historyTitle", { name: automation.name }) : t("automations.runHistoryTitle")}>
      {automation && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-fg-subtle">
              {scheduleText(automation.schedule, t)}
              {automation.run_count > 0 && ` · ${automation.run_count === 1 ? t("automations.totalRunsOne", { count: automation.run_count }) : t("automations.totalRuns", { count: automation.run_count })}`}
            </p>
            <RunFilterTabs value={filter} onChange={setFilter} />
          </div>
          {query.error ? (
            <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
          ) : query.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !runs.length ? (
            <p className="py-6 text-center text-sm text-fg-subtle">{filter === "all" ? t("automations.notRunYet") : t("automations.noRunsOfType", { type: filter === "error" ? t("automations.filterFailed") : t("automations.filterSkipped") })}</p>
          ) : (
            <Card>
              <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
                {runs.map((r) => (
                  <RunItem key={r.id} run={r} tz={tz} />
                ))}
              </ul>
            </Card>
          )}
          {query.hasNextPage && (
            <Button variant="outline" className="w-full" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t("automations.loadMore")}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function tomorrowAt9(): string {
  const d = new Date(Date.now() + 86400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

function AutomationForm({ open, onClose, tz, automation }: { open: boolean; onClose: () => void; tz: string; automation?: Automation | null }) {
  const { t } = useI18n();
  // Remounted per automation (via `key`), so editing starts from the saved values.
  const initial = automation?.schedule;
  const [kind, setKind] = useState<AutomationKind>(automation?.kind ?? "reminder");
  const [name, setName] = useState(automation?.name ?? "");
  const [message, setMessage] = useState(automation?.message ?? "");
  const [type, setType] = useState<ScheduleSpec["type"]>(initial?.type ?? "once");
  const [at, setAt] = useState(initial?.type === "once" ? initial.at : tomorrowAt9());
  const [time, setTime] = useState(initial && "time" in initial ? initial.time : "09:00");
  const [days, setDays] = useState<number[]>(initial?.type === "weekly" ? initial.days : [1]);
  const [day, setDay] = useState(initial?.type === "monthly" ? initial.day : 1);
  const [minutes, setMinutes] = useState(initial?.type === "interval" ? initial.minutes : 60);

  const schedule: ScheduleSpec =
    type === "once"
      ? { type, at }
      : type === "daily"
        ? { type, time }
        : type === "weekly"
          ? { type, days, time }
          : type === "monthly"
            ? { type, day, time }
            : { type, minutes };

  const preview = useMemo(() => {
    const parsed = scheduleSpecSchema.safeParse(schedule);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("automations.invalidSchedule"), runs: [] as Date[] };
    const runs = upcomingRuns(parsed.data, tz, new Date(), 3);
    if (!runs.length) return { error: type === "once" ? t("automations.pastTime") : t("automations.neverRuns"), runs };
    return { error: null, runs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(schedule), tz]);

  const reset = () => {
    setName("");
    setMessage("");
    setKind("reminder");
    setType("once");
    setAt(tomorrowAt9());
  };
  const save = useApiMutation(
    () => {
      const finalName = name.trim() || message.trim().slice(0, 80) || t(KIND_META[kind].label);
      if (!automation) return api("/automations", { method: "POST", body: { name: finalName, kind, message, schedule } });
      // Saving a finished one-off with a new schedule brings it back to life.
      const revive = automation.status === "completed" ? { enabled: true } : {};
      return api(`/automations/${automation.id}`, { method: "PATCH", body: { name: finalName, message, schedule, ...revive } });
    },
    {
      invalidate: [keys.automations],
      success: automation ? t("automations.saved") : t("automations.scheduled"),
      onSuccess: () => {
        if (!automation) reset();
        onClose();
      },
    },
  );
  const needsMessage = kind !== "task_digest";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={automation ? t("automations.editTitle") : t("automations.newTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={(needsMessage && !message.trim()) || !!preview.error}>
            {automation ? t("common.save") : t("automations.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!automation && (
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND_META) as AutomationKind[]).map((k) => {
              const Icon = KIND_META[k].icon;
              return (
                <button type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors",
                    kind === k ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-subtle",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(KIND_META[k].label)}
              </button>
            );
          })}
        </div>
        )}
        <p className="text-xs text-fg-subtle">{t(KIND_META[kind].hint)}</p>
        <div>
          <Label htmlFor="auto-name" hint={t("automations.optional")}>
            {t("automations.name")}
          </Label>
          <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder={kind === "task_digest" ? t("automations.namePlaceholderDigest") : t("automations.namePlaceholder")} />
        </div>
        {needsMessage && (
          <div>
            <Label htmlFor="auto-message">{kind === "reminder" ? t("automations.reminderMessage") : t("automations.prompt")}</Label>
            <Textarea
              id="auto-message"
              rows={kind === "agent_prompt" ? 3 : 2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              placeholder={kind === "reminder" ? t("automations.messagePlaceholder") : t("automations.promptPlaceholder")}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <Label htmlFor="auto-type">{t("automations.repeat")}</Label>
            <Select id="auto-type" value={type} onChange={(e) => setType(e.target.value as ScheduleSpec["type"])}>
              <option value="once">{t("automations.once")}</option>
              <option value="daily">{t("automations.daily")}</option>
              <option value="weekly">{t("automations.weekly")}</option>
              <option value="monthly">{t("automations.monthly")}</option>
              <option value="interval">{t("automations.interval")}</option>
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            {type === "once" ? (
              <>
                <Label htmlFor="auto-at">{t("automations.when")}</Label>
                <Input id="auto-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              </>
            ) : type === "interval" ? (
              <>
                <Label htmlFor="auto-min" hint={t("automations.atLeast15")}>{t("automations.minutes")}</Label>
                <Input id="auto-min" type="number" min={15} max={44640} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
              </>
            ) : (
              <>
                <Label htmlFor="auto-time">{t("automations.time")}</Label>
                <Input id="auto-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </>
            )}
          </div>
        </div>
        {type === "weekly" && (
          <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {([["automations.weekdays", [1, 2, 3, 4, 5]], ["automations.weekends", [0, 6]], ["automations.everyDay", [0, 1, 2, 3, 4, 5, 6]]] as const).map(([label, set]) => (
              <button
                type="button"
                key={label}
                onClick={() => setDays([...set])}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted hover:bg-subtle"
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("automations.daysOfWeek")}>
            {DAY_KEYS.map((d, i) => (
              <button type="button"
                key={d}
                onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
                aria-pressed={days.includes(i)}
                className={cn(
                  "h-9 w-11 rounded-lg border text-xs font-medium",
                  days.includes(i) ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted",
                )}
              >
                {t(d)}
              </button>
            ))}
          </div>
          </div>
        )}
        {type === "monthly" && (
          <div>
            <Label htmlFor="auto-day" hint={t("automations.monthHint")}>
              {t("automations.dayOfMonth")}
            </Label>
            <Input id="auto-day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} />
          </div>
        )}
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-fg-muted">
          <span className="font-medium text-fg">{type === "weekly" && !days.length ? t("automations.noDays") : scheduleText(schedule, t)}</span> · {tz}
          {preview.error ? (
            <span className="mt-1 block text-danger">{preview.error}</span>
          ) : (
            <span className="mt-1 block">
              {preview.runs.length === 1
                ? t("automations.runsAt", { datetime: `${formatDateTime(preview.runs[0]!.toISOString(), tz)} (${relativeTime(preview.runs[0]!.toISOString())})` })
                : t("automations.nextRuns", { list: preview.runs.map((d) => `${formatDateTime(d.toISOString(), tz)} (${relativeTime(d.toISOString())})`).join(" · ") })}
            </span>
          )}
        </p>
      </div>
    </Dialog>
  );
}
