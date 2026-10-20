# Changelog

All notable changes to EMO are listed here. Versions match the `create-emo` package.

## Unreleased

### Added

- EMO is the name of the assistant everywhere: the installer is now `create-emo`, and the agent introduces itself as EMO, the private assistant of engineer Imam Abdulaziz
- The agent answers in the language the owner writes in, Arabic or English
- Arabic and English interfaces, with a language switch and right-to-left layout (see `docs/development.md`)
- OpenAI-compatible AI providers: OpenAI, OpenRouter, Groq, NVIDIA NIM, OpenCode Zen, Google Gemini, Ollama and any custom endpoint, each with its own encrypted API key (see `docs/ai-providers.md`)
- The new EMO logo, wordmark and app icon

## 0.1.7 — 2026-10-19

### Added

- Personal access tokens, so external tools and other AI assistants can use your EMO (#60)
- Notifications are delivered as Web Push (#28)
- Chat finds tasks, notes and automations by meaning, not only by exact words (#50, #53)
- Automations can be edited after they are created (#52)
- Better automation scheduling and a run history (#63)
- Memory conflicts can be decided with Clef; without Clef they go to review (#22, #41)
- Token provenance tracking and model-specific estimates of AI consumption (#30)
- A project website on GitHub Pages, linked from the README, and an Install with Appflare button (#23, #47, #48)

### Fixed

- Automation runs no longer overlap or get stuck (#65)
- Rescheduling an automation to a time that has passed is rejected (#56)
- Reminder and AI automation messages stay required when editing (#55)
- Weekly schedules are described without repeated weekdays (#54)
- Impossible dates in offset timestamps are rejected (#66)
- A task is resolved by its exact title before partial matches (#59)
- Notes searches keep the project filter (#67)
- Truncated conversation titles and reminder names no longer split an emoji (#68)
- Project names stay visible in the Projects dialog (#49)
- The layout stays steady when a text field takes focus on a phone (#38)
- Follow-ups from the release audit for push and automations (#72)

### Security

- Installer error details redact bearer tokens and quoted values (#57)
- A malformed session cookie is treated as signed out (#58)
- Request bodies stop being read as soon as they pass the size limit (#40)
- The owner can still sign in during a distributed attack; IPv6 addresses are grouped by /64 (#39)
- Notification clicks stay on the app's own origin (#36)

### Upgrading

- A `.dev.vars` created before push existed gets Web Push keys added automatically (#37)
