import {
  DEFAULT_KEY_BAR_CELLS,
  KeyBarModifiers,
  foldModifiers,
  keyNameForCharacter,
} from './key-bar-cells';

describe('key bar cells', () => {
  describe('the v1 list', () => {
    it('is the operator key set, in thumb order, with alt last', () => {
      expect(DEFAULT_KEY_BAR_CELLS.map((c) => c.label)).toEqual([
        'esc',
        'ctrl',
        '^B',
        'tab',
        '↑',
        '↓',
        '←',
        '→',
        'alt',
      ]);
    });

    it('sends a literal ctrl+b from ^B, never the resolved prefix', () => {
      // Operator ruling: ^B is for tmux/vim/readline in the pane; an operator
      // who moved herdr's prefix freed Ctrl+B on purpose.
      const cell = DEFAULT_KEY_BAR_CELLS.find((c) => c.id === 'ctrl-b');
      expect(cell).toEqual({ kind: 'keys', id: 'ctrl-b', label: '^B', keys: ['ctrl+b'] });
    });

    it('uses herdr key names that were measured to reach a pane', () => {
      const keys = DEFAULT_KEY_BAR_CELLS.flatMap((c) => (c.kind === 'keys' ? c.keys : []));
      expect(keys).toEqual(['esc', 'ctrl+b', 'tab', 'up', 'down', 'left', 'right']);
    });

    it('gives every cell a unique stable id', () => {
      const ids = DEFAULT_KEY_BAR_CELLS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('foldModifiers', () => {
    it('adds active modifiers in ctrl+alt order', () => {
      expect(foldModifiers('up', ['ctrl'])).toBe('ctrl+up');
      expect(foldModifiers('left', ['alt', 'ctrl'])).toBe('ctrl+alt+left');
    });

    it('never repeats a modifier the key already carries', () => {
      expect(foldModifiers('ctrl+b', ['ctrl'])).toBe('ctrl+b');
      expect(foldModifiers('ctrl+b', ['alt'])).toBe('ctrl+alt+b');
    });

    it('keeps a literal plus as the key', () => {
      expect(foldModifiers('+', ['ctrl'])).toBe('ctrl++');
    });

    it('leaves a key alone with nothing active', () => {
      expect(foldModifiers('esc', [])).toBe('esc');
    });
  });

  it('names a typed space as space', () => {
    expect(keyNameForCharacter(' ')).toBe('space');
    expect(keyNameForCharacter('c')).toBe('c');
  });

  describe('KeyBarModifiers', () => {
    it('arms on tap and disarms on a second tap', () => {
      const m = new KeyBarModifiers();
      m.tap('ctrl');
      expect(m.stateOf('ctrl')).toBe('armed');
      m.tap('ctrl');
      expect(m.stateOf('ctrl')).toBe('idle');
    });

    it('releases an armed modifier after one key', () => {
      const m = new KeyBarModifiers();
      m.tap('ctrl');
      expect(m.consume('c')).toBe('ctrl+c');
      expect(m.stateOf('ctrl')).toBe('idle');
      expect(m.consume('c')).toBe('c');
    });

    it('keeps a locked modifier across keys until tapped', () => {
      const m = new KeyBarModifiers();
      m.lock('ctrl');
      expect(m.consume('up')).toBe('ctrl+up');
      expect(m.consume('up')).toBe('ctrl+up');
      expect(m.stateOf('ctrl')).toBe('locked');
      m.tap('ctrl');
      expect(m.stateOf('ctrl')).toBe('idle');
    });

    it('composes modifiers and clears only the armed ones', () => {
      const m = new KeyBarModifiers();
      m.lock('ctrl');
      m.tap('alt');
      expect(m.consume('left')).toBe('ctrl+alt+left');
      expect(m.stateOf('ctrl')).toBe('locked');
      expect(m.stateOf('alt')).toBe('idle');
    });
  });
});
