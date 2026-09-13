/**
 * TEMPORARY device-measurement probes for the key bar's iOS rounds
 * (openspec/changes/add-terminal-key-bar, task 6.4). Everything here is off
 * unless the page URL asks for it, so no operator sees it by accident, and
 * the whole file is deleted once the rounds settle the fix.
 *
 *   ?keybar-debug=1                 on-screen readout of the viewport numbers, an
 *                                   event timeline, and a ruler above the bar
 *   ?keybar-nosettle=1              disable the re-measure after focus moves
 *   ?keybar-autocomplete=<value>    set autocomplete to <value>; absent by default,
 *                                   as xterm ships it (`off` was tested on iOS
 *                                   and did not remove the AutoFill pill)
 */

/** Reads the probe switches from a query string. Pure, so it is unit-tested. */
export function readKeyBarProbe(search: string): {
  debug: boolean;
  noSettle: boolean;
  autocomplete: string | null;
} {
  const params = new URLSearchParams(search);
  const requested = params.get('keybar-autocomplete');
  return {
    debug: params.has('keybar-debug'),
    noSettle: params.has('keybar-nosettle'),
    autocomplete: requested === null || requested === 'absent' ? null : requested,
  };
}

/** What the readout shows: the raw numbers the occlusion math uses, and what they produced. */
export interface KeyBarSample {
  innerHeight: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
  vvScale: number | null;
  occluded: number;
  barTop: number;
  barBottom: number;
  rowTop: number | null;
  focusedTag: string;
  focusedBottom: number | null;
  autocomplete: string;
  /** The transform actually on the bar when the rect was read. */
  transform: string;
  /** Bottom of an untransformed element fixed at bottom:0 — innerHeight means rects are layout-viewport relative. */
  markerBottom: number | null;
  safeAreaBottom: number | null;
  clientHeight: number;
  outerHeight: number;
  screenHeight: number;
  virtualKeyboard: boolean;
  settle: boolean;
  /** Most recent first: which listener placed the bar, and with what. */
  events: readonly string[];
  /** Round 3: where the shell, the view and the terminal box end, in the same space as bar.top. */
  shellBottom: number | null;
  paneBottom: number | null;
  terminalBottom: number | null;
  /** What 100vh / 100dvh / 100svh / 100lvh resolve to, in CSS px. */
  units: Readonly<Record<string, number>>;
}

/** One line per number, stable order, so two screenshots compare line for line. Data, not copy. */
export function formatKeyBarSample(sample: KeyBarSample, maxOccluded: number): string {
  const n = (v: number | null) => (v === null ? '-' : String(Math.round(v * 10) / 10));
  const vvBottom =
    sample.vvHeight === null || sample.vvOffsetTop === null
      ? null
      : sample.vvHeight + sample.vvOffsetTop;
  return [
    `innerHeight ${n(sample.innerHeight)}`,
    `vv.height ${n(sample.vvHeight)}  vv.offsetTop ${n(sample.vvOffsetTop)}  vv.scale ${n(sample.vvScale)}`,
    `vv.bottom ${n(vvBottom)}`,
    `occluded ${n(sample.occluded)}  max ${n(maxOccluded)}`,
    `bar.top ${n(sample.barTop)}  bar.bottom ${n(sample.barBottom)}  row.top ${n(sample.rowTop)}`,
    `focus ${sample.focusedTag}  focus.bottom ${n(sample.focusedBottom)}`,
    `shell.bottom ${n(sample.shellBottom)}  pane.bottom ${n(sample.paneBottom)}  terminal.bottom ${n(sample.terminalBottom)}`,
    `terminal.bottom - bar.top ${sample.terminalBottom === null ? '-' : n(sample.terminalBottom - sample.barTop)}`,
    Object.entries(sample.units)
      .map(([unit, px]) => `${unit} ${n(px)}`)
      .join('  '),
    `transform ${sample.transform}`,
    `marker.bottom ${n(sample.markerBottom)}  safe-area.bottom ${n(sample.safeAreaBottom)}`,
    `clientHeight ${n(sample.clientHeight)}  outerHeight ${n(sample.outerHeight)}  screen.height ${n(sample.screenHeight)}`,
    `virtualKeyboard ${sample.virtualKeyboard ? 'yes' : 'no'}  settle ${sample.settle ? 'on' : 'off'}`,
    `autocomplete ${sample.autocomplete}`,
    ...sample.events.map((e) => `· ${e}`),
    navigator.userAgent,
  ].join('\n');
}
