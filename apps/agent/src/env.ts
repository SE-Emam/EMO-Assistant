import type { EmoAgent } from "./agent/emo-agent";

export interface Env {
  AI?: Ai;
  EmoAgent: DurableObjectNamespace<EmoAgent>;
  /** PBKDF2 hash of the owner password, set by the installer as a Worker secret. */
  OWNER_PASSWORD_HASH?: string;
  /** Plain owner password, for deploys that cannot set the hash (a one-Worker deploy). Ignored when the hash is set; a weak one counts as not configured. */
  OWNER_PASSWORD?: string;
  /** Random 256-bit secret used to key session token hashes. Worker secret. */
  SESSION_SECRET?: string;
  /**
   * Web Push (VAPID) key pair, base64url: the uncompressed public point and the private scalar.
   * Set by the installer as Worker secrets; without them push is unavailable and nothing else changes.
   */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Contact sent to push services ("mailto:..." or "https://..."). Defaults to the app's own URL. */
  VAPID_SUBJECT?: string;
  /** "development" enables local-only conveniences (mock AI, http cookies). Never set in production. */
  EMO_ENV?: string;
  /** Development only: use the deterministic mock AI provider. */
  EMO_MOCK_AI?: string;
  /** Development only: extra allowed origins (comma separated), e.g. the Vite dev server. */
  EMO_DEV_ORIGINS?: string;
  /** Installer defaults: the owner's timezone and chosen agent name. */
  EMO_DEFAULT_TIMEZONE?: string;
  EMO_AGENT_NAME?: string;
  /** Informational, written by the installer. */
  EMO_INSTALLATION_ID?: string;
  EMO_DEPLOYED_VERSION?: string;
}
