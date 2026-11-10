# Verification

> Agent-facing. Read before reporting a change as done.

There is no automated test suite and no linter config in the repo. Pick the checks that cover what you changed and report each one as run, failed or skipped.

| Change | Minimum check |
| --- | --- |
| Any package under `packages/` | `pnpm build:packages` (tsc, strict) |
| CLI | `pnpm build:cli`; run the changed command with `pnpm dev:cli <cmd> --help` and once for real |
| Desktop Web | `pnpm build:oss` (stop the dev server first: both use `apps/desktop-web/.next`); for visible changes open the page in the preview and check the state, interaction and console |
| Config schema | Load the example: `node -e` importing `loadConfig` from `packages/core/dist` on `pdf2obsidian.config.example.yaml`; load an old config without the new key |
| Pipeline stages / caches | Import one real public PDF end to end; import it again and confirm cache hits in `report.json` (`cacheHitCount`); compare the Vault output with the previous version |
| Network / provider | One real call against the configured service if a key is available; otherwise say it was skipped |
| Docs only | Check every changed relative link and anchor, paths, commands and config keys against the code; zh and en mirror match |

- End-to-end checks need a MinerU token or service and an AI key. If unavailable, say so and list the check as skipped.
- Point a test run at a throwaway Vault directory, never the user's real Vault unless asked.
- A build passing is not a visual check. Stop preview servers you started.
