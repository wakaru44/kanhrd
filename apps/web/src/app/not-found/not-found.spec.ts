import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Location } from "@angular/common";
import { Router, provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { COPY } from "../shared/copy";
import { BoardReturnService } from "../state/board-return.service";
import { NotFound } from "./not-found";

/**
 * The `**` route. Before this existed, an unknown URL matched nothing and
 * rendered a blank outlet — `copy.emptyState.notFound` was dead code and
 * the spec's "the 404 SHALL offer a working board link" had nothing behind
 * it.
 */
describe("NotFound", () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("says where the user is, in the approved words", () => {
    expect(render().querySelector("h1")?.textContent?.trim()).toBe(COPY.emptyState.notFound);
  });

  it("is a heading and a way out, and nothing else", () => {
    const el = render();
    const action = el.querySelector("a.action");

    expect(action?.textContent?.trim()).toBe(COPY.emptyState.notFoundAction);
    // No invented body copy: `docs/BRAND.md` carries no line for this surface.
    expect(el.querySelectorAll("p").length).toBe(0);
    expect(el.querySelectorAll("a, button").length).toBe(1);
  });

  it("offers a board link that actually goes somewhere", () => {
    expect(render().querySelector("a.action")?.getAttribute("href")).toBe("/");
  });

  it("goes back to the board the user was last on, scope and all", () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    TestBed.inject(BoardReturnService).rememberBoard({
      url: "/workspace/w6/tab/w6:t2",
      scrollLeft: 0,
      scrollTops: {},
    });

    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    const action = (fixture.nativeElement as HTMLElement).querySelector("a.action");

    expect(action?.getAttribute("href")).toBe("/workspace/w6/tab/w6:t2");
  });
});

/** Stands in for a real route, so "does the wildcard swallow it?" is answerable from the DOM. */
@Component({ selector: "app-real-route", template: "<h1>a real route</h1>" })
class RealRoute {}

describe("routes: unknown URLs", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "settings", component: RealRoute },
          { path: "**", component: NotFound },
        ]),
      ],
    });
  });

  it("lands an unknown URL on the 404 rather than a blank outlet", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/nowhere/at/all");

    expect(harness.routeNativeElement?.querySelector("h1")?.textContent?.trim()).toBe(
      COPY.emptyState.notFound,
    );
  });

  it("keeps the bad URL in the address bar instead of silently rewriting it", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/nowhere/at/all");

    expect(TestBed.inject(Location).path()).toBe("/nowhere/at/all");
  });

  it("does not shadow a route that exists", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/settings");

    expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toBe("a real route");
    expect(TestBed.inject(Router).url).toBe("/settings");
  });
});
