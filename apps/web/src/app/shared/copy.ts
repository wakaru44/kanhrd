/**
 * The single source of user-facing copy. Every string here is transcribed
 * byte-for-byte from the approved-copy table in `docs/BRAND.md`; that table
 * is the authority and this file is its only executable form. Templates
 * reference these by name and never inline a user-facing string.
 *
 * Three rules travel with the strings:
 *
 * 1. **herdr's objects use herdr's words.** Users read *host*, *workspace*
 *    and *tab*, the same words the wire protocol, TypeScript identifiers and
 *    capability names use. A `{reason}` slot quotes herdr's response
 *    verbatim — including its original case. Never rewrite herdr's error
 *    text.
 * 2. **The board's own furniture uses kanban's words.** A *card* is the
 *    board's representation of a pane, a *status column* is a grouping
 *    derived from `agent_status`, and a *lane* is a swimlane — never a tab,
 *    in copy, in help text, or in comments.
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
    noHosts: 'no hosts yet.',
    noHostsBody: 'point kanhrd at a herdr socket. add a host to kanhrd.config.yaml:',
    noHostsThen: 'then start the bridge:',
    noHostsDocsLink: 'read the operating guide',
    waitingForHost: 'waiting for a host…',
    hostEmpty: 'this host is quiet. nothing running here yet.',
    noMatches: 'nothing matches these filters.',
    noMatchesAction: 'clear filters',
    scopeEmpty: 'nothing in this scope.',
    scopeEmptyAction: 'clear scope',
    notFound: 'off the map.',
    notFoundAction: 'back to the board',
    scopeUnavailable: 'that workspace is no longer here.',
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
   * the rail lists.
   */
  rail: {
    navigation: 'workspaces and tabs',
    renameWorkspace: 'rename workspace',
    renameTab: 'rename tab',
    lastWorkspaceRefusal:
      'this is the only workspace open on this host. closing it would leave nothing to watch. open another workspace first.',
  },
  confirm: {
    closePane: 'let this one rest?',
    closePaneBody:
      'closing ends this session. the terminal and anything running in it stop. this cannot be undone.',
    closePaneAction: 'rest',
    keep: 'keep',
    cancel: 'cancel',
    closeTab: 'let this tab rest?',
    closeTabBody: 'these sessions end and cannot be recovered:',
    closeTabAction: 'close tab',
    closeWorkspace: 'let this workspace rest?',
    closeWorkspaceBody: 'these sessions end and cannot be recovered:',
    closeWorkspaceAction: 'close workspace',
    closeLinkedWorkspaces: 'close every linked workspace?',
    closeLinkedWorkspacesBody:
      'this workspace shares a git worktree with others. all of them close, and every session inside them ends. this cannot be undone.',
    closeLinkedWorkspacesAction: 'close all',
    lastTabNote: 'this is the last tab in its workspace. the workspace closes too.',
    previewHeading: 'this closes:',
    refusalHeading: "herdr won't do that.",
  },
  toast: {
    hostDisconnected: 'lost sight of {host}. retrying.',
    hostReconnected: 'back in view.',
    bridgeDisconnected: 'lost the bridge. retrying.',
    bridgeReconnected: 'bridge back.',
    splitFailed: "couldn't split. herdr said: {reason}",
    closeFailed: "couldn't close {name}. herdr said: {reason}",
    createPaneFailed: "couldn't open a card. herdr said: {reason}",
    createTabFailed: "couldn't open a tab. herdr said: {reason}",
    createWorkspaceFailed: "couldn't open a workspace. herdr said: {reason}",
    renameFailed: "couldn't rename. herdr said: {reason}",
    liveUpdatesUnavailable: 'no live updates for this card. herdr said: {reason}',
    working: 'working…',
    /** The dismiss control on a toast itself. */
    dismiss: 'dismiss',
  },
  /**
   * The board's swimlane grouping. `groupBy` labels the control; the rest
   * name the dimensions the operator picks between. `ungrouped` is a fact
   * about the pane — those cards have no repository — not an error, so it
   * takes no care verb.
   */
  swimlane: {
    groupBy: 'group by',
    none: 'none',
    host: 'host',
    repository: 'repository',
    checkout: 'checkout path',
    tab: 'tab',
    ungrouped: 'no repository',
  },
  status: {
    working: 'working',
    blocked: 'blocked',
    done: 'done',
    idle: 'idle',
    unknown: 'unknown',
  },
  loading: {
    board: 'finding hosts…',
    pane: 'keeping watch…',
    retry: 'try again',
  },
  state: {
    stale: 'stale — reconnecting',
    unavailable: 'this host is out of sight.',
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
   */
  create: {
    /** Accessible name of the `+` trigger. */
    menu: 'open',
    pane: 'open a card',
    tab: 'open a tab',
    workspace: 'open a workspace',
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
      nextTab: 'next tab',
      prevTab: 'previous tab',
      lastTab: 'last tab — jump back to the one before',
      openRail: 'open and focus the navigator',
      closeTab: 'close the current tab — asks first',
      /** Tail is `notShipped`; the board has no focused-card model to act on. */
      closePane: 'close the current card — not yet.',
      renameTab: 'rename the current tab',
      jumpTab: 'jump to tab 0-9 in the current workspace',
      help: 'open this help',
      toggleTheme: 'switch between washi and sumi',
      /** Tail is `notShipped`. */
      focusSearch: 'focus search — not yet.',
      closeOverlay: 'close the open dialog, help, create menu or drawer',
    },
  },
  /**
   * The `/settings` screen. Lifted verbatim from the screen's own
   * `SETTINGS_COPY` block, which existed only because a work lane could not
   * edit this file.
   *
   * `poll.unavailable` / `poll.unit` are data readouts rather than product
   * copy; they live here because the rest of the screen's row does, and a
   * unit label with nowhere else to go is worse than one slightly out of
   * place.
   */
  settings: {
    appearance: 'appearance',
    theme: 'theme',
    density: 'density',
    comfortable: 'comfortable',
    compact: 'compact',

    terminal: 'terminal',
    terminalNote:
      'one palette for every open terminal — cards are told apart by title, host seal and status, never by terminal colour.',
    terminalTheme: 'colour theme',
    terminalFontSize: 'text size',

    runtime: 'runtime',
    runtimeNote:
      'the output poll interval is bridge-owned. each connected host advertises its own cadence.',
    noHostsConnected: 'no hosts connected yet.',
    pollOverride: 'requested override (ms)',
    pollOverrideNote:
      'not wired up yet — the bridge does not accept a per-subscription poll interval, so this is saved in this browser and changes nothing.',

    hosts: 'hosts',
    hostsNote: 'the host list is bridge-owned. to add, remove or reconfigure a host, edit',
    hostsNoteFile: 'kanhrd.config.yaml',
    hostsNoteTail: 'on the machine running the bridge — this screen reads it, it never writes it.',
    noHosts: 'no hosts configured.',
    connected: 'connected',
    notConnected: 'not connected',

    keyboard: 'keyboard',
    keyboardNote:
      'herdr-style prefix shortcuts: press the prefix, release, then the action key. rebinding is not available yet — only the prefix resets.',
    colAction: 'action',
    colDefault: 'default',
    colCurrent: 'current',
    resetDefaults: 'reset to defaults',

    data: 'data',
    dataNote: 'everything kanhrd keeps in this browser. no host and no bridge is touched.',
    clearData: 'clear local data',
    clearTitle: 'clear what this browser remembers?',
    clearBody:
      "this removes kanhrd's saved settings from this browser and reloads the page. no host, session or bridge is affected. this cannot be undone.",
    clearAction: 'clear',
    clearKindSetting: 'setting',
    clearFilters: 'board filters',
    /** The swimlane dimension rides the same settings key, so clearing takes it too. */
    clearSwimlane: 'board grouping',
    clearAppearance: 'theme and density',
    clearTerminal: 'terminal palette',
    clearTerminalFontSize: 'terminal text size',
    clearKeyboard: 'keyboard prefix',

    poll: {
      unavailable: 'n/a',
      unit: 'ms',
    },
  },
  notShipped: 'not yet.',
} as const;

/**
 * The placeholder names inside a copy template, as a union of string
 * literals — `Slots<'lost sight of {host}. retrying.'>` is `'host'`.
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
