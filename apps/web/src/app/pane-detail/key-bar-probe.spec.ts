import { formatKeyBarSample, readKeyBarProbe } from './key-bar-probe';
import { markHelperTextarea } from './pane-terminal';

describe('key bar device probes (temporary, task 6.4)', () => {
  it('is off unless the URL asks, and leaves autocomplete absent by default', () => {
    // `off` was tested on an iPhone and did not remove the AutoFill pill.
    expect(readKeyBarProbe('')).toEqual({ debug: false, noSettle: false, autocomplete: null });
    expect(readKeyBarProbe('?keybar-debug=1')).toEqual({
      debug: true,
      noSettle: false,
      autocomplete: null,
    });
  });

  it('can leave autocomplete absent, or set any value under test', () => {
    expect(readKeyBarProbe('?keybar-autocomplete=absent').autocomplete).toBeNull();
    expect(readKeyBarProbe('?keybar-autocomplete=off').autocomplete).toBe('off');
    expect(readKeyBarProbe('?keybar-autocomplete=one-time-code').autocomplete).toBe(
      'one-time-code'
    );
  });

  it('marks the xterm helper textarea, or leaves it alone', () => {
    const el = document.createElement('div');
    el.appendChild(document.createElement('textarea'));
    markHelperTextarea(el, null);
    expect(el.querySelector('textarea')!.hasAttribute('autocomplete')).toBeFalse();
    markHelperTextarea(el, 'off');
    expect(el.querySelector('textarea')!.getAttribute('autocomplete')).toBe('off');
  });

  it('prints every number the occlusion math uses, one per line', () => {
    const text = formatKeyBarSample(
      {
        innerHeight: 844,
        vvHeight: 508,
        vvOffsetTop: 0,
        vvScale: 1,
        occluded: 336,
        barTop: 420,
        barBottom: 508,
        rowTop: 448,
        focusedTag: 'textarea',
        focusedBottom: 300,
        autocomplete: 'off',
        transform: 'translateY(-336px)',
        markerBottom: 844,
        safeAreaBottom: 34,
        clientHeight: 844,
        outerHeight: 844,
        screenHeight: 844,
        virtualKeyboard: false,
        settle: true,
        events: ['vv.resize occ 336 vv.h 508 off 0 bar.b 508'],
        shellBottom: 900,
        paneBottom: 900,
        terminalBottom: 470,
        units: { '100vh': 900, '100dvh': 844 },
      },
      336
    );
    expect(text).toContain('vv.bottom 508');
    expect(text).toContain('occluded 336  max 336');
    expect(text).toContain('bar.top 420  bar.bottom 508  row.top 448');
    expect(text).toContain('autocomplete off');
    expect(text).toContain('transform translateY(-336px)');
    expect(text).toContain('marker.bottom 844  safe-area.bottom 34');
    expect(text).toContain('· vv.resize occ 336');
    expect(text).toContain('shell.bottom 900  pane.bottom 900  terminal.bottom 470');
    expect(text).toContain('terminal.bottom - bar.top 50');
    expect(text).toContain('100vh 900  100dvh 844');
  });

  it('reads the no-settle switch', () => {
    expect(readKeyBarProbe('?keybar-nosettle=1').noSettle).toBeTrue();
  });
});
