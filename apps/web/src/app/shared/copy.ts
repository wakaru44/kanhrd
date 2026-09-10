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
    splitRight: 'split right',
    splitDown: 'split down',
  },
  /**
   * The navigator. `navigation` is the rail's accessible name — it says what
   * the rail lists, in the renamed vocabulary.
   */
  rail: {
    navigation: 'fields and lanes',
    renameField: 'rename field',
    renameLane: 'rename lane',
    lastFieldRefusal:
      'this is the only field open on this pen. closing it would leave nothing to watch. open another field first.',
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
    /** The dismiss control on a toast itself. */
    dismiss: 'dismiss',
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
    /** The shell's theme toggle, and the same control in Settings > appearance. */
    toWashi: 'switch to washi',
    toSumi: 'switch to sumi',
    /** Every overflow trigger: a card's and a rail row's are the same control. */
    moreActions: 'more actions',
  },
  /**
   * The board's create menu. The verb is not a new one: the approved-copy
   * table already calls this action *open* (`toast.createPaneFailed` reads
   * `couldn't open a card`), so the control that performs it says the same
   * word as the notice that reports it failing.
   *
   * PENDING BRAND TABLE: `docs/BRAND.md`'s approved-copy table has no rows
   * for creation affordances yet. These five are derived from the rows it
   * does have — the `create*Failed` verb plus the pen/field/lane/card
   * rename — rather than introduced, but a maintainer still owns the final
   * wording and should add them to the table.
   */
  create: {
    /** Accessible name of the `+` trigger. */
    menu: 'open',
    pane: 'open a card',
    lane: 'open a lane',
    field: 'open a field',
  },
  /**
   * The keyboard-shortcut overlay.
   *
   * `categories` is keyed by `ShortcutCategory` — the union in
   * `state/keyboard.service.ts` is a code identifier and stays capitalised;
   * this is what the user reads above each section. Plain lowercase nouns,
   * matching the Settings section headings.
   *
   * `shortcuts` carries only the descriptions that have no approved string
   * already. `new-pane` deliberately does not appear: it is the same action
   * the board's `+` menu performs, so it reuses `create.pane` rather than
   * describing it twice in two voices.
   *
   * Key names themselves (`Ctrl+B`, `Escape`, `0-9`) are data readouts, not
   * product copy, and stay in `formatBinding`.
   *
   * PENDING BRAND TABLE: `docs/BRAND.md`'s approved-copy table has no rows
   * for this surface yet. These are derived from the rules it does state —
   * lowercase, terse, the pen/field/lane/card rename, `notShipped` for what
   * has not landed — rather than introduced, but a maintainer owns the
   * final wording and should add them to the table.
   */
  help: {
    close: 'close',
    prefixNote: 'prefix — press it, release, then the action key within 2 seconds.',
    categories: {
      Navigation: 'navigation',
      Lifecycle: 'lifecycle',
      View: 'view',
      Help: 'help',
    },
    shortcuts: {
      nextTab: 'next lane',
      prevTab: 'previous lane',
      lastTab: 'last lane — jump back to the one before',
      openRail: 'open and focus the navigator',
      closeTab: 'close the current lane — asks first',
      /** Tail is `notShipped`; the board has no focused-card model to act on. */
      closePane: 'close the current card — not yet.',
      renameTab: 'rename the current lane',
      jumpTab: 'jump to lane 0-9 in the current field',
      help: 'open this help',
      toggleTheme: 'switch between washi and sumi',
      /** Tail is `notShipped`. */
      focusSearch: 'focus search — not yet.',
      closeOverlay: 'close the open dialog, help, create menu or drawer',
    },
  },
  /**
   * The `/settings` screen. Lifted verbatim from the screen's own
   * `SETTINGS_COPY` block, which existed only because a lane could not edit
   * this file.
   *
   * `poll.unavailable` / `poll.unit` are data readouts rather than product
   * copy; they live here because the rest of the screen's row does, and a
   * unit label with nowhere else to go is worse than one slightly out of
   * place.
   *
   * PENDING BRAND TABLE: `docs/BRAND.md`'s approved-copy table covers the
   * board, cards, confirms and toasts, but not this surface.
   */
  settings: {
    appearance: "appearance",
    theme: "theme",
    density: "density",
    comfortable: "comfortable",
    compact: "compact",
  
    terminal: "terminal",
    terminalNote:
      "one palette for every open terminal — cards are told apart by title, pen seal and status, never by terminal colour.",
    terminalTheme: "colour theme",
    terminalFontSize: "text size",
  
    runtime: "runtime",
    runtimeNote: "the output poll interval is bridge-owned. each connected pen advertises its own cadence.",
    noPensConnected: "no pens connected yet.",
    pollOverride: "requested override (ms)",
    pollOverrideNote:
      "not wired up yet — the bridge does not accept a per-subscription poll interval, so this is saved in this browser and changes nothing.",
  
    pens: "pens",
    pensNote: "the pen list is bridge-owned. to add, remove or reconfigure a pen, edit",
    pensNoteFile: "kanhrd.config.yaml",
    pensNoteTail: "on the machine running the bridge — this screen reads it, it never writes it.",
    noPens: "no pens configured.",
    connected: "connected",
    notConnected: "not connected",
  
    keyboard: "keyboard",
    keyboardNote:
      "herdr-style prefix shortcuts: press the prefix, release, then the action key. rebinding is not available yet — only the prefix resets.",
    colAction: "action",
    colDefault: "default",
    colCurrent: "current",
    resetDefaults: "reset to defaults",
  
    data: "data",
    dataNote: "everything kanhrd keeps in this browser. no pen and no bridge is touched.",
    clearData: "clear local data",
    clearTitle: "clear what this browser remembers?",
    clearBody:
      "this removes kanhrd's saved settings from this browser and reloads the page. no pen, session or bridge is affected. this cannot be undone.",
    clearAction: "clear",
    clearKindSetting: "setting",
    clearFilters: "board filters",
    clearAppearance: "theme and density",
    clearTerminal: "terminal palette",
    clearTerminalFontSize: "terminal text size",
    clearKeyboard: "keyboard prefix",
  
    poll: {
      unavailable: "n/a",
      unit: "ms",
    },
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
