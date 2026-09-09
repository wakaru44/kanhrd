import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ConfirmModal } from "./confirm-modal";

describe("ConfirmModal", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmModal],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(inputs: {
    title: string;
    body?: string;
    confirmLabel?: string;
    danger?: boolean;
    refusalReason?: string | null;
  }) {
    const fixture = TestBed.createComponent(ConfirmModal);
    fixture.componentRef.setInput("title", inputs.title);
    if (inputs.body !== undefined) fixture.componentRef.setInput("body", inputs.body);
    if (inputs.confirmLabel !== undefined) fixture.componentRef.setInput("confirmLabel", inputs.confirmLabel);
    if (inputs.danger !== undefined) fixture.componentRef.setInput("danger", inputs.danger);
    if (inputs.refusalReason !== undefined) {
      fixture.componentRef.setInput("refusalReason", inputs.refusalReason);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("renders the title, body, and confirm label", () => {
    const { el } = render({ title: "Close pane?", body: "This cannot be undone.", confirmLabel: "Close pane" });
    expect(el.querySelector(".modal-title")?.textContent).toContain("Close pane?");
    expect(el.querySelector(".modal-body")?.textContent).toContain("This cannot be undone.");
    expect(el.querySelector(".btn.danger, .modal-actions .btn:last-child")?.textContent).toContain(
      "Close pane",
    );
  });

  it("applies the danger class to the confirm button when danger is true", () => {
    const { el } = render({ title: "Close tab?", danger: true });
    expect(el.querySelector(".btn.danger")).toBeTruthy();
  });

  it("does not apply the danger class when danger is false", () => {
    const { el } = render({ title: "Rename tab?", danger: false });
    expect(el.querySelector(".btn.danger")).toBeFalsy();
  });

  it("emits confirmed when the confirm button is clicked", () => {
    const { fixture, el } = render({ title: "Close pane?", confirmLabel: "Close pane" });
    const confirmed = jasmine.createSpy("confirmed");
    fixture.componentInstance.confirmed.subscribe(confirmed);

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(".modal-actions .btn"));
    buttons[buttons.length - 1].click();

    expect(confirmed).toHaveBeenCalled();
  });

  it("emits cancelled when the cancel button is clicked", () => {
    const { fixture, el } = render({ title: "Close pane?" });
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLButtonElement>(".modal-actions .btn")?.click();

    expect(cancelled).toHaveBeenCalled();
  });

  it("emits cancelled when the backdrop is clicked", () => {
    const { fixture, el } = render({ title: "Close pane?" });
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLElement>(".modal-backdrop")?.click();

    expect(cancelled).toHaveBeenCalled();
  });

  it("renders a refusal notice with no confirm button when refusalReason is set", () => {
    const { el } = render({
      title: "Can't close the last workspace",
      refusalReason: "Closing this would leave you with zero open workspaces.",
    });

    expect(el.querySelector(".refusal")?.textContent).toContain("zero open workspaces");
    const buttons = el.querySelectorAll(".modal-actions .btn");
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain("Close");
  });

  it("clicking the sole dismiss button in refusal mode emits cancelled, not confirmed", () => {
    const { fixture, el } = render({
      title: "Can't close the last workspace",
      refusalReason: "Closing this would leave you with zero open workspaces.",
    });
    const confirmed = jasmine.createSpy("confirmed");
    const cancelled = jasmine.createSpy("cancelled");
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    el.querySelector<HTMLButtonElement>(".modal-actions .btn")?.click();

    expect(cancelled).toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
  });
});
