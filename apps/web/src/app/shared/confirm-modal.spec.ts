import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ConfirmModal, type ConfirmPreviewItem } from "./confirm-modal";
import { COPY } from "./copy";

describe("ConfirmModal", () => {
  let invoker: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmModal],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    // The control that "opened" the dialog: it must be inerted while the
    // dialog is up and focused again when it goes away.
    invoker = document.createElement("button");
    invoker.textContent = "open";
    document.body.appendChild(invoker);
    invoker.focus();
  });

  afterEach(() => {
    invoker.remove();
  });

  function render(inputs: {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    previewItems?: readonly ConfirmPreviewItem[];
    danger?: boolean;
    refusalReason?: string | null;
  }) {
    const fixture = TestBed.createComponent(ConfirmModal);
    fixture.componentRef.setInput("title", inputs.title);
    if (inputs.body !== undefined) fixture.componentRef.setInput("body", inputs.body);
    if (inputs.confirmLabel !== undefined) fixture.componentRef.setInput("confirmLabel", inputs.confirmLabel);
    if (inputs.cancelLabel !== undefined) fixture.componentRef.setInput("cancelLabel", inputs.cancelLabel);
    if (inputs.previewItems !== undefined) fixture.componentRef.setInput("previewItems", inputs.previewItems);
    if (inputs.danger !== undefined) fixture.componentRef.setInput("danger", inputs.danger);
    if (inputs.refusalReason !== undefined) {
      fixture.componentRef.setInput("refusalReason", inputs.refusalReason);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("renders the prompt, the honest body, and the care verb", () => {
    const { el } = render({
      title: COPY.confirm.closePane,
      body: COPY.confirm.closePaneBody,
      confirmLabel: COPY.confirm.closePaneAction,
    });
    expect(el.querySelector(".modal-title")?.textContent).toContain(COPY.confirm.closePane);
    expect(el.querySelector(".modal-body")?.textContent).toContain("cannot be undone");
    const buttons = Array.from(el.querySelectorAll(".modal-actions .btn"));
    expect(buttons[buttons.length - 1].textContent).toContain(COPY.confirm.closePaneAction);
  });

  it("renders no preview list for a single-entity close", () => {
    const { el } = render({ title: COPY.confirm.closePane, body: COPY.confirm.closePaneBody });
    expect(el.querySelector(".preview-list")).toBeNull();
  });

  it("renders one preview row per entity for a cascading close", () => {
    const { el } = render({
      title: COPY.confirm.closeWorkspace,
      body: COPY.confirm.closeWorkspaceBody,
      previewItems: [
        { kind: "tab", name: "build", detail: "2 cards" },
        { kind: "tab", name: "deploy", detail: "1 card" },
      ],
    });
    expect(el.querySelector(".preview-heading")?.textContent).toContain(COPY.confirm.previewHeading);
    const rows = el.querySelectorAll(".preview-row");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("build");
    expect(rows[1].textContent).toContain("1 card");
  });

  it("defaults the secondary action to the copy vocabulary", () => {
    const { el } = render({ title: COPY.confirm.closePane });
    expect(el.querySelector(".modal-actions .btn")?.textContent).toContain(COPY.confirm.cancel);
  });

  it("applies the danger class to the confirm button only when danger is true", () => {
    expect(render({ title: COPY.confirm.closeTab, danger: true }).el.querySelector(".btn.danger")).toBeTruthy();
    expect(render({ title: COPY.confirm.closeTab, danger: false }).el.querySelector(".btn.danger")).toBeFalsy();
  });

  it("emits confirmed when the confirm button is clicked", () => {
    const { fixture, el } = render({ title: COPY.confirm.closePane });
    const confirmed = jasmine.createSpy("confirmed");
    fixture.componentInstance.confirmed.subscribe(confirmed);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(".modal-actions .btn"));
    buttons[buttons.length - 1].click();

    expect(confirmed).toHaveBeenCalled();
  });

  it("emits cancelled when the cancel button is clicked", () => {
    const { fixture, el } = render({ title: COPY.confirm.closePane });
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLButtonElement>(".modal-actions .btn")?.click();

    expect(cancelled).toHaveBeenCalled();
  });

  it("emits cancelled when the backdrop is clicked", () => {
    const { fixture, el } = render({ title: COPY.confirm.closePane });
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLElement>(".modal-backdrop")?.click();

    expect(cancelled).toHaveBeenCalled();
  });

  it("emits cancelled on Escape pressed inside the dialog, not globally", () => {
    const { fixture, el } = render({ title: COPY.confirm.closePane });
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLElement>(".modal")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(cancelled).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("renders a refusal notice with a single dismiss action", () => {
    const { fixture, el } = render({
      title: COPY.confirm.refusalHeading,
      refusalReason: "closing this would leave you with zero open workspaces.",
    });
    const confirmed = jasmine.createSpy("confirmed");
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    expect(el.querySelector(".refusal")?.textContent).toContain("zero open workspaces");
    const buttons = el.querySelectorAll<HTMLButtonElement>(".modal-actions .btn");
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain(COPY.confirm.cancel);

    buttons[0].click();
    expect(cancelled).toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
  });

  describe("focus containment", () => {
    it("focuses the non-destructive action first", () => {
      const { el } = render({ title: COPY.confirm.closePane, confirmLabel: COPY.confirm.closePaneAction });
      expect(document.activeElement).toBe(el.querySelector(".modal-actions .btn"));
    });

    it("marks the background inert while open and clears it on close", () => {
      const { fixture } = render({ title: COPY.confirm.closePane });
      expect(invoker.hasAttribute("inert")).toBeTrue();

      fixture.destroy();
      expect(invoker.hasAttribute("inert")).toBeFalse();
    });

    it("returns focus to the invoking control on close", () => {
      const { fixture } = render({ title: COPY.confirm.closePane });
      expect(document.activeElement).not.toBe(invoker);

      fixture.destroy();
      expect(document.activeElement).toBe(invoker);
    });

    it("wraps Tab from the last control back to the first", () => {
      const { el } = render({ title: COPY.confirm.closePane });
      const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(".modal-actions .btn"));
      const last = buttons[buttons.length - 1];
      last.focus();

      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

      expect(document.activeElement).toBe(buttons[0]);
    });

    it("wraps Shift+Tab from the first control back to the last", () => {
      const { el } = render({ title: COPY.confirm.closePane });
      const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(".modal-actions .btn"));
      buttons[0].focus();

      buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));

      expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    });
  });
});
