import { formatKeyBarSample, readKeyBarProbe } from './key-bar-probe';
import { markHelperTextarea } from './pane-terminal';

describe('key bar device probes (temporary, task 6.4)', () => {
  it('is off unless the URL asks, and leaves autocomplete absent by default', () => {
    // `off` was tested on an iPhone and did not remove the AutoFill pill.
    expect(readKeyBarProbe('')).toEqual({ debug: false, autocomplete: null });
    expect(readKeyBarProbe('?keybar-debug=1')).toEqual({ debug: true, autocomplete: null });
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
      },
      336
    );
    expect(text).toContain('vv.bottom 508');
    expect(text).toContain('occluded 336  max 336');
    expect(text).toContain('bar.top 420  bar.bottom 508  row.top 448');
    expect(text).toContain('autocomplete off');
  });
});
