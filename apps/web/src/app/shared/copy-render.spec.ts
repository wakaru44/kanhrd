import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { AgentStatus, BridgeCapabilities, Pane } from "@kanhrd/schema";
import { COPY, fill } from "./copy";
import { ConfirmModal } from "./confirm-modal";
import { ToastHost } from "./toast-host";
import { ToastService } from "../state/toast.service";
import { Card } from "../board/card";
import { PanesStore } from "../state/panes.store";

/**
 * Section 14.1: the two copy guarantees that only hold once a string has
 * been through a TEMPLATE. `copy.spec.ts` proves `fill()` substitutes
 * correctly; this proves the rendered DOM does not then re-case, re-word or
 * swallow what was substituted, and that a status is legible without
 * colour.
 *
 * Both are regressions a purely string-level test cannot catch: a
 * `titlecase` pipe, a `text-transform` in SCSS, or a status word hidden
 * behind `aria-label` only would all keep `copy.spec.ts` green.
 */

/** A name and a wire error chosen to break naive normalisation: mixed case, herdr's own vocabulary, punctuation, non-ASCII. */
const USER_NAME = "Ada-Lovelace_2";
const WIRE_ERROR = 'Workspace "Main" has no such tab (host=laptop, pane 3 is BUSY)';

describe("rendered copy: user names and wire errors survive the template", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastHost, ConfirmModal],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function renderToast(message: string): HTMLElement {
    const toasts = TestBed.inject(ToastService);
    toasts.push({ level: "error", message, persistent: true });
    const fixture = TestBed.createComponent(ToastHost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("renders a close failure with the user's name and herdr's reason byte-for-byte", () => {
    const message = fill(COPY.toast.closeFailed, { name: USER_NAME, reason: WIRE_ERROR });
    const rendered = renderToast(message).querySelector(".toast-message")?.textContent ?? "";

    expect(rendered).toBe(message);
    expect(rendered).toContain(USER_NAME);
    expect(rendered).toContain(WIRE_ERROR);
  });

  it("keeps the original case of both the name and the quoted wire text", () => {
    const message = fill(COPY.toast.closeFailed, { name: USER_NAME, reason: WIRE_ERROR });
    const el = renderToast(message).querySelector(".toast-message") as HTMLElement;

    // A `text-transform` would leave textContent intact but change what the
    // user reads, so assert the rendered box too.
    expect(getComputedStyle(el).textTransform).toBe("none");
    expect(el.textContent).toContain("Ada-Lovelace_2");
    expect(el.textContent).toContain('Workspace "Main"');
    expect(el.textContent).toContain("BUSY");
  });

  it("keeps herdr's wire vocabulary inside the quote while the framing copy is renamed", () => {
    const message = fill(COPY.toast.renameFailed, { reason: WIRE_ERROR });
    const rendered = renderToast(message).querySelector(".toast-message")?.textContent ?? "";

    const [framing, quoted] = rendered.split("herdr said: ");
    expect(quoted).toBe(WIRE_ERROR);
    expect(quoted).toContain("Workspace");
    expect(quoted).toContain("tab");
    expect(quoted).toContain("host=laptop");
    // …while nothing kanhrd wrote itself says host / workspace / tab.
    expect(framing).not.toMatch(/\bhost\b|\bworkspace\b|\btab\b/);
  });

  it("renders a lifecycle preview list with each entity's name verbatim", () => {
    const fixture = TestBed.createComponent(ConfirmModal);
    fixture.componentRef.setInput("title", COPY.confirm.closeField);
    fixture.componentRef.setInput("body", COPY.confirm.closeFieldBody);
    fixture.componentRef.setInput("previewItems", [
      { kind: "lane", name: USER_NAME, detail: "2 cards" },
      { kind: "lane", name: "MiXeD Case / path", detail: "1 card" },
    ]);
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(".preview-name");

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toBe(USER_NAME);
    expect(rows[1].textContent).toBe("MiXeD Case / path");
  });

  it("states the consequence in the rendered body, not only in the source string", () => {
    const fixture = TestBed.createComponent(ConfirmModal);
    fixture.componentRef.setInput("title", COPY.confirm.closePane);
    fixture.componentRef.setInput("body", COPY.confirm.closePaneBody);
    fixture.detectChanges();
    const body = (fixture.nativeElement as HTMLElement).querySelector(".modal-body")?.textContent ?? "";

    expect(body).toBe(COPY.confirm.closePaneBody);
    expect(body).toContain("cannot be undone");
    expect(body).not.toMatch(/pause|suspend|restore|resume/);
  });
});

class FakePanesStore {
  readonly closePane = jasmine.createSpy("closePane");
  readonly splitPane = jasmine.createSpy("splitPane");
}

const STATUSES: readonly AgentStatus[] = ["working", "blocked", "done", "idle", "unknown"];

describe("rendered status: identification never depends on colour", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Card],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PanesStore, useValue: new FakePanesStore() },
      ],
    }).compileComponents();
  });

  function capabilities(): ReadonlyMap<string, BridgeCapabilities> {
    return new Map([
      [
        "laptop",
        {
          tier: 2,
          terminal: true,
          paneResize: false,
          paneGraphics: false,
          outputPollIntervalMs: 150,
          paneCreate: true,
          paneClose: true,
          paneMove: false,
          paneRename: false,
          tabCrud: false,
          workspaceCrud: false,
        },
      ],
    ]);
  }

  function renderCard(status: AgentStatus, compact: boolean): HTMLElement {
    const pane: Pane = {
      id: "pane-12345678",
      host: "laptop",
      workspace: { id: "w1", name: "kanhrd" },
      tab: { id: "t1", name: "main" },
      agent_status: status,
    };
    const fixture = TestBed.createComponent(Card);
    fixture.componentRef.setInput("pane", pane);
    fixture.componentRef.setInput("capabilities", capabilities());
    fixture.componentRef.setInput("compact", compact);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows a visible status word for every status, in both densities", () => {
    for (const compact of [false, true]) {
      for (const status of STATUSES) {
        const label = renderCard(status, compact).querySelector(".status-label") as HTMLElement;
        const context = `${status} / ${compact ? "compact" : "standard"}`;

        expect(label).withContext(context).toBeTruthy();
        expect(label.textContent?.trim()).withContext(context).toBe(COPY.status[status]);

        const style = getComputedStyle(label);
        expect(style.display).withContext(context).not.toBe("none");
        expect(style.visibility).withContext(context).not.toBe("hidden");
        expect(Number.parseFloat(style.fontSize)).withContext(context).toBeGreaterThan(0);
        // A screen-reader-only treatment (clipped to nothing) would fail here.
        expect(style.clip).withContext(context).not.toMatch(/rect\(0/);
      }
    }
  });

  it("never carries the status name in an aria attribute alone", () => {
    for (const status of STATUSES) {
      const el = renderCard(status, false);
      const dot = el.querySelector(".status-dot") as HTMLElement;

      // The dot is decoration: the word beside it is what identifies the status.
      expect(dot.getAttribute("aria-hidden")).withContext(status).toBe("true");
      expect(el.textContent).withContext(status).toContain(COPY.status[status]);
    }
  });

  it("gives each status its own token-mapped fill, never a shared or hard-coded colour", () => {
    const fills = new Set<string>();
    for (const status of STATUSES) {
      const dot = renderCard(status, false).querySelector(`.status-dot.${status}`) as HTMLElement;
      expect(dot).withContext(status).toBeTruthy();
      fills.add(getComputedStyle(dot).backgroundColor);
    }
    expect(fills.size).withContext("five statuses, five distinct fills").toBe(STATUSES.length);
  });
});
