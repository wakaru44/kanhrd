/**
 * The split between the terminal and the file panel. Pure: the panel owns
 * the signals, this owns the arithmetic and the one piece of persistence.
 *
 * The numbers are rulings from `/labs/file-explorer/mock1`, settled on a
 * desktop and on a phone. They are not re-derived here.
 */

export type SplitAxis = 'hbox' | 'vbox';

/** Terminal share of the split, per axis. The panel gets the rest. */
export const DEFAULT_SPLIT: Readonly<Record<SplitAxis, number>> = { hbox: 0.6, vbox: 0.5 };
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;
/** One keyboard step on the splitter. */
export const SPLIT_STEP = 0.05;
export const SPLIT_STORAGE_KEY = 'kanhrd.pane-detail.file-panel.split';

/** Below this PANEL width (not viewport) the browser and viewer stop sitting side by side. */
export const SIDE_BY_SIDE_MIN_PX = 560;

export function clampSplit(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_SPLIT.hbox;
  }
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ratio));
}

/**
 * The remembered split, or the defaults. A storage that throws (private
 * mode, blocked site data) or holds something unusable is not an error the
 * operator needs to hear about — the panel opens at the defaults.
 */
export function loadSplit(
  storage: Pick<Storage, 'getItem'> | null = safeStorage()
): Record<SplitAxis, number> {
  try {
    const raw = JSON.parse(storage?.getItem(SPLIT_STORAGE_KEY) ?? 'null') as Partial<
      Record<SplitAxis, unknown>
    > | null;
    const pick = (axis: SplitAxis) =>
      typeof raw?.[axis] === 'number' ? clampSplit(raw[axis] as number) : DEFAULT_SPLIT[axis];
    return { hbox: pick('hbox'), vbox: pick('vbox') };
  } catch {
    return { ...DEFAULT_SPLIT };
  }
}

/** Best-effort; a split that cannot be remembered lasts for this visit. */
export function saveSplit(
  splits: Record<SplitAxis, number>,
  storage: Pick<Storage, 'setItem'> | null = safeStorage()
): void {
  try {
    storage?.setItem(SPLIT_STORAGE_KEY, JSON.stringify(splits));
  } catch {
    /* storage unavailable: the split lasts for this visit only */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
