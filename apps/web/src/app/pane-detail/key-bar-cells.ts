import { Signal, computed, signal } from '@angular/core';

/**
 * The key bar's cells, as data. The bar renders whatever list it is handed
 * and never names a key in its template, so a later change can let the
 * operator edit this list without touching the renderer, the modifier state
 * or the transport. See openspec/changes/add-terminal-key-bar/design.md.
 *
 * Key names are herdr's `pane.send_keys` vocabulary, measured against a real
 * session: modifiers compose inside a name (`ctrl+b`, `alt+x`,
 * `ctrl+alt+b`), so nothing here ever builds byte sequences.
 */

export type KeyBarModifier = 'ctrl' | 'alt';

/** A cell that sends a SEQUENCE of key events in one `pane.send_keys`. v1's are one key long; a composite is the same shape. */
export interface KeyBarKeysCell {
  readonly kind: 'keys';
  /** Stable, so a stored list can be reordered and tests address cells by id. */
  readonly id: string;
  /** The keycap: characters, never an icon. */
  readonly label: string;
  readonly keys: readonly string[];
}

/** A sticky modifier: tap to latch for one key, long-press to lock. */
export interface KeyBarModifierCell {
  readonly kind: 'modifier';
  readonly id: string;
  readonly label: string;
  readonly modifier: KeyBarModifier;
}

export type KeyBarCell = KeyBarKeysCell | KeyBarModifierCell;

/**
 * v1's fixed list, in the order the row reads at phone width: the keys a
 * thumb reaches for most first, `alt` last because it is the one that
 * scrolls off the end at 390px.
 *
 * `^B` is a LITERAL `ctrl+b` sent to whatever runs in the pane (tmux, vim,
 * readline). It deliberately does not follow `KeyboardService.prefix()`:
 * `pane.send_keys` reaches the pane's program, never herdr's own prefix
 * layer, and an operator who moved herdr's prefix to, say, Ctrl+Space did so
 * to free Ctrl+B for tmux — following `prefix()` would hand them back the one
 * key they moved out of the way. Operator ruling, 2026-09-13.
 */
export const DEFAULT_KEY_BAR_CELLS: readonly KeyBarCell[] = [
  { kind: 'keys', id: 'esc', label: 'esc', keys: ['esc'] },
  { kind: 'modifier', id: 'ctrl', label: 'ctrl', modifier: 'ctrl' },
  { kind: 'keys', id: 'ctrl-b', label: '^B', keys: ['ctrl+b'] },
  { kind: 'keys', id: 'tab', label: 'tab', keys: ['tab'] },
  { kind: 'keys', id: 'up', label: '↑', keys: ['up'] },
  { kind: 'keys', id: 'down', label: '↓', keys: ['down'] },
  { kind: 'keys', id: 'left', label: '←', keys: ['left'] },
  { kind: 'keys', id: 'right', label: '→', keys: ['right'] },
  { kind: 'modifier', id: 'alt', label: 'alt', modifier: 'alt' },
];

export type ModifierState = 'idle' | 'armed' | 'locked';

const MODIFIER_ORDER: readonly KeyBarModifier[] = ['ctrl', 'alt'];

/**
 * `key` with every active modifier folded into its name, in `ctrl+alt+…`
 * order and never twice: `foldModifiers('up', ['ctrl'])` is `ctrl+up`,
 * `foldModifiers('ctrl+b', ['ctrl', 'alt'])` is `ctrl+alt+b`.
 */
export function foldModifiers(key: string, active: readonly KeyBarModifier[]): string {
  // Peel known modifier prefixes only, so a literal `+` stays a key.
  const carried = new Set<string>();
  let base = key;
  for (let match = KNOWN_PREFIX.exec(base); match; match = KNOWN_PREFIX.exec(base)) {
    carried.add(match[1].toLowerCase());
    base = base.slice(match[0].length);
  }
  for (const modifier of active) {
    carried.add(modifier);
  }
  const ordered = [
    ...MODIFIER_ORDER.filter((m) => carried.has(m)),
    ...[...carried].filter((m) => !MODIFIER_ORDER.includes(m as KeyBarModifier)),
  ];
  return [...ordered, base].join('+');
}

/** A modifier prefix herdr understands, with something after it. */
const KNOWN_PREFIX = /^(ctrl|alt|shift|meta)\+(?=.)/i;

/** The herdr key name for one typed character: `space` for a space, the character itself otherwise. */
export function keyNameForCharacter(char: string): string {
  return char === ' ' ? 'space' : char;
}

/**
 * The sticky-modifier state of one pane-detail view. View state, not a root
 * service: leaving the pane drops it, so a latch never follows the operator
 * to another pane.
 *
 * Tap moves idle → armed → idle; long-press locks; a tap on a locked
 * modifier releases it. An armed or locked modifier folds into the next key
 * sent — a bar cell or a character from the soft keyboard — after which armed
 * ones return to idle and locked ones stay. No timeout: a latch that expires
 * misfires while the operator reads the screen between taps.
 */
export class KeyBarModifiers {
  private readonly states = signal<Readonly<Record<KeyBarModifier, ModifierState>>>({
    ctrl: 'idle',
    alt: 'idle',
  });

  /** The modifiers that will fold into the next key, in fold order. */
  readonly active: Signal<readonly KeyBarModifier[]> = computed(() =>
    MODIFIER_ORDER.filter((m) => this.states()[m] !== 'idle')
  );

  stateOf(modifier: KeyBarModifier): ModifierState {
    return this.states()[modifier];
  }

  tap(modifier: KeyBarModifier): void {
    const current = this.states()[modifier];
    this.set(modifier, current === 'idle' ? 'armed' : 'idle');
  }

  lock(modifier: KeyBarModifier): void {
    this.set(modifier, 'locked');
  }

  /** Folds the active modifiers into `key` and releases the armed ones. */
  consume(key: string): string {
    const active = this.active();
    if (active.length === 0) {
      return key;
    }
    const folded = foldModifiers(key, active);
    const next = { ...this.states() };
    for (const modifier of MODIFIER_ORDER) {
      if (next[modifier] === 'armed') next[modifier] = 'idle';
    }
    this.states.set(next);
    return folded;
  }

  private set(modifier: KeyBarModifier, state: ModifierState): void {
    this.states.set({ ...this.states(), [modifier]: state });
  }
}
