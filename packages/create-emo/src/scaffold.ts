import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "./errors";
import { generateAgentConfig, generatePagesConfig, toJsonc } from "./config";
import { MANIFEST_FILE } from "./manifest";

export interface TemplateInfo {
  version: string;
  built_at: string;
}

export function templatesDir(): string {
  if (process.env.EMO_TEMPLATES_DIR) return process.env.EMO_TEMPLATES_DIR;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

export function readTemplateInfo(dir = templatesDir()): TemplateInfo {
  const path = join(dir, "version.json");
  if (!existsSync(path)) {
    throw new CliError("This copy of create-emo is missing its deployment templates.", "Reinstall with `npx create-emo@latest`.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as TemplateInfo;
}

/** A directory is safe to install into when it doesn't exist, is empty, or already holds a EMO manifest. */
export function assertSafeTarget(dir: string): "new" | "existing" {
  if (!existsSync(dir)) return "new";
  if (existsSync(join(dir, MANIFEST_FILE))) return "existing";
  const entries = readdirSync(dir).filter((e) => e !== ".DS_Store");
  if (entries.length === 0) return "new";
  throw new CliError(
    `${dir} already exists and is not a EMO installation.`,
    "Choose another directory with `--dir <path>` so nothing unrelated is overwritten.",
  );
}

export interface ScaffoldInput {
  dir: string;
  workerName: string;
  pagesProjectName: string;
  installationId: string;
  version: string;
  timezone: string;
  agentName: string;
  semanticDefault?: boolean;
}

/**
 * Writes the deployable project: the prebuilt agent Worker bundle, the static
 * frontend with its Pages Function, and generated Wrangler configs.
 * Generated artifacts are replaced on every run; the manifest is left alone.
 */
export function scaffoldProject(input: ScaffoldInput, templates = templatesDir()): void {
  const { dir } = input;
  mkdirSync(join(dir, "agent"), { recursive: true });
  mkdirSync(join(dir, "web"), { recursive: true });

  cpSync(join(templates, "agent", "worker.js"), join(dir, "agent", "worker.js"));
  for (const sub of ["dist", "functions"]) {
    rmSync(join(dir, "web", sub), { recursive: true, force: true });
    cpSync(join(templates, "web", sub), join(dir, "web", sub), { recursive: true });
  }

  writeFileSync(
    join(dir, "agent", "wrangler.jsonc"),
    toJsonc(
      generateAgentConfig({
        workerName: input.workerName,
        installationId: input.installationId,
        version: input.version,
        timezone: input.timezone,
        agentName: input.agentName,
        semanticDefault: input.semanticDefault,
      }),
    ),
  );
  writeFileSync(
    join(dir, "web", "wrangler.jsonc"),
    toJsonc(generatePagesConfig({ pagesProjectName: input.pagesProjectName, workerName: input.workerName })),
  );
  writeFileSync(join(dir, ".gitignore"), ".wrangler/\nnode_modules/\n");
  writeFileSync(join(dir, "README.md"), projectReadme(input));
}

function projectReadme(input: ScaffoldInput): string {
  return `# Your EMO deployment

This directory was created by \`create-emo\` and identifies your deployment
(\`${input.installationId}\`). Keep it — it contains no secrets, but the
installer uses \`emo.json\` to find your Cloudflare resources.

| Resource | Name |
| --- | --- |
| Agent Worker (private) | \`${input.workerName}\` |
| Pages project | \`${input.pagesProjectName}\` |

Commands (run inside this directory):

- \`npx create-emo@latest update\` — update to the latest version (keeps all data)
- \`npx create-emo@latest status\` — show deployment status
- \`npx create-emo@latest doctor\` — diagnose problems
- \`npx create-emo@latest reset-password\` — set a new owner password

Your data lives in a Durable Object inside your Cloudflare account, not in this folder.
Use Settings → Privacy → Export in the app to download a backup.
`;
}
