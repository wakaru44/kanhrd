/**
 * Translates one `xterm.js` `onData` chunk into either plain text (for
 * `pane.send_text`) or a herdr key-name token list (for `pane.send_keys`).
 *
 * herdr's `pane.send_keys` takes `keys: string[]` of its own key-name
 * vocabulary (`["ctrl+c"]`, `["Enter"]`, single characters for literal
 * typing) — see CONTRACT-TIER2.md section 2 / 6. `xterm.js` instead hands
 * back raw terminal input bytes, so single well-known control sequences are
 * mapped to their key-name token here; everything else (ordinary printable
 * text, including pasted multi-character runs) is sent verbatim via
 * `pane.send_text`, which is simpler than a full key-name mapping table for
 * ordinary typing.
 */
export interface InputAction {
  kind: 'text' | 'keys';
  text?: string;
  keys?: string[];
  /** True when `kind === "text"` but the input contained bytes we couldn't map — best-effort, caller should log. */
  unmapped?: boolean;
}

const ARROW_KEY_BY_FINAL_BYTE: Record<string, string> = {
  A: 'Up',
  B: 'Down',
  C: 'Right',
  D: 'Left',
};

/** Any C0 control byte other than the ones handled explicitly above (Tab, CR, LF, Backspace, Esc, Ctrl-C/D handled first). */
// eslint-disable-next-line no-control-regex -- matching raw terminal control bytes is the point
const UNHANDLED_CONTROL_BYTES = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

export function classifyInput(data: string): InputAction {
  if (data === '\r' || data === '\n') {
    return { kind: 'keys', keys: ['Enter'] };
  }
  if (data === '\x7f') {
    return { kind: 'keys', keys: ['Backspace'] };
  }
  if (data === '\x1b') {
    return { kind: 'keys', keys: ['Escape'] };
  }
  if (data === '\x03') {
    return { kind: 'keys', keys: ['ctrl+c'] };
  }
  if (data === '\x04') {
    return { kind: 'keys', keys: ['ctrl+d'] };
  }
  if (data === '\t') {
    return { kind: 'keys', keys: ['Tab'] };
  }
  if (data.length === 3 && data[0] === '\x1b' && data[1] === '[') {
    const arrow = ARROW_KEY_BY_FINAL_BYTE[data[2]];
    if (arrow) {
      return { kind: 'keys', keys: [arrow] };
    }
  }
  if (data.length === 1) {
    const code = data.charCodeAt(0);
    if (code >= 1 && code <= 26) {
      // Ctrl-a..Ctrl-z, excluding the ones already handled above (Tab=9, Enter=13).
      const letter = String.fromCharCode(code + 96);
      return { kind: 'keys', keys: [`ctrl+${letter}`] };
    }
  }
  if (UNHANDLED_CONTROL_BYTES.test(data)) {
    return { kind: 'text', text: data, unmapped: true };
  }
  return { kind: 'text', text: data };
}
