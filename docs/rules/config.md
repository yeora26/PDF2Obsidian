# Config

> Agent-facing. Read before adding, renaming or changing the default of any config key. User-facing table: [使用指南 §3](../zh/user-guide.md#3-配置).

## Sources

- One file: `pdf2obsidian.config.yaml` (git-ignored). CLI: `--config <path>` (default `pdf2obsidian.config.yaml`, relative to the invocation dir `INIT_CWD`, else cwd). Web: `PDF2OBSIDIAN_CONFIG` env var, else `<workspace root>/pdf2obsidian.config.yaml` (`apps/desktop-web/lib/paths.ts`).
- `loadConfig()` in `packages/core/src/config/load-config.ts` parses YAML and runs the zod schema, which fills defaults and validates, then `resolveConfigPaths` makes every path key absolute relative to the config file's directory (`mineru.command` only when it contains a slash). Downstream code trusts the parsed `AppConfig` and does not re-default or re-resolve.
- A new path-valued key must be added to `resolveConfigPaths`.
- The Web settings page writes the file through `apps/desktop-web/lib/config.ts`: it validates a temp copy with `loadConfig` before overwriting, and normalises legacy values. YAML comments are lost when the Web saves.
- Secrets are referenced by env-var name (`translation.apiKeyEnv`, `mineru.apiTokenEnv`, `metadata.journalMetrics.easyScholar.secretKeyEnv`). Literal `translation.apiKey` / `secretKey` exist for local debugging only.

## Adding or changing a key

1. Add the field to `packages/core/src/config/types.ts` and the schema in `load-config.ts`, with `.default(...)`. Nested objects also need a full `.default({...})` on the parent, so a missing section still parses.
2. Add it to `pdf2obsidian.config.example.yaml` in the owning section with a Chinese comment (meaning, unit, allowed values).
3. If the Web exposes it, wire it in `components/SettingsWorkspace.tsx` / `OnboardingWizard.tsx` (and `components/shared/*`), and add runtime checks to `validateLocalRuntimeConfig` if a bad value would only fail mid-import.
4. Update [使用指南 §3](../zh/user-guide.md#3-配置) (zh + en) if users see the effect.
5. Decide whether the key changes translation or reading output; if so, it must be part of that cache key (see [pipeline](pipeline.md#caches-and-identities)).

## Compatibility

- Users keep old config files. Rename or remove a key only with a migration in a `z.preprocess` (example: `translation.provider: deepseek` → `openai-compatible` + `preset: deepseek`), and mirror it in `normalizeConfigData` on the Web side.
- Enum values (`mineru.mode`, `mineru.backend`, `translation.provider`, `translation.preset`) are a contract with the Web forms and `mineru-runner.ts`; change all together.
- The example YAML uses the code defaults. Keep them equal; outbound services (`metadata.online`, `easyScholar`) stay off by default (see [secrets-and-privacy](secrets-and-privacy.md)).
