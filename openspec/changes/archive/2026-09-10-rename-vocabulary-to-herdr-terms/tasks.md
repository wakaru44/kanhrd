## 1. Documentation is the authority — do it first

- [x] 1.1 `docs/BRAND.md`: replace the pen/field/lane rename table with
      the vocabulary table from the spec (host, workspace, tab, card,
      status column, swimlane), stating the one rule.
- [x] 1.2 `docs/BRAND.md`: rewrite the "lane means one thing" section so
      `lane` means swimlane. Keep a one-line note that it briefly meant
      tab, so a reader of older commits is not confused.
- [x] 1.3 `docs/BRAND.md`: rename the nouns in the approved-copy table.
      Change nothing else about those rows.
- [x] 1.4 While in the table, add the rows the redesign shipped without:
      the `create`, `help` and `settings` groups all carry a
      `PENDING BRAND TABLE` note in `copy.ts` today.
- [x] 1.5 `docs/DESIGN-SYSTEM.md` and `docs/UX-GUIDELINES.md`: rename
      the nouns; leave every rule, token and assertion intact.
- [x] 1.6 `docs/CONTEXT.md`: point the glossary at BRAND.md's table.
- [x] 1.7 Do NOT touch `docs/history/**` — frozen by CLAUDE.md.

## 2. Copy

- [x] 2.1 `apps/web/src/app/shared/copy.ts`: rename the nouns across
      `emptyState`, `confirm`, `toast`, `nav`, `create`, `card`, `rail`,
      `help`, `settings`. Nouns only — no re-voicing.
- [x] 2.2 Rename the `COPY.rail` group if its key still reads as the old
      vocabulary, and reconsider `rail.navigation` (`fields and lanes`)
      — it becomes `workspaces and tabs`.
- [x] 2.3 Keep `create.pane` pointing at the card wording the board's
      `+` menu and the `prefix + c` chord share; renaming must not split
      those two apart again.
- [x] 2.4 Invert `copy.spec.ts`'s vocabulary assertion: it currently
      fails on host/workspace/tab and must fail on pen/field/lane.
- [x] 2.5 Re-run the guards added with the copy consolidation — all
      lowercase, no exclamation marks, shared labels appear once.

## 3. Code and comments

- [x] 3.1 Sweep `apps/web/src` comments and identifiers that adopted the
      copy-layer vocabulary. Identifiers already use herdr's terms; it
      is the prose that drifted.
- [x] 3.2 `apps/web/e2e/**`: update any spec that hardcodes a renamed
      noun. Specs already reading through `COPY.*` need no change —
      prefer converting hardcoded ones to `COPY.*` rather than editing
      the literal.

## 4. In-flight changes

- [x] 4.1 `openspec/changes/add-parked-columns/**`: rename the nouns in
      proposal, design, tasks and spec. It is 4/39 done — cheap now.
- [x] 4.2 `openspec/changes/add-terminal-top-bar/**`: same.
- [x] 4.3 `openspec/changes/add-bridge-origin-allowlist/**`: same.
- [x] 4.4 Do NOT rewrite `openspec/changes/archive/**` or the archived
      neo-shepherd change. History records what was true then.
- [x] 4.5 Re-validate each touched change with
      `openspec validate <name> --strict`.

## 5. Verification

- [x] 5.1 `grep -rn "\bpen\b\|\bfield\b\|\blane\b" apps/web/src docs` and
      account for every remaining hit: a swimlane usage, an input field,
      a struct field, or history. There will be legitimate ones — the
      point is that none of them names a host, workspace or tab.
- [x] 5.2 `pnpm --filter @kanhrd/web test`
- [x] 5.3 `pnpm --filter @kanhrd/web build`
- [x] 5.4 `bash tools/lint-scss-tokens.sh`
- [x] 5.5 Read the copy diff end to end and confirm only nouns moved.
