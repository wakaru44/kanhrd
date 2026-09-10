/**
 * Deterministic host -> color mapping so the same host always gets the same
 * chip color across reloads and across every card on the board, without a
 * server-assigned color or a stored preference.
 */
const PALETTE = [
  '#e06c75',
  '#98c379',
  '#e5c07b',
  '#61afef',
  '#c678dd',
  '#56b6c2',
  '#d19a66',
  '#be5046',
] as const;

export function hostColor(host: string): string {
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = (hash * 31 + host.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
