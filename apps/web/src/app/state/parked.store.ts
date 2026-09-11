import { Injectable, computed, effect, signal } from '@angular/core';
import type { AgentStatus } from '@kanhrd/schema';
import type { PaneKey } from './panes.store';

/**
 * User-defined columns ("parked columns"), and which pane sits in which.
 *
 * A parked column is not a herdr concept at any level: herdr's model is
 * host → workspace → tab → pane and carries no grouping orthogonal to it
 * (openspec `add-parked-columns` design.md, findings 1-2). The grouping key
 * here is the operator's opinion rather than herdr's fact, so both halves —
 * the column definitions AND the membership — live in this browser, under
 * one `localStorage` key, exactly the way `Filters` already does in
 * `panes.store.ts`. Keeping them in one document is the point: a membership
 * entry can never name a column this browser does not have.
 *
 * Consequences, stated rather than softened: parked columns are not shared
 * between browsers or devices, are invisible to herdr and to every other
 * herdr client, and are lost with site data. Settings carries a
 * `clear parked columns` action so the state is not invisible.
 */

/**
 * When a card leaves a parked column on its own.
 *
 * - `never` — only the operator takes a card out.
 * - `agent-activity` — the card leaves when the agent activates, i.e. the
 *   pane's `agent_status` transitions INTO `working` or `blocked`. That is
 *   herdr's own agent-state detection arriving on
 *   `pane.agent_status_changed`, the event the board already subscribes to
 *   for every card: no new subscription, no `pane.read`, no per-card output
 *   poll (docs/UX-GUIDELINES.md forbids fetching terminal output for
 *   decoration).
 *
 * The operator's third rule, `on any activity`, is deliberately absent: it
 * needs a signal the board does not receive today. See tasks.md § 6.
 */
export type ExitRule = 'never' | 'agent-activity';

export const EXIT_RULES: readonly ExitRule[] = ['never', 'agent-activity'];

export interface ParkedColumn {
  /** Stable, browser-local id (`p1`, `p2`, …). Never leaves this browser. */
  id: string;
  name: string;
  exitRule: ExitRule;
  /** Position among the parked columns, left to right, after `unknown`. */
  order: number;
}

export interface ParkedState {
  /**
   * Schema version, so a later phase that relocates membership (e.g. onto
   * herdr) can migrate rather than guess. An unknown version loads as the
   * default rather than being half-applied.
   */
  version: 1;
  columns: readonly ParkedColumn[];
  /** `PaneKey` → column id. One column per pane, by construction. */
  membership: Readonly<Record<string, string>>;
}

export const PARKED_STORAGE_KEY = 'kanhrd.parked-columns';

/**
 * The board's identity for one parked column, and the prefix that tells a
 * parked column's key apart from a status column's (a status name never
 * contains a colon).
 *
 * It lives here rather than beside `BoardColumnRef` in `board/column.ts`
 * because `panes.store.ts` keys the board's hidden-column set by it, and
 * `board/column.ts` is a component module — importing it into the state
 * layer would drag the `Column` component and the CDK along with it.
 * `board/column.ts` re-exports this so every existing importer is unchanged.
 */
export const PARKED_COLUMN_KEY_PREFIX = 'parked:';

export function parkedColumnKey(id: string): string {
  return `${PARKED_COLUMN_KEY_PREFIX}${id}`;
}

export function defaultParked(): ParkedState {
  return { version: 1, columns: [], membership: {} };
}

function isExitRule(value: unknown): value is ExitRule {
  return value === 'never' || value === 'agent-activity';
}

function readColumn(value: unknown): ParkedColumn | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { id, name, exitRule, order } = value as Partial<ParkedColumn>;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string') {
    return null;
  }
  if (!isExitRule(exitRule) || typeof order !== 'number' || !Number.isFinite(order)) {
    return null;
  }
  return { id, name, exitRule, order };
}

/**
 * Defensive read, in the shape `loadFilters` already has: an absent key,
 * unparsable JSON or an unknown `version` yields the default; an individual
 * malformed column, or a membership entry naming a column this document does
 * not define, is dropped. Never throws, never half-applies.
 */
export function loadParked(storage: Pick<Storage, 'getItem'> = localStorage): ParkedState {
  try {
    const raw = storage.getItem(PARKED_STORAGE_KEY);
    if (!raw) {
      return defaultParked();
    }
    const parsed = JSON.parse(raw) as Partial<ParkedState>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return defaultParked();
    }
    const columns: ParkedColumn[] = [];
    for (const entry of Array.isArray(parsed.columns) ? parsed.columns : []) {
      const column = readColumn(entry);
      if (column && !columns.some((c) => c.id === column.id)) {
        columns.push(column);
      }
    }
    const membership: Record<string, string> = {};
    const known = new Set(columns.map((c) => c.id));
    const stored = parsed.membership;
    if (stored && typeof stored === 'object') {
      for (const [key, columnId] of Object.entries(stored)) {
        if (typeof columnId === 'string' && known.has(columnId)) {
          membership[key] = columnId;
        }
      }
    }
    return { version: 1, columns, membership };
  } catch {
    return defaultParked();
  }
}

