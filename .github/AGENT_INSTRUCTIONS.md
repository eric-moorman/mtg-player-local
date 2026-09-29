# Working an issue into a PR

This is the convention for resolving a GitHub issue on this repo into a pull request — whether run on-demand ("go work issue #12") or, later, on a schedule. It only applies to issues labeled **`agent-ready`** — that label means a human has already skimmed the request and decided it's worth attempting. Never touch an issue without it.

## Finding work

```
gh issue list --repo eric-moorman/mtg-player-local --label agent-ready --state open
```

## Doing the work

1. Read `DESIGN.md` and `README.md` first for the architecture and conventions already in place — reuse existing patterns (component structure, the `useGame` store, the design tokens in `src/styles/global.css`) rather than introducing new ones.
2. Branch from `main` as `agent/issue-<number>-<short-slug>`.
3. Implement the change. If the issue is a bug report, reproduce it first if at all possible before "fixing" it blind.
4. Verify before opening a PR, same bar used throughout this project:
   - `npm run typecheck` and `npm run build` for the app.
   - `npm run typecheck:worker` if anything under `worker/` changed.
   - For anything user-visible, a real smoke test (e.g. via Playwright against `npm run preview`) — not just "it typechecks."
5. Leave `reports/` alone unless the issue is specifically about the reporting pipeline itself — it's managed by `worker/index.ts` and `.github/workflows/report-to-issue.yml`, not something to edit by hand.
6. If a change does touch the reporting pipeline, preserve its security model: the public-facing Function may only ever get a token scoped to this repo's *contents*, never anything broader — issue creation itself happens through the GitHub Action's own auto-provisioned token, not a stored secret.

## Opening the PR

- `gh pr create` with a body that includes `Closes #<number>` and a plain summary of what changed and how it was verified.
- **Never merge your own PR.** This step exists for a human to review; stop once it's opened.
- If you also want to tidy the issue, comment briefly and swap the `agent-ready` label for something like `in-review` so it isn't picked up again — but don't close it yourself.
