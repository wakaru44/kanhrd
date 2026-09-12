import { describe, expect, it } from 'vitest';
import { DELTA_DESCRIPTOR_BYTES, applyLineDelta, lineDelta } from './delta.js';

/** `count` rows `prefix-0001\r\n`, the shape herdr's `ansi` snapshot has. */
function rows(prefix: string, from: number, count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(from + i).padStart(4, '0')}\r\n`
  ).join('');
}

/** Every delta must rebuild `next` exactly; this is the property, asserted everywhere. */
function expectExact(previous: string, next: string) {
  const delta = lineDelta(previous, next);
  expect(delta).not.toBeNull();
  const rebuilt = applyLineDelta(previous, delta!, delta!.tail);
  expect(rebuilt).toBe(next);
  expect(rebuilt.length).toBe(delta!.length);
  return delta!;
}

describe('lineDelta', () => {
  it('encodes appended output as keep-everything plus the new rows', () => {
    const previous = rows('line', 1, 200) + '$ ';
    const next = rows('line', 1, 205) + '$ ';
    const delta = expectExact(previous, next);
    expect(delta.drop).toBe(0);
    expect(delta.tail).toBe(rows('line', 201, 5) + '$ ');
  });

  it('encodes a window sliding at the depth as dropped head plus new rows', () => {
    // herdr serves the last N lines: new output pushes old lines off the top.
    const previous = rows('line', 1, 1000);
    const next = rows('line', 4, 1000);
    const delta = expectExact(previous, next);
    expect(delta.drop).toBe(rows('line', 1, 3).length);
    expect(delta.tail).toBe(rows('line', 1001, 3));
  });

  it('encodes a redrawn bottom region as the unchanged rows above it plus the redraw', () => {
    const history = rows('hist', 1, 500);
    const previous = history + '╭──────╮\r\n│ > ab │\r\n╰──────╯';
    const next = history + '╭──────╮\r\n│ > abc │\r\n╰──────╯';
    const delta = expectExact(previous, next);
    // The box's top border is unchanged, so it is kept too.
    expect(delta.tail).toBe('│ > abc │\r\n╰──────╯');
  });

  it('never keeps a last line that has no newline after it, so a line still being written goes as tail', () => {
    const previous = rows('line', 1, 300) + 'working 1';
    const next = rows('line', 1, 300) + 'working 2';
    const delta = expectExact(previous, next);
    expect(delta.tail).toBe('working 2');
  });

  it('stays exact over rows that repeat, where the first matching line is not the right anchor', () => {
    const blank = '\r\n'.repeat(50);
    const previous = blank + rows('a', 1, 300) + blank + rows('b', 1, 300);
    const next = blank + rows('a', 3, 298) + blank + rows('b', 1, 305);
    expectExact(previous, next);
  });

  it('stays exact when every row is identical', () => {
    const same = '─────\r\n'.repeat(1000);
    expectExact(same, same.slice('─────\r\n'.length) + 'new\r\n');
  });

  it('returns nothing when the snapshots share no line', () => {
    expect(lineDelta(rows('old', 1, 100), rows('new', 1, 100))).toBeNull();
  });

  it('returns nothing for an empty side', () => {
    expect(lineDelta('', rows('x', 1, 10))).toBeNull();
    expect(lineDelta(rows('x', 1, 10), '')).toBeNull();
  });

  it('returns nothing when the delta would not be smaller than the full frame', () => {
    // A two-row screen: keeping one short row saves less than the descriptor costs.
    const previous = 'a\r\nb';
    const next = 'a\r\nc';
    expect('b'.length + DELTA_DESCRIPTOR_BYTES).toBeGreaterThanOrEqual(next.length);
    expect(lineDelta(previous, next)).toBeNull();
  });

  it('returns nothing for a full-screen repaint, as an alternate-screen TUI produces', () => {
    const previous = rows('frame-a', 1, 40);
    const next = rows('frame-b', 1, 40);
    expect(lineDelta(previous, next)).toBeNull();
  });

  it('handles 1000 identical rows in well under a poll interval', () => {
    const same = `${'x'.repeat(80)}\r\n`.repeat(1000);
    const started = performance.now();
    for (let i = 0; i < 10; i++) lineDelta(same, same + 'tail');
    expect((performance.now() - started) / 10).toBeLessThan(50);
  });
});
