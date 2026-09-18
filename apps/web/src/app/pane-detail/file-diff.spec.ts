import { parseUnifiedDiff } from './file-diff';

describe('pane-detail/file-diff', () => {
  const diff = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 1111111..2222222 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,4 +1,4 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    ' const c = 4;',
  ].join('\n');

  it('drops git file headers so a `---` is never read as a removed line', () => {
    const lines = parseUnifiedDiff(diff);
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'context', 'removed', 'added', 'context']);
    expect(lines.some((l) => l.text.includes('diff --git'))).toBeFalse();
  });

  it('strips the marker column, leaving it to the renderer', () => {
    const lines = parseUnifiedDiff(diff);
    expect(lines[2]).toEqual({ kind: 'removed', text: 'const b = 2;' });
    expect(lines[3]).toEqual({ kind: 'added', text: 'const b = 3;' });
    expect(lines[1].text).toBe('const a = 1;');
  });

  it('keeps the hunk header verbatim', () => {
    expect(parseUnifiedDiff(diff)[0].text).toBe('@@ -1,4 +1,4 @@');
  });

  it("keeps git's no-newline note as a fact about the file", () => {
    const lines = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file');
    expect(lines[lines.length - 1]).toEqual({
      kind: 'meta',
      text: 'No newline at end of file',
    });
  });

  it('reads an untracked file’s diff as every line added', () => {
    const lines = parseUnifiedDiff('@@ -0,0 +1,2 @@\n+one\n+two');
    expect(lines.filter((l) => l.kind === 'added').length).toBe(2);
  });

  it('answers an empty diff with no lines, so `unchanged` renders as no changes', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('does not leave a trailing blank row on a diff cut at a line boundary', () => {
    const lines = parseUnifiedDiff('@@ -1,2 +1,2 @@\n context\n+added\n');
    expect(lines[lines.length - 1].kind).toBe('added');
  });

  it('drops the binary marker line rather than showing it as content', () => {
    expect(parseUnifiedDiff('Binary files a/logo.png and b/logo.png differ')).toEqual([]);
  });
});
