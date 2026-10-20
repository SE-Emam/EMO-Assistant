import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";

/** Compact EN / ع switch. Language is a per-device preference. */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const options = [
    { value: "en" as const, label: "EN" },
    { value: "ar" as const, label: "ع" },
  ];
  return (
    <div role="group" aria-label={t("language.label")} className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLanguage(option.value)}
          aria-pressed={language === option.value}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
            language === option.value ? "bg-accent text-accent-fg" : "text-fg-subtle hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
