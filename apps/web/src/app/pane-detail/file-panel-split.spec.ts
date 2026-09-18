import {
  DEFAULT_SPLIT,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_STORAGE_KEY,
  clampSplit,
  loadSplit,
  saveSplit,
} from './file-panel-split';

/**
 * The numbers are rulings from `/labs/file-explorer/mock1`, settled on a
 * desktop and a phone. These tests pin them so a later refactor cannot
 * quietly re-derive them, and prove the panel still opens when the browser
 * refuses storage.
 */
describe('pane-detail/file-panel-split', () => {
  it('keeps the operator-settled defaults', () => {
    expect(DEFAULT_SPLIT.hbox).toBe(0.6);
    expect(DEFAULT_SPLIT.vbox).toBe(0.5);
  });

  it('clamps to the usable band', () => {
    expect(clampSplit(0)).toBe(SPLIT_MIN);
    expect(clampSplit(1)).toBe(SPLIT_MAX);
    expect(clampSplit(0.42)).toBe(0.42);
  });

  it('never yields NaN for a ratio measured against a zero-sized box', () => {
    expect(clampSplit(Number.NaN)).toBe(DEFAULT_SPLIT.hbox);
  });

  it('remembers a ratio per axis', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveSplit({ hbox: 0.35, vbox: 0.7 }, storage);
    expect(loadSplit(storage)).toEqual({ hbox: 0.35, vbox: 0.7 });
    expect(store.has(SPLIT_STORAGE_KEY)).toBeTrue();
  });

  it('clamps what it reads back, so a hand-edited value cannot wedge the panel shut', () => {
    const storage = { getItem: () => JSON.stringify({ hbox: 0.99, vbox: -4 }) };
    expect(loadSplit(storage)).toEqual({ hbox: SPLIT_MAX, vbox: SPLIT_MIN });
  });

  it('falls back to the defaults on unusable stored data', () => {
    expect(loadSplit({ getItem: () => 'not json' })).toEqual({ ...DEFAULT_SPLIT });
    expect(loadSplit({ getItem: () => null })).toEqual({ ...DEFAULT_SPLIT });
    expect(loadSplit({ getItem: () => JSON.stringify({ hbox: 'wide' }) })).toEqual({
      ...DEFAULT_SPLIT,
    });
  });

  it('opens at the defaults when storage throws, rather than failing the view', () => {
    const storage = {
      getItem: () => {
        throw new Error('site data blocked');
      },
      setItem: () => {
        throw new Error('site data blocked');
      },
    };
    expect(loadSplit(storage)).toEqual({ ...DEFAULT_SPLIT });
    expect(() => saveSplit({ hbox: 0.4, vbox: 0.4 }, storage)).not.toThrow();
  });

  it('survives a browser with no storage object at all', () => {
    expect(loadSplit(null)).toEqual({ ...DEFAULT_SPLIT });
    expect(() => saveSplit({ hbox: 0.4, vbox: 0.4 }, null)).not.toThrow();
  });
});
