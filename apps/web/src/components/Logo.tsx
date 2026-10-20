import { cn } from "../lib/utils";

/** The EMO wordmark (public/logo.png). */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="EMO"
      className={cn("h-6 w-auto object-contain dark:brightness-125", className)}
      draggable={false}
    />
  );
}

/** Square app mark used for tight spaces and the install icon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-7 w-7", className)} role="img" aria-label="EMO">
      <rect width="64" height="64" rx="16" fill="#0033df" />
      <path
        d="M149 1466H1363V1153H603V920H1308V621H603V332H1385V0H149Z"
        fill="#fff"
        transform="translate(16 50) scale(0.0235 -0.0235)"
      />
    </svg>
  );
}
