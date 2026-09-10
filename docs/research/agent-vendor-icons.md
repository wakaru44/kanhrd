# Agent vendor icons on cards — research memo

**Type:** Divio _explanation_. Research only, work lane R4. No code, no assets
downloaded, no design doc edited. Nothing here is a decision; the
maintainer decides, and only the maintainer extends
[`DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md).

**The ask (verbatim):**

> the agent names should be replaced by icons. we have after all only a
> few icons to support, namely claude, chatgpt/openai, opencode,
> openclaw, all of them have readily available icons on the internet we
> can source and use to distinguish the model vendor easily without text.

Three of the four premises in that sentence do not survive contact with
the data and the licences. The set is not "a few". The icons are readily
available but not readily _licensed_. And "without text" collides with
the design system's own colour-is-never-the-only-carrier rule. What
survives — and it is the real request — is that ten `claude` cards are
indistinguishable at a glance and the vendor should read as a mark, not
as a repeated word.

---

## 1. What the bridge actually delivers

### The plumbing

`apps/bridge/src/herdr/project.ts:18` is the whole of it:

```ts
const agentName = pane.display_agent ?? pane.agent;
// …
if (agentName !== undefined) projected.agent = { name: agentName };
```

`display_agent` and `agent` both come from herdr's `PaneInfo`
(`packages/schema/src/herdr.ts:89-91`), both optional. The card then does
(`apps/web/src/app/board/card.ts`):

```ts
pane.agent?.name ?? pane.title ?? pane.id.slice(0, 8);
```

So the string on the card today is one of four things, and only the first
is a vendor identifier at all.

### The actual values, from the live herdr on this machine

herdr 0.8.2, read-only `herdr pane list` / `herdr agent list` against the
operator's running session (no writes, no test harness — a one-shot
inspection):

| pane                                   | `agent`    | `display_agent` | `agent_status` |
| -------------------------------------- | ---------- | --------------- | -------------- |
| `w6:pAP`                               | `claude`   | _(absent)_      | `blocked`      |
| `w6:pAS`                               | `codex`    | _(absent)_      | `idle`         |
| `w6:pE4`                               | `claude`   | _(absent)_      | `done`         |
| `w7:p1`                                | `claude`   | _(absent)_      | `blocked`      |
| `w6:pA2`, `w6:pE5`, `w6:pE6`, `w6:pED` | _(absent)_ | _(absent)_      | `unknown`      |

Two observations that matter more than the values:

1. **`display_agent` is empty in practice.** Every observed pane carried
   only the lowercase `agent` id. `display_agent` is written by hooks via
   `pane.report_metadata` and nobody here writes it.
2. **Half the panes have no agent at all.** Four of eight are plain
   shells. The "unknown agent" case is not an edge case on this board —
   it is the plurality.

### The vendor set is not four, and it is not closed

`herdr integration install --help` enumerates the 17 shipped agent
integrations:

```text
pi, omp, claude, codex, copilot, devin, droid, kimi, opencode, kilo,
hermes, qodercli, qwen, cursor, mastracode, antigravity-cli, grok
```

`herdr agent start --kind` enumerates 22 detectable agent kinds:

```text
pi, claude, codex, gemini, cursor, devin, agy, cline, omp, mastracode,
opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli,
qwen, maki
```

And the wire type is open. From herdr's own bundled schema
(`herdr api schema --json`):

```json
"PaneInfo/properties/agent":         {"type": ["string", "null"]}
"PaneInfo/properties/display_agent": {"type": ["string", "null"]}
```

No enum. `pane.report_agent` and `pane.report_metadata` accept any
string. **Any integration, hook or future agent can put an arbitrary
token on a card.** A design that requires a per-vendor asset is a design
that is permanently one release behind herdr — and the pace is such that
`agy`, `maki`, `qodercli` and `antigravity-cli` all exist and none of
them were in the user's list.

Of the user's four names: `claude` ✅ observed, `codex` ✅ observed
(that is the OpenAI one — "chatgpt/openai" is not an agent id herdr ever
emits), `opencode` ✅ a shipped integration but not observed here, and
**`openclaw` is not in herdr's set at all**. OpenClaw
(<https://github.com/openclaw/openclaw>) is a real project, but nothing
in herdr would report it today; it could only arrive as an unrecognised
free-form string.

### The unknown-agent fallback today

There is none at the vendor layer. `agent` is simply absent, the card
falls through to `title`, then to the first 8 chars of the pane id, and
the reader sees a hex fragment. The live change
`add-pane-workdir-and-task-title` widens that chain to
`label ?? display_agent ?? agent ?? title ?? pane_id.slice(0, 8)` and —
this is the part vendor icons must respect — **moves the agent identity
off the title line into the meta row in `--ink-mute` whenever the
operator's `label` wins**. That proposal is live and unimplemented. A
vendor mark must slot into _its_ structure: title = the operator's task
name, secondary identity row = agent + project. Building a parallel
identity slot on the title line now would be built to be torn out.

---

## 2. Licensing

The crux, and the reason this memo does not end in "ship simple-icons".

### The structural fact that decides most of it

Icon-set licences cover the **SVG path data**, not the **trademark**.
Both candidate sets say so themselves:

- Simple Icons is CC0 1.0
  (<https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md>),
  and CC0 §4 states: _"No trademark or patent rights held by Affirmer are
  waived, abandoned, surrendered, licensed or otherwise affected by this
  document."_ Their disclaimer
  (<https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md>)
  adds: _"Simple Icons is released under CC0 - though that doesn't mean
  to imply that all icons within the project are also CC0"_, that users
  should _"seek the correct permissions to use the icons relevant to
  their project"_, and that the project _"cannot be held responsible for
  any legal activity raised by a brand."_ They also run a removals
  address for brands that object.
- Lobe Icons (<https://github.com/lobehub/lobe-icons>) is MIT. Same
  structure: MIT covers their code and their redrawing, not Anthropic's
  or OpenAI's marks.

So "it's CC0/MIT" is not a licence to display a vendor's logo. It only
means the _set_ will not sue you. The vendor might.

The countervailing fact is nominative fair use: identifying which agent
runs in a pane is descriptive, non-commercial, non-endorsing use in a
tool that genuinely interoperates with those agents — the strongest
possible posture. It is a defence, not a permission, and it is
jurisdiction-shaped. It also weakens the moment the mark is recoloured,
placed on a coloured chip, or made to look like part of kanhrd's own
identity — which is exactly what fitting it to the washi/sumi palette
would require.

### Per-vendor verdict

Verified = the vendor's own page was fetched and read from this
environment. UNVERIFIED = it could not be reached and the claim rests on
secondhand text; treat it as a gap, not a finding.

| Vendor / agent id                                                                                                                    | Policy source                                                                                                                                                                                                                                               | What it says                                                                                                                                                                                                                                                                                                                                                                    | Verdict                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic — `claude`**                                                                                                             | <https://www.anthropic.com/legal/trademark-guidelines> (fetched)                                                                                                                                                                                            | _"You may only use our trademarks as specifically permitted by us and only in materials we approve beforehand."_ No open-source or integration exception. Alteration of the logo (colour, proportion) forbidden. Business enquiries → `marketing@anthropic.com`.                                                                                                                | **avoid** without written approval. The single most-used agent on this board is the single most restrictive licence.                                                                                                                        |
| **OpenAI — `codex`**                                                                                                                 | <https://openai.com/brand/> — **Cloudflare-blocked from this environment (HTTP 403 via both WebFetch and curl); archive.org also unreachable.** Text below is from search snippets of that page and of <https://openai.com/policies/developer-apps-terms/>. | Reported: permission is limited to uses adhering to the brand guidelines, non-exclusive and non-transferable; _do not incorporate the logo into your own branding or design a similar logo_; _do not modify it in any way_; special cases → `partnercomms@openai.com`. Developer terms reportedly grant a term-limited licence to use OpenAI Assets _"solely to promote apps"_. | **UNVERIFIED — treat as avoid.** "Solely to promote apps" does not obviously cover a per-row product glyph, and no-modification kills any tinting. A maintainer must read the page from an unblocked browser before this becomes shippable. |
| **opencode** (`opencode`)                                                                                                            | <https://github.com/anomalyco/opencode> (fetched) — MIT licensed, no separate brand policy found.                                                                                                                                                           | MIT covers the code; the repo ships `packages/identity/mark.svg` with no stated mark policy. No published restriction found, and none published is not the same as permission granted.                                                                                                                                                                                          | **likely safe, needs a check** — lowest risk of the four, but ask upstream (or rely on nominative use) rather than assume MIT covers the mark.                                                                                              |
| **openclaw**                                                                                                                         | n/a                                                                                                                                                                                                                                                         | Not a herdr agent id. Cannot appear on a card today.                                                                                                                                                                                                                                                                                                                            | **out of scope** — do not source an asset for it.                                                                                                                                                                                           |
| **Google — `gemini`, `antigravity-cli`**                                                                                             | <https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/> (fetched, via redirect from about.google/brand-resource-center)                                                                                   | Permission required for marketing and product-compatibility uses; _never use Google's brand colours or fonts_; _don't modify logos or combine them with your own branding_. Informational/educational use is exempted.                                                                                                                                                          | **avoid** — "product compatibility" is precisely what a vendor chip on a card asserts.                                                                                                                                                      |
| **GitHub/Microsoft — `copilot`**                                                                                                     | Simple Icons records the Copilot glyph as sourced from Primer Octicons under **MIT** (<https://primer.style/foundations/icons/copilot-24>)                                                                                                                  | The _icon_ is MIT-licensed design-system art, which is unusually clean. GitHub's separate logo/trademark policy still governs the wordmark and the Invertocat.                                                                                                                                                                                                                  | **needs attribution** — MIT means keep the licence notice, as `apps/web/public/fonts/LICENSE-*.txt` already does for the typefaces.                                                                                                         |
| **Moonshot — `kimi`**                                                                                                                | <https://moonshotai.github.io/Branding-Guide/> (fetched)                                                                                                                                                                                                    | Publishes assets but states only _"© 2025 KIMI. All rights reserved."_ No grant, no prohibitions, contact `team@moonshot.ai`.                                                                                                                                                                                                                                                   | **UNVERIFIED / avoid** — a branding guide with no licence grant is not a grant.                                                                                                                                                             |
| **Alibaba — `qwen`, `qodercli`; xAI — `grok`; Anysphere — `cursor`; Cognition — `devin`; Factory — `droid`; and the rest of the 22** | not checked                                                                                                                                                                                                                                                 | Each is its own policy. Some (Cline, Ollama) are permissive open-source; several publish nothing.                                                                                                                                                                                                                                                                               | **unknown** — and this is the point: a per-vendor asset strategy requires a per-vendor legal review, forever, for a set herdr grows without telling us.                                                                                     |

### The ready-made sets, evaluated

|                            | Simple Icons                                                                                                                                                                                                                                                       | Lobe Icons                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Licence                    | CC0 1.0 (paths only; trademark expressly not waived)                                                                                                                                                                                                               | MIT (same caveat)                                                                                                                          |
| Covers our vendors         | `Claude`, `Claude Code`, `Anthropic`, `OpenCode`, `Google Gemini`, `GitHub Copilot`, `Cursor`, `QWen`, `Kimi`, `Cline`, `Ollama`, `Mistral AI`. **No `OpenAI`, no `ChatGPT`, no `Codex`** — only "OpenAI Gym". No `grok`, `devin`, `droid`, `kiro`, `kilo`, `amp`. | Broader: Claude, OpenAI/ChatGPT/Codex, Gemini, Copilot, Cursor, Qwen, Kimi, Grok, OpenCode.                                                |
| Style                      | strictly monochrome single-path glyphs — fits `currentColor`, fits the palette                                                                                                                                                                                     | full-colour brand marks by default, plus mono variants                                                                                     |
| Distribution               | npm `simple-icons`, or copy one path; 3 460 icons in the package but a single path is ~1 KB                                                                                                                                                                        | npm `@lobehub/icons` is a **React** component library — unusable in this Angular SPA. `@lobehub/icons-static-svg` is the only viable form. |
| Self-hostable              | yes                                                                                                                                                                                                                                                                | yes (static-svg), though the docs push unpkg/CDN                                                                                           |
| Bundle cost if used sanely | negligible — inline the two or three paths you need                                                                                                                                                                                                                | same, if you take static SVGs only                                                                                                         |

**Can this app even reach a CDN?** No, and it must not try. There is not
one external URL in `apps/web/src` — zero `https://` references in any
template, style or component. Fonts are self-hosted in
`apps/web/public/fonts/` with their licence files committed beside them,
and `DESIGN-SYSTEM.md` § Typography requires that a missing font
"MUST NOT block the board". The deployment story is loopback plus
`tailscale serve` (`CLAUDE.md` § Runtime facts) — a board that a
shepherd watches on an iPad on a plane. **Any CDN dependency is
disqualified on architecture before it is disqualified on licensing.**
The committed-licence-file-beside-the-asset pattern is the existing
precedent for anything that does ship.

Bundle size is, notably, _not_ an argument against vendor icons. Three
inlined paths are ~3 KB. Size is the one objection that does not apply;
everything else does.

---

## 3. Design options

Constraints every option is measured against, all from
[`DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) and
[`UX-GUIDELINES.md`](../UX-GUIDELINES.md):

- **lucide only.** _"Single icon set: `@lucide/angular`… Do not install
  `lucide-angular` or any second icon package."_ Eighteen icons; the
  count is asserted in `icons.ts` as `const ICON_COUNT: 18` so that a
  nineteenth breaks the build. Every option below except (d) is a
  deviation requiring a maintainer to amend the doc first.
- **No raw hex outside `tokens.scss`** — enforced by the pre-commit lint
  gate. Per-vendor brand colours would each need a token.
- **Colour is never the only carrier**, and _"identically shaped coloured
  dots plus an ARIA-only label do not satisfy this."_ That rule is
  written about status, and its logic transfers directly to vendor.
- **Chrome is ink on paper.** The _only_ sanctioned accent-coloured mark
  in chrome is the wordmark crook and the host seal's 1px ochre outline,
  explicitly called "the single, bounded, deliberate brand exception".
- **The full name is reachable by keyboard focus and in pane detail, not
  by hover tooltip alone.**
- **Not the display serif** on any repeated per-card identifier.

Where the mark goes, in all four options: the secondary identity row that
`add-pane-workdir-and-task-title` introduces — beside `workspace / tab` and
the project name, in `--ink-mute`, _not_ on the title line. When the
operator has named a card, the title is theirs; the vendor is metadata.

### (a) Monochrome vendor glyph, `currentColor`, tinted by a per-vendor token

Simple Icons' single-path marks at `--icon-sm` (14px), inheriting
`--ink-mute` like the rest of the meta row, optionally tinted by a
per-vendor token.

- _Accessible name:_ gone unless supplied. Needs `aria-label` /
  `<title>` carrying the agent string verbatim, plus `title` for pointer
  users. An `aria-label` alone does not satisfy the non-colour rule if
  the glyph is the only vendor signal for a sighted user — but a _shape_
  difference does, which is why monochrome-glyph is defensible where a
  coloured-dot is not.
- _Both themes:_ clean. `currentColor` on ink tokens is exactly how every
  other icon in the app behaves.
- _Unknown agent:_ nothing renders. Acceptable, and consistent with
  "absent values render nothing".
- _Cost:_ the entire licensing problem, in full, forever, per vendor.
  Also: recolouring the mark to `--ink-mute` is precisely the
  "no modification" clause Anthropic, OpenAI and Google each state.
  Monochroming a logo to fit your palette is a modification.

### (b) Full-colour vendor marks

- _Accessible name:_ same requirement as (a).
- _Both themes:_ actively bad. Claude's `#D97757` and Gemini's `#8E75B2`
  against washi cream `#f4ede0` are unmeasured against every contrast
  pair in the doc, and a dozen brand colours turn a deliberately quiet
  board into a logo wall. Directly contradicts _"Colour signals status,
  not chrome"_ — a vendor is not a status, and the reader would now have
  two colour languages competing on one 44px row.
- _Unknown agent:_ nothing renders.
- _Cost:_ worst of both — full licensing exposure _and_ it fights the
  palette. Also needs a `tokens.scss` entry per vendor to clear the lint
  gate, permanently coupling the design token file to herdr's agent list.

### (c) A lucide glyph plus a per-vendor colour chip

E.g. `LucideBot` (a 19th icon) for "an agent", coloured per vendor.

- _Accessible name:_ needs a label; and the glyph is identical across
  vendors, so **colour becomes the only carrier** — the explicitly
  rejected pattern, quoted almost word for word in the doc.
- _Both themes:_ every vendor colour would need light and dark tuning and
  a measured 3:1 pair, replicating the whole `--status-*` exercise for an
  open-ended set.
- _Unknown agent:_ falls back to grey, i.e. indistinguishable from a
  vendor whose colour happens to be grey.
- _Verdict:_ fails the design system's own accessibility rule. Not
  viable.

### (d) A monogram chip — no third-party asset at all

A small square chip in the identity row, `--radius-sm`, hairline
`--rule`, no fill, carrying one or two characters derived from the agent
string in `--font-mono` at `--fs-caption`: `cl`, `cx`, `oc`, `cu`, `gm`,
`qw`… Deterministic first-two-letters of the herdr agent id, no lookup
table, no per-vendor branch. Structurally the **host seal (hanko)
pattern already in the card**, one step quieter — the seal's ochre
outline is the reserved brand exception, so the agent chip takes `--rule`
instead and does not compete with it.

- _Accessible name:_ the chip's own text _is_ the name for sighted users
  and, with the full agent string in an `aria-label` or a visually-hidden
  span, for assistive tech. No tooltip is load-bearing; the full string
  is on the pane-detail route as the guidelines require.
- _Both themes:_ uses only existing tokens. Nothing to measure, nothing
  to tune, no new contrast pair.
- _Unknown agent:_ degrades perfectly. No agent → no chip, exactly like
  every other absent value. An _unrecognised_ agent → a chip, because
  `mk` for `maki` needs no one to have shipped an asset for it. **This is
  the only option that handles herdr's open-ended agent set without a
  code change per vendor.**
- _Cost:_ two glyphs are less instantly recognisable than a logo. `cl`
  and `cline` collide at two characters (`cl` vs `cl`) — the derivation
  needs a rule for that, e.g. drop to three characters on collision
  within a board, or accept it since `claude`/`cline` on one board is
  rare. That is the one real gap in this option and a maintainer should
  decide it.
- _Legal:_ nothing to license. Letters are not marks.

---

## 4. Recommendation

**Option (d), the monogram chip.**

Not because logos would look worse — a well-drawn Claude mark at 14px
would read faster than `cl`, and that is a genuine loss. Because the
premise "we have only a few icons to support" is false: herdr already
knows 22 agent kinds, ships 17 integrations, and types the field as an
unconstrained string, so any asset-per-vendor design is a permanent
maintenance tail with a legal review attached to each new entry. And
because the single most common agent on this board is `claude`, whose
trademark policy is the strictest of the set — _"only in materials we
approve beforehand"_ — while the second, `codex`, sits behind a brand
page this environment cannot even read. Option (d) ships this week with
no licence, no new dependency, no nineteenth icon, no new colour token,
no CDN, and no contrast measurement; it degrades correctly for the four
of eight panes that have no agent at all and for the agent herdr adds
next month. It is the lazy answer and it is also the correct one.

Ship it inside `add-pane-workdir-and-task-title`'s identity row, not as a
parallel change.

### What a maintainer would have to add to `DESIGN-SYSTEM.md`

Option (d) is the cheapest to legalise because it introduces no asset and
no token — but it is still a new component, and § Components is the
authoritative contract. Required edits, all maintainer-only:

1. **§ Components — a new "Agent chip" subsection**, sibling to
   _Host seal (hanko)_, stating: compact rectangle, `--radius-sm`, `1px
solid var(--rule)`, never filled, padding `0 var(--sp-1)`, glyph in
   `--font-mono` at `--fs-caption` coloured `--ink-mute`; derived from
   the herdr `agent` id, lowercase, never `text-transform`ed (§ Typography
   already forbids transforming user-supplied names); absent agent
   renders nothing.
2. **§ Components — Card**, amend the compact-variant row inventory. It
   currently enumerates _"dot · title · host seal · elapsed · status
   label · overflow trigger"_ and says the status label and overflow
   trigger may not truncate. Say where the agent chip sits and whether it
   survives the compact row at all. (Recommendation: it does not — the
   compact row is already at its budget, and the chip is identity, not
   state.)
3. **§ Host seal (hanko)** — one clarifying sentence that the ochre
   outline remains the sole brand exception and the agent chip
   deliberately takes `--rule`, so nobody later "harmonises" the two.
4. **A monogram derivation rule**, and the collision answer for
   `claude`/`cline`. This is the one open design question.
5. Nothing in § Iconography changes, and `ICON_COUNT` stays 18. That is
   the point.

**If the maintainer instead wants real vendor logos** — a legitimate
call; recognisability is a real benefit — then the doc changes are much
larger and the work is blocked on legal answers this memo cannot supply:

- § Iconography must stop saying "single icon set" and gain a second,
  bounded, _named_ set with an explicit closed list of permitted vendor
  marks, plus the rule that an unlisted agent falls back to the monogram
  chip (option (d) is needed _anyway_, as the fallback).
- § Colour must gain per-vendor tokens if the marks are coloured, each
  with measured light/dark pairs, or a stated exemption if they are
  monochromed — and monochroming is itself the "no modification"
  violation.
- The lint gate's raw-hex rule needs an exemption path for committed
  vendor SVGs.
- A `LICENSE-*.txt` per mark under `apps/web/public/`, mirroring the
  fonts.
- And, before any of it: written permission from Anthropic
  (`marketing@anthropic.com`), a first-hand reading of
  <https://openai.com/brand/> from an unblocked browser, and a decision
  on whether nominative fair use is a posture this project is willing to
  stand on for a dozen vendors it has not reviewed.

### Open questions for the maintainer

1. Monogram vs. logos — the trade is recognisability against a permanent
   legal and maintenance tail. Recommendation: monogram.
2. The `claude`/`cline` two-letter collision rule.
3. Does the chip appear in the compact card row? Recommendation: no.
4. If logos are wanted anyway: is anyone willing to write to
   `marketing@anthropic.com`, and does the project accept nominative fair
   use as its position for the rest?

## Sources

- <https://www.anthropic.com/legal/trademark-guidelines> (fetched)
- <https://openai.com/brand/> (403 from this environment — UNVERIFIED)
- <https://openai.com/policies/developer-apps-terms/> (403 — UNVERIFIED)
- <https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/> (fetched)
- <https://moonshotai.github.io/Branding-Guide/> (fetched)
- <https://github.com/anomalyco/opencode> (fetched)
- <https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md> (fetched)
- <https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md> (fetched)
- <https://github.com/lobehub/lobe-icons> (fetched)
- <https://primer.style/foundations/icons/copilot-24> (cited by Simple Icons' metadata as the MIT source; not fetched)
- <https://github.com/openclaw/openclaw> (identified via search; not fetched)
- herdr 0.8.2 local: `herdr integration install --help`,
  `herdr agent start --help`, `herdr pane list`, `herdr agent list`,
  `herdr api schema --json`
