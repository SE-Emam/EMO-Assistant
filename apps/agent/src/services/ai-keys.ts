import { ValidationError } from "../api/errors";
import type { Database } from "../db/database";

/** `tal_settings` key for the encrypted provider API key. Never exported in backups. */
export const AI_KEY_SETTING = "ai.providerKey";

interface StoredKey {
  v: 1;
  iv: string;
  data: string;
}

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Stores each provider API key encrypted with AES-GCM. The encryption key is derived
 * (HKDF-SHA256) from the deployment's SESSION_SECRET, so the SQLite file alone never
 * reveals a key. Keys are write-only through the API: reads only report whether one is set.
 */
export class AiKeyStore {
  private cached: string | null | undefined = undefined;

  constructor(
    private readonly db: Database,
    private readonly sessionSecret: string | undefined,
  ) {}

  private hasSecret(): boolean {
    return (this.sessionSecret?.length ?? 0) >= 32;
  }

  configured(): boolean {
    return this.db.one<{ value: string }>(`SELECT value FROM tal_settings WHERE key = ?`, AI_KEY_SETTING) !== null;
  }

  async get(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    const row = this.db.one<{ value: string }>(`SELECT value FROM tal_settings WHERE key = ?`, AI_KEY_SETTING);
    if (!row || !this.hasSecret()) return (this.cached = null);
    try {
      const stored = JSON.parse(row.value) as StoredKey;
      if (stored.v !== 1 || !stored.iv || !stored.data) return (this.cached = null);
      const key = await this.deriveKey();
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64url(stored.iv) },
        key,
        fromB64url(stored.data),
      );
      return (this.cached = new TextDecoder().decode(plain));
    } catch {
      // A rotated SESSION_SECRET (or corrupt record) makes the stored key unreadable.
      return (this.cached = null);
    }
  }

  async set(apiKey: string | null): Promise<void> {
    const value = apiKey?.trim() ?? "";
    if (!value) {
      this.db.run(`DELETE FROM tal_settings WHERE key = ?`, AI_KEY_SETTING);
      this.cached = null;
      return;
    }
    if (!this.hasSecret()) {
      throw new ValidationError("SESSION_SECRET is not configured, so API keys cannot be stored safely.");
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey();
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
    const stored: StoredKey = { v: 1, iv: b64url(iv), data: b64url(new Uint8Array(cipher)) };
    this.db.run(
      `INSERT INTO tal_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      AI_KEY_SETTING, JSON.stringify(stored), new Date().toISOString(),
    );
    this.cached = value;
  }

  private async deriveKey(): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey("raw", encoder.encode(this.sessionSecret!), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode("emo-ai-provider"),
        info: encoder.encode("api-key-v1"),
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
}
