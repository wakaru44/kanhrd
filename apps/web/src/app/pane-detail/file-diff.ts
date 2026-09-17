/**
 * `repo.diff` hands back a raw unified diff. The viewer renders it as rows
 * rather than as a blob so the `+`/`-` marker lives in a column of its own:
 * colour repeats the meaning, it never carries it alone
 * (docs/UX-GUIDELINES.md).
 */

export type DiffLineKind = 'context' | 'added' | 'removed' | 'hunk' | 'meta';

export interface DiffLine {
  readonly kind: DiffLineKind;
  /** The line without its marker column; a hunk header keeps its own text. */
  readonly text: string;
}

/**
 * git's file headers (`diff --git`, `index`, `old mode`, `--- a/x`,
 * `+++ b/x`) are dropped: the panel already shows the path, and a `---`
 * header read as a removed line would be a lie about the file's content.
 * `\ No newline at end of file` is kept as `meta`, because it is a fact
 * about the file.
 */
export function parseUnifiedDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of raw.split('\n')) {
    if (line === '' && lines.length === 0) {
      continue;
    }
    if (
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('old mode ') ||
      line.startsWith('new mode ') ||
      line.startsWith('new file mode ') ||
      line.startsWith('deleted file mode ') ||
      line.startsWith('similarity index ') ||
      line.startsWith('rename from ') ||
      line.startsWith('rename to ') ||
      line.startsWith('Binary files ')
    ) {
      continue;
    }
    if (line.startsWith('@@')) {
      lines.push({ kind: 'hunk', text: line });
    } else if (line.startsWith('\\')) {
      lines.push({ kind: 'meta', text: line.slice(1).trim() });
    } else if (line.startsWith('+')) {
      lines.push({ kind: 'added', text: line.slice(1) });
    } else if (line.startsWith('-')) {
      lines.push({ kind: 'removed', text: line.slice(1) });
    } else {
      lines.push({ kind: 'context', text: line.startsWith(' ') ? line.slice(1) : line });
    }
  }
  // A diff cut at a line boundary leaves a trailing empty context row.
  while (
    lines.length > 0 &&
    lines[lines.length - 1].kind === 'context' &&
    lines[lines.length - 1].text === ''
  ) {
    lines.pop();
  }
  return lines;
}
