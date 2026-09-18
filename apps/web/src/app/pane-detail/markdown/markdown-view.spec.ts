import { Component, input, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { COPY } from '../../shared/copy';
import { MarkdownView } from './markdown-view';
import { provideMarkdownRenderer, rendererInputs } from './markdown-renderers';

/**
 * The rendered view, through the DOM it actually produces.
 *
 * Every file this renders was written by an agent, in a checkout nobody
 * reviewed. The tests that matter most here are the ones that prove what is
 * NOT in the DOM: no `script`, no `img`, no anchor to a scheme the allowlist
 * refused.
 */
async function render(
  source: string,
  path = 'docs/BRAND.md'
): Promise<ComponentFixture<MarkdownView>> {
  const fixture = TestBed.createComponent(MarkdownView);
  fixture.componentRef.setInput('source', source);
  fixture.componentRef.setInput('path', path);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function html(fixture: ComponentFixture<MarkdownView>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('pane-detail/markdown-view', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  describe('raw HTML is shown, never executed', () => {
    it('prints a script tag as text and creates no script element', async () => {
      const fixture = await render('before\n\n<script>alert(1)</script>\n\nafter\n');
      const root = html(fixture);
      expect(root.querySelector('script')).toBeNull();
      expect(root.textContent).toContain('<script>alert(1)</script>');
    });

    it('prints an img with an event handler as text and creates no img element', async () => {
      const fixture = await render('<img src=x onerror="alert(1)">\n');
      const root = html(fixture);
      expect(root.querySelector('img')).toBeNull();
      expect(root.textContent).toContain('onerror');
    });

    it('prints inline HTML as text', async () => {
      const fixture = await render('a <b onmouseover="x">bold</b> word\n');
      const root = html(fixture);
      expect(root.querySelector('b')).toBeNull();
      expect(root.textContent).toContain('<b onmouseover="x">');
    });

    it('renders an html fence as a code block', async () => {
      const fixture = await render('```html\n<script>alert(1)</script>\n```\n');
      const root = html(fixture);
      expect(root.querySelector('script')).toBeNull();
      expect(root.querySelector('pre code')?.textContent).toBe('<script>alert(1)</script>');
    });
  });

  describe('link destinations', () => {
    it('makes an external link an anchor that cannot reach back', async () => {
      const fixture = await render('[out](https://example.com/a)\n');
      const anchor = html(fixture).querySelector('a');
      expect(anchor?.getAttribute('href')).toBe('https://example.com/a');
      expect(anchor?.getAttribute('target')).toBe('_blank');
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders a javascript: destination as inert text, showing what it refused', async () => {
      const fixture = await render('[click](javascript:alert)\n');
      const root = html(fixture);
      expect(root.querySelector('a')).toBeNull();
      expect(root.querySelector('.inert')?.textContent).toBe('click');
      expect(root.querySelector('.readout')?.textContent).toContain('javascript:');
    });

    it('renders a data: and a vbscript: destination as inert text', async () => {
      for (const raw of ['data:text/html,<script>1</script>', 'vbscript:msgbox(1)']) {
        const fixture = await render(`[x](${raw})\n`);
        expect(html(fixture).querySelector('a')).withContext(raw).toBeNull();
      }
    });

    it('renders a scheme hidden behind whitespace as inert text', async () => {
      const fixture = await render('[x](<java\tscript:alert(1)>)\n');
      expect(html(fixture).querySelector('a')).toBeNull();
    });

    it('opens a relative link in the panel, without navigating', async () => {
      const fixture = await render('[the system](DESIGN-SYSTEM.md)\n', 'docs/BRAND.md');
      const opened: string[] = [];
      fixture.componentInstance.pathSelect.subscribe((path) => opened.push(path));

      const root = html(fixture);
      expect(root.querySelector('a')).withContext('a path is a control, not a location').toBeNull();
      const button = root.querySelector<HTMLButtonElement>('button.in-repo');
      expect(button?.textContent?.trim()).toBe('the system');
      button?.click();
      expect(opened).toEqual(['docs/DESIGN-SYSTEM.md']);
    });

    it('renders a link that climbs out of the checkout as inert text', async () => {
      const fixture = await render('[esc](../../etc/passwd)\n', 'README.md');
      const root = html(fixture);
      expect(root.querySelector('a')).toBeNull();
      expect(root.querySelector('button.in-repo')).toBeNull();
    });
  });

  describe('images', () => {
    it('never creates an img, and names a remote one as not loaded', async () => {
      const fixture = await render('![pixel](https://tracker.example/pixel.png)\n');
      const root = html(fixture);
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('.image .label')?.textContent).toBe(COPY.files.imageRemote);
      expect(root.querySelector('.image .readout')?.textContent).toBe(
        'https://tracker.example/pixel.png'
      );
      expect(root.querySelector('.image .alt')?.textContent).toBe('pixel');
    });

    it('names a checkout image as one the bridge cannot send yet', async () => {
      const fixture = await render('![mark](../public/mark/crook.svg)\n', 'docs/BRAND.md');
      const root = html(fixture);
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('.image .label')?.textContent).toBe(COPY.files.imageLocal);
      expect(root.querySelector('.image .readout')?.textContent).toBe('public/mark/crook.svg');
    });

    it('sets no background-image anywhere from a file`s URL', async () => {
      const fixture = await render('![x](https://tracker.example/p.png)\n');
      for (const element of html(fixture).querySelectorAll<HTMLElement>('*')) {
        expect(element.style.backgroundImage).toBe('');
      }
    });
  });

  describe('structure', () => {
    it('renders a table as a table with header cells and alignment', async () => {
      const fixture = await render('| a | b |\n| :- | -: |\n| 1 | 2 |\n');
      const root = html(fixture);
      expect(root.querySelectorAll('th').length).toBe(2);
      expect(root.querySelector('th')?.getAttribute('data-align')).toBe('left');
      expect(root.querySelectorAll('td')[1]?.getAttribute('data-align')).toBe('right');
    });

    it('renders a task list as disabled checkboxes in the state the file gave', async () => {
      const fixture = await render('- [ ] todo\n- [x] done\n');
      const boxes = html(fixture).querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      expect(boxes.length).toBe(2);
      expect([...boxes].map((b) => b.checked)).toEqual([false, true]);
      expect([...boxes].every((b) => b.disabled)).toBeTrue();
    });

    it('renders a blockquote, a rule and strikethrough', async () => {
      const fixture = await render('> quoted\n\n---\n\n~~gone~~\n');
      const root = html(fixture);
      expect(root.querySelector('blockquote')?.textContent).toContain('quoted');
      expect(root.querySelector('hr')).not.toBeNull();
      expect(root.querySelector('s')?.textContent?.trim()).toBe('gone');
    });

    it('keeps a file`s headings out of the application`s document outline', async () => {
      const fixture = await render('# one\n## two\n');
      const root = html(fixture);
      expect(root.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
      expect(root.querySelector('.h[data-level="1"]')?.textContent?.trim()).toBe('one');
    });

    it('says when it cut a file short, and points at source for the rest', async () => {
      const line = `${'x'.repeat(99)}\n`;
      const fixture = await render(line.repeat(2000));
      expect(html(fixture).querySelector('.note')?.textContent).toContain('the rest is in source');
    });
  });

  describe('the renderer registry', () => {
    /**
     * The claim this change makes about mermaid and SVG: a new node renderer
     * is a registration. Nothing in `markdown-view.*`, the pipeline or the
     * normalizer knows this component exists.
     */
    @Component({
      selector: 'test-fence',
      template: `<figure class="fence-stub" [attr.data-info]="info()">{{ code() }}</figure>`,
    })
    class FenceStub {
      readonly code = input<string>('');
      readonly info = input<string>('');
    }

    @Component({
      selector: 'test-block',
      template: `<figure class="block-stub"></figure>`,
    })
    class BlockStub {
      readonly block = input<unknown>(null);
    }

    it('binds a fence renderer only the inputs it declares', () => {
      expect(Object.keys(rendererInputs({ kind: 'code', lang: 'mermaid', text: 'x' }))).toEqual([
        'code',
        'info',
      ]);
      expect(Object.keys(rendererInputs({ kind: 'rule' }))).toEqual(['block']);
    });

    it('routes a registered fence kind to its component', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideMarkdownRenderer({ match: 'fence', for: 'mermaid', component: FenceStub }),
        ],
      });
      const fixture = await render('```mermaid\ngraph TD;\n```\n');
      const stub = html(fixture).querySelector('.fence-stub');
      expect(stub).withContext('the registered component did not render').not.toBeNull();
      expect(stub?.textContent).toBe('graph TD;');
      expect(stub?.getAttribute('data-info')).toBe('mermaid');
      expect(html(fixture).querySelector('pre')).withContext('still a code block').toBeNull();
    });

    it('leaves an unregistered fence as a code block', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideMarkdownRenderer({ match: 'fence', for: 'mermaid', component: FenceStub }),
        ],
      });
      const fixture = await render('```ts\nconst a = 1;\n```\n');
      expect(html(fixture).querySelector('.fence-stub')).toBeNull();
      expect(html(fixture).querySelector('pre code')?.textContent).toBe('const a = 1;');
    });

    it('routes a registered block kind to its component', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideMarkdownRenderer({ match: 'block', for: 'html', component: BlockStub }),
        ],
      });
      const fixture = await render('<svg viewBox="0 0 1 1">\n  <rect />\n</svg>\n');
      expect(html(fixture).querySelector('.block-stub')).not.toBeNull();
      expect(html(fixture).querySelector('svg')).withContext('still no element').toBeNull();
    });

    it('renders normally with no registrations at all', async () => {
      const fixture = await render('```mermaid\ngraph TD;\n```\n');
      expect(html(fixture).querySelector('pre code')?.textContent).toBe('graph TD;');
    });
  });
});