export function saveParked(
  state: ParkedState,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(PARKED_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Whether a status transition ejects a card from a column under `rule`.
 * Pure, so the whole matrix is testable without a board, a store or a socket.
 *
 * `agent-activity` fires only on a transition INTO `working` or `blocked` —
 * `working → done` stays parked, and a repeated status is not a transition.
 * A rule change therefore applies from the next event onward and never
 * retroactively unparks anything.
 */
export function shouldExit(rule: ExitRule, previous: AgentStatus, next: AgentStatus): boolean {
  if (rule === 'never') {
    return false;
  }
  return next !== previous && (next === 'working' || next === 'blocked');
}

/** `p1`, `p2`, … — the lowest free id, so ids stay short and deterministic in tests. */
function nextColumnId(columns: readonly ParkedColumn[]): string {
  const taken = new Set(columns.map((c) => c.id));
  for (let n = 1; ; n++) {
    const id = `p${n}`;
    if (!taken.has(id)) {
      return id;
    }
  }
}

/**
 * Signals-based store for the board's user-defined columns, persisted to
 * `localStorage['kanhrd.parked-columns']`. Sibling of `SettingsService`:
 * same `kanhrd.*` namespace, so Settings' "clear local data" sweep takes it
 * too.
 *
 * It holds no user-facing strings — a new column's name is supplied by the
 * caller, from `shared/copy.ts`.
 */
@Injectable({ providedIn: 'root' })
export class ParkedStore {
  private readonly state = signal<ParkedState>(loadParked());

  /** The operator's columns, left to right. */
  readonly columns = computed<readonly ParkedColumn[]>(() =>
    [...this.state().columns].sort((a, b) => a.order - b.order)
  );

  /** `PaneKey` → column id, for the board's partition. */
  readonly membership = computed<ReadonlyMap<PaneKey, string>>(
    () => new Map(Object.entries(this.state().membership)) as ReadonlyMap<PaneKey, string>
  );

  /**
   * Whether the board has any user-defined column at all. Phase B's drag
   * affordance is gated on this: a board with no parked column is not a
   * drag source (docs/UX-GUIDELINES.md, "Status columns are read-only").
   */
  readonly hasColumns = computed(() => this.state().columns.length > 0);

  constructor() {
    effect(() => {
      saveParked(this.state());
    });
  }

  columnOf(key: PaneKey): string | null {
    return this.state().membership[key] ?? null;
  }

  /** Appends a column at the right-hand end and returns it. */
  createColumn(name: string, exitRule: ExitRule = 'agent-activity'): ParkedColumn {
    const columns = this.state().columns;
    const column: ParkedColumn = {
      id: nextColumnId(columns),
      name,
      exitRule,
      order: columns.reduce((max, c) => Math.max(max, c.order + 1), 0),
    };
    this.state.update((state) => ({ ...state, columns: [...state.columns, column] }));
    return column;
  }

  renameColumn(id: string, name: string): void {
    this.updateColumn(id, (column) => ({ ...column, name }));
  }

  setExitRule(id: string, exitRule: ExitRule): void {
    this.updateColumn(id, (column) => ({ ...column, exitRule }));
  }

  /** Drops the column; its cards return to their status columns. Nothing on the host changes. */
  removeColumn(id: string): void {
    this.state.update((state) => ({
      ...state,
      columns: state.columns.filter((column) => column.id !== id),
      membership: Object.fromEntries(
        Object.entries(state.membership).filter(([, columnId]) => columnId !== id)
      ),
    }));
  }

  /**
   * Puts a card in a column. Membership is settable from anywhere — the
   * card's menu today, a drop target in phase B — so nothing here knows
   * which affordance called it. An unknown column id is ignored rather than
   * creating a dangling entry.
   */
  park(key: PaneKey, columnId: string): void {
    if (!this.state().columns.some((column) => column.id === columnId)) {
      return;
    }
    this.state.update((state) => ({
      ...state,
      membership: { ...state.membership, [key]: columnId },
    }));
  }

  unpark(key: PaneKey): void {
    this.releasePanes([key]);
  }

  /**
   * Drops membership for panes that are gone: `pane.closed`, and the local
   * purge of cascaded children after `tab.closed` / `workspace.closed`.
   * Never called for a host disconnect — a parked card of an unreachable
   * host keeps its slot and is marked stale like any other card, and
   * unparking on a reconnect flap would silently lose the arrangement.
   */
  releasePanes(keys: Iterable<PaneKey>): void {
    const dropped = new Set<string>(keys);
    if (dropped.size === 0) {
      return;
    }
    this.state.update((state) => {
      const entries = Object.entries(state.membership).filter(([key]) => !dropped.has(key));
      if (entries.length === Object.keys(state.membership).length) {
        return state;
      }
      return { ...state, membership: Object.fromEntries(entries) };
    });
  }

  /**
   * One `pane.agent_status_changed` event, applied to the exit rule of
   * whatever column the pane sits in. A pane in no column, or in a column
   * whose rule does not fire, is left alone.
   */
  applyAgentStatusChanged(key: PaneKey, previous: AgentStatus, next: AgentStatus): void {
    const columnId = this.columnOf(key);
    if (!columnId) {
      return;
    }
    const column = this.state().columns.find((c) => c.id === columnId);
    if (column && shouldExit(column.exitRule, previous, next)) {
      this.unpark(key);
    }
  }

  /** Settings' `clear parked columns`: the columns and every membership entry go. */
  clear(): void {
    this.state.set(defaultParked());
  }

  private updateColumn(id: string, update: (column: ParkedColumn) => ParkedColumn): void {
    this.state.update((state) => ({
      ...state,
      columns: state.columns.map((column) => (column.id === id ? update(column) : column)),
    }));
  }
}
