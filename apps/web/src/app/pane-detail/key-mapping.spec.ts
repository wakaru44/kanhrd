import { classifyInput } from './key-mapping';

describe('classifyInput', () => {
  it('maps Enter (CR or LF) to the Enter key token', () => {
    expect(classifyInput('\r')).toEqual({ kind: 'keys', keys: ['Enter'] });
    expect(classifyInput('\n')).toEqual({ kind: 'keys', keys: ['Enter'] });
  });

  it('maps Backspace, Escape, Tab', () => {
    expect(classifyInput('\x7f')).toEqual({ kind: 'keys', keys: ['Backspace'] });
    expect(classifyInput('\x1b')).toEqual({ kind: 'keys', keys: ['Escape'] });
    expect(classifyInput('\t')).toEqual({ kind: 'keys', keys: ['Tab'] });
  });

  it('maps Ctrl-C and Ctrl-D to their herdr key names', () => {
    expect(classifyInput('\x03')).toEqual({ kind: 'keys', keys: ['ctrl+c'] });
    expect(classifyInput('\x04')).toEqual({ kind: 'keys', keys: ['ctrl+d'] });
  });

  it('maps arrow key escape sequences', () => {
    expect(classifyInput('\x1b[A')).toEqual({ kind: 'keys', keys: ['Up'] });
    expect(classifyInput('\x1b[B')).toEqual({ kind: 'keys', keys: ['Down'] });
    expect(classifyInput('\x1b[C')).toEqual({ kind: 'keys', keys: ['Right'] });
    expect(classifyInput('\x1b[D')).toEqual({ kind: 'keys', keys: ['Left'] });
  });

  it('maps other Ctrl-<letter> bytes to ctrl+<letter>', () => {
    expect(classifyInput('\x01')).toEqual({ kind: 'keys', keys: ['ctrl+a'] });
    expect(classifyInput('\x18')).toEqual({ kind: 'keys', keys: ['ctrl+x'] });
  });

  it('sends ordinary printable text as-is', () => {
    expect(classifyInput('hello')).toEqual({ kind: 'text', text: 'hello' });
  });

  it('sends pasted multi-character text as-is', () => {
    expect(classifyInput('git status\r')).toEqual({ kind: 'text', text: 'git status\r' });
  });

  it('falls back to best-effort text with unmapped flag for unrecognized control bytes', () => {
    const result = classifyInput('a\x00b');
    expect(result.kind).toBe('text');
    expect(result.text).toBe('a\x00b');
    expect(result.unmapped).toBe(true);
  });
});
