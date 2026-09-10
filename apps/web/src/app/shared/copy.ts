/**
 * The single source of user-facing copy. Every string here is transcribed
 * byte-for-byte from the approved-copy table in `docs/BRAND.md`; that table
 * is the authority and this file is its only executable form. Templates
 * reference these by name and never inline a user-facing string.
 *
 * Three rules travel with the strings:
 *
 * 1. **Vocabulary rename is copy-only.** Users read *card*, *pen*, *field*
 *    and *lane*; the wire protocol, TypeScript identifiers and capability
 *    names keep herdr's `pane`, `host`, `workspace` and `tab`. A `{reason}`
 *    slot quotes herdr's response verbatim — including herdr's own
 *    vocabulary and its original case. Never rewrite herdr's error text.
 * 2. **A lane is a tab.** A board grouping is a *status column*, never a
 *    lane — in copy, in help text, and in comments.
 * 3. **Care softens the prompt, never the fact.** `let this one rest?` is
 *    always paired with a body stating that the session terminates and
 *    cannot be undone. Nothing here may imply a pause, a recovery or an
 *    undo that does not exist.
 *
 * Lowercase is deliberate. Data readouts (durations, byte counts, revision
 * ids, pane ids) are not product copy and stay in the template.
 */
export const COPY = {
  emptyState: {
    noPens: 'no pens yet.',
    noPensBody: 'point kanhrd at a herdr socket. add a pen to kanhrd.config.yaml:',
    noPensThen: 'then start the bridge:',
    noPensDocsLink: 'read the operating guide',
    waitingForPen: 'waiting for a pen…',
    penEmpty: 'this pen is quiet. nothing running here yet.',
    noMatches: 'nothing matches these filters.',
    noMatchesAction: 'clear filters',
    scopeEmpty: 'nothing in this scope.',
    scopeEmptyAction: 'clear scope',
    notFound: 'off the map.',
    notFoundAction: 'back to the board',
    scopeUnavailable: 'that field is no longer here.',
  },
  column: {
    empty: '0',
  },
  /*
   * Naming a card is not a lifecycle, empty or error surface, so no care
   * verb belongs here — these are plain, lowercase and terse. The name has
   * exactly one home (herdr's own pane label), which is why the clear
   * action says "clear name" and not "reset" or "forget".
   */
  card: {
    renameAction: 'rename card',
    renameModalTitle: 'name this card',
    renameFieldLabel: 'card name',
    renameSave: 'save',
    renameClear: 'clear name',
  },
  confirm: {
    closePane: 'let this one rest?',
    closePaneBody: 'closing ends this session. the terminal and anything running in it stop. this cannot be undone.',
    closePaneAction: 'rest',
    keep: 'keep',
    cancel: 'cancel',
    closeLane: 'let this lane rest?',
    closeLaneBody: 'these sessions end and cannot be recovered:',
    closeLaneAction: 'close lane',
    closeField: 'let this field rest?',
    closeFieldBody: 'these sessions end and cannot be recovered:',
    closeFieldAction: 'close field',
    closeLinkedFields: 'close every linked field?',
    closeLinkedFieldsBody: 'this field shares a git worktree with others. all of them close, and every session inside them ends. this cannot be undone.',
    closeLinkedFieldsAction: 'close all',
    lastLaneNote: 'this is the last lane in its field. the field closes too.',
    previewHeading: 'this closes:',
    refusalHeading: "herdr won't do that.",
  },
  toast: {
    penDisconnected: 'lost sight of {pen}. retrying.',
    penReconnected: 'back in view.',
    bridgeDisconnected: 'lost the bridge. retrying.',
    bridgeReconnected: 'bridge back.',
    splitFailed: "couldn't split. herdr said: {reason}",
    closeFailed: "couldn't close {name}. herdr said: {reason}",
    createPaneFailed: "couldn't open a card. herdr said: {reason}",
    createLaneFailed: "couldn't open a lane. herdr said: {reason}",
    createFieldFailed: "couldn't open a field. herdr said: {reason}",
    renameFailed: "couldn't rename. herdr said: {reason}",
    liveUpdatesUnavailable: 'no live updates for this card. herdr said: {reason}',
    working: 'working…',
  },
  status: {
    working: 'working',
    blocked: 'blocked',
    done: 'done',
    idle: 'idle',
    unknown: 'unknown',
  },
  loading: {
    board: 'finding pens…',
    pane: 'keeping watch…',
    retry: 'try again',
  },
  state: {
    stale: 'stale — reconnecting',
    unavailable: 'this pen is out of sight.',
  },
  nav: {
    backToBoard: 'back to the board',
    settings: 'settings',
    toggleNav: 'toggle navigation',
    help: 'keyboard shortcuts',
    statusSwitcher: 'status columns',
    statusSwitcherItem: '{status} — {count} cards',
  },
  notShipped: 'not yet.',
} as const;

/**
 * The placeholder names inside a copy template, as a union of string
 * literals — `Slots<'lost sight of {pen}. retrying.'>` is `'pen'`.
 */
export type Slots<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Slots<Rest>
  : never;

/**
 * Fill a copy template's `{slot}` placeholders. The `values` type is derived
 * from the template's literal type, so a missing or misspelled slot is a
 * compile error rather than a `{reason}` rendered at a user.
 *
 * ```ts
 * fill(COPY.toast.closeFailed, { name: 'api', reason: err.message });
 * ```
 */
export function fill<const S extends string>(
  template: S,
  values: Readonly<Record<Slots<S>, string>>
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? (values as Record<string, string>)[name] : match
  );
}
