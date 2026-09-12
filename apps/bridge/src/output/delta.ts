/**
 * Line-delta encoding for `pane.output` (see `PaneOutputDelta` in
 * `@kanhrd/schema` and openspec/changes/add-delta-pane-output/design.md).
 *
 * The bridge is the one party that holds, exactly, the previous snapshot it
 * sent on a subscription, so it can describe the next one as
 * `previous.slice(drop, drop + keep) + tail` without guessing — and it
 * checks that before returning. Repeated lines (blank rows, TUI borders)
 * can only change which exact delta is picked, never make one wrong.
 */

/**
 * Bytes a delta descriptor adds to a frame, roughly
 * `,"delta":{"drop":12345,"keep":12345,"length":12345}`. A delta is only
 * worth sending when its tail plus this is smaller than the full snapshot.
 */
export const DELTA_DESCRIPTOR_BYTES = 64;

export interface LineDelta {
  drop: number;
  keep: number;
  /** The new tail: `next.slice(keep)`. */
  tail: string;
  length: number;
}

/** Offset of the start of every line in `text`, `\n`-separated. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}

/**
 * The delta that rebuilds `next` from `previous`, or `null` when a full
 * frame is no larger. A kept line must end in `\n` in both snapshots, so a
 * line still being written (the prompt, a spinner) is always sent as tail.
 */
export function lineDelta(previous: string, next: string): LineDelta | null {
  if (previous.length === 0 || next.length === 0) return null;

  const prevStarts = lineStarts(previous);
  const nextStarts = lineStarts(next);
  const prevLines = prevStarts.length;
  const nextLines = nextStarts.length;
  // `starts[i]` is always in range at the call sites below; `?? text.length`
  // only satisfies the index type.
  const startOf = (text: string, starts: number[], i: number): number => starts[i] ?? text.length;
  const lineOf = (text: string, starts: number[], i: number): string =>
    text.slice(
      startOf(text, starts, i),
      i + 1 < starts.length ? startOf(text, starts, i + 1) - 1 : text.length
    );

  const firstNext = lineOf(next, nextStarts, 0);
  let bestDrop = 0;
  let bestKeep = 0;
  for (let k = 0; k < prevLines - 1; k++) {
    if (lineOf(previous, prevStarts, k) !== firstNext) continue;
    // Extend over whole lines: prevLines - 1 / nextLines - 1 excludes each
    // snapshot's last line, which has no `\n` after it.
    let run = 0;
    while (
      k + run < prevLines - 1 &&
      run < nextLines - 1 &&
      lineOf(previous, prevStarts, k + run) === lineOf(next, nextStarts, run)
    ) {
      run++;
    }
    const drop = startOf(previous, prevStarts, k);
    const keep = startOf(previous, prevStarts, k + run) - drop;
    if (keep > bestKeep) {
      bestDrop = drop;
      bestKeep = keep;
    }
    // A run that reached previous's last full line cannot be beaten further down.
    if (k + run === prevLines - 1) break;
  }

  if (bestKeep === 0) return null;
  if (!next.startsWith(previous.slice(bestDrop, bestDrop + bestKeep))) return null;
  const tail = next.slice(bestKeep);
  if (tail.length + DELTA_DESCRIPTOR_BYTES >= next.length) return null;
  return { drop: bestDrop, keep: bestKeep, tail, length: next.length };
}

/** Applies a delta to the snapshot it was computed against. The client's half, kept here for tests. */
export function applyLineDelta(
  previous: string,
  delta: { drop: number; keep: number },
  tail: string
): string {
  return previous.slice(delta.drop, delta.drop + delta.keep) + tail;
}
