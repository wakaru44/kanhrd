import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  signal,
  untracked,
} from "@angular/core";
import { KeyValuePipe } from "@angular/common";
import { Router } from "@angular/router";
import type { TabSummary, WorkspaceSummary } from "@kanhrd/schema";
import { LucideMoreHorizontal } from "../shared/icons";
import { COPY, fill } from "../shared/copy";
import { isWorkspaceGroupCloseRequiredError, paneKey, PanesStore } from "../state/panes.store";
import { LayoutService } from "../state/layout.service";
import { ToastService } from "../state/toast.service";
import { ConfirmModal } from "../shared/confirm-modal";

interface WorkspaceGroup {
  workspace: WorkspaceSummary;
  tabs: TabSummary[];
}

/** Elements that can hold focus inside the drawer. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** `--breakpoint-mobile` (900px) as a media query; at or above it the rail is inline. */
const DESKTOP_QUERY = "(min-width: 900px)";

type RowKind = "workspace" | "tab";

/**
 * Rail = navigator (decision locked): per host, a workspace list, each
 * workspace listing its tabs. Row actions live in a visible overflow menu (never
 * hover-only). Clicking a workspace or tab NAVIGATES to `/workspace/:workspaceId`
 * or `/workspace/:workspaceId/tab/:tabId` — it does not write
 * `PanesStore.scopeSignal` directly; `Board`'s route-sync effect derives that
 * from the URL. Clicking the already-active workspace/tab navigates back to `/`.
 *
 * Below 900px the same component is the mobile **overlay drawer**: `.rail` is
 * `display:none` (board.scss), the header hamburger flips
 * `LayoutService.railOpen`, and `Board` renders the `.rail-backdrop`. This
 * component owns the drawer's *behaviour*: focus moves in and is trapped,
 * background content is `inert`, focus returns to the hamburger on close, and
 * Escape is scoped to this component's host — never a global binding, because
 * the terminal owns unmodified Escape.
 */
@Component({
  selector: "app-rail",
  imports: [ConfirmModal, KeyValuePipe, LucideMoreHorizontal],
  templateUrl: "./rail.html",
  styleUrl: "./rail.scss",
  host: {
    "(keydown.escape)": "onEscape($any($event))",
  },
})
export class Rail implements OnDestroy {
  protected readonly store = inject(PanesStore);
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly copy = COPY;
  protected readonly railCopy = COPY.rail;

  protected readonly hostGroups = computed(() => {
    const workspaces = this.store.workspacesSignal();
    const tabs = this.store.tabsSignal();
    const byHost = new Map<string, WorkspaceGroup[]>();
    for (const workspace of workspaces.values()) {
      const list = byHost.get(workspace.host) ?? [];
      list.push({ workspace, tabs: [] });
      byHost.set(workspace.host, list);
    }
    for (const tab of tabs.values()) {
      const group = byHost.get(tab.host)?.find((g) => g.workspace.id === tab.workspace.id);
      group?.tabs.push(tab);
    }
    return byHost;
  });

  protected readonly tabFilter = this.store.tabFilterSignal;

  protected workspaceCrudAvailable(host: string): boolean {
    return this.store.capabilitiesSignal().get(host)?.workspaceCrud === true;
  }

  protected tabCrudAvailable(host: string): boolean {
    return this.store.capabilitiesSignal().get(host)?.tabCrud === true;
  }

  // --- row overflow menu (replaces the removed hover affordances) ---------

  private readonly openMenu = signal<string | null>(null);

  protected rowKey(kind: RowKind, host: string, id: string): string {
    return `${kind}:${host}:${id}`;
  }

  protected isMenuOpen(key: string): boolean {
    return this.openMenu() === key;
  }

  protected toggleMenu(key: string, event: Event): void {
    event.stopPropagation();
    this.openMenu.update((open) => (open === key ? null : key));
  }

  protected closeMenu(): void {
    this.openMenu.set(null);
  }

  /** Escape inside an open menu closes it and returns focus to its trigger, without touching the drawer. */
  protected onMenuKeydown(event: KeyboardEvent): void {
    const menu = event.currentTarget as HTMLElement;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
      (menu.parentElement?.querySelector<HTMLElement>(".row-menu-trigger"))?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = Array.from(menu.querySelectorAll<HTMLElement>(".row-menu-item"));
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + items.length) % items.length;
    items[next]!.focus();
  }

  /** Focus leaving the menu subtree closes it — no document-level click listener. */
  protected onMenuFocusOut(event: FocusEvent): void {
    const wrap = event.currentTarget as HTMLElement;
    const next = event.relatedTarget;
    if (next instanceof Node && wrap.contains(next)) {
      return;
    }
    this.closeMenu();
  }

  // --- inline rename -------------------------------------------------

  protected readonly editing = signal<{ kind: RowKind; host: string; id: string } | null>(null);
  protected readonly editingValue = signal("");
  /** True while a rename is in flight: the field stays mounted and holds what was typed. */
  protected readonly renamePending = signal(false);
  /** Why the last attempt was refused, shown beside the field it belongs to. */
  protected readonly renameError = signal<string | null>(null);

  protected isEditing(kind: RowKind, host: string, id: string): boolean {
    const e = this.editing();
    return e !== null && e.kind === kind && e.host === host && e.id === id;
  }

  protected startRenameWorkspace(workspace: WorkspaceSummary, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.renameError.set(null);
    this.editing.set({ kind: "workspace", host: workspace.host, id: workspace.id });
    this.editingValue.set(workspace.name);
  }

  protected startRenameTab(tab: TabSummary, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.renameError.set(null);
    this.editing.set({ kind: "tab", host: tab.host, id: tab.id });
    this.editingValue.set(tab.name);
  }

  /**
   * Abandons the edit. Refuses while a rename is in flight, and while a
   * failure is on screen: the whole point of keeping the text is that the
   * user gets to look at it, and a blur onto the toast that reported the
   * failure must not be what throws it away. Escape still discards.
   */
  protected cancelRename(): void {
    if (this.renamePending() || this.renameError() !== null) {
      return;
    }
    this.editing.set(null);
  }

  /** Escape: discard unconditionally, error or not. */
  protected discardRename(): void {
    this.renamePending.set(false);
    this.renameError.set(null);
    this.editing.set(null);
  }

  /**
   * Commits the edit, and keeps it on the screen until the wire agrees.
   *
   * The previous shape closed the field first and fired the request with
   * `void`, so a rejection was unhandled: no reason, no retry, and whatever
   * had been typed was simply gone. Now the field stays mounted (disabled)
   * for the round trip; success closes it, failure leaves the typed value
   * exactly where it was and puts herdr's reason underneath it
   * (docs/UX-GUIDELINES.md, "Reliability states tell the truth").
   */
  protected async confirmRename(): Promise<void> {
    const target = this.editing();
    const value = this.editingValue().trim();
    if (!target || !value) {
      this.discardRename();
      return;
    }
    this.renameError.set(null);
    this.renamePending.set(true);
    const notice = this.toast.progress(
      `rename:${target.host}:${target.kind}:${target.id}`,
      COPY.toast.working,
    );
    try {
      if (target.kind === "workspace") {
        await this.store.renameWorkspace(target.host, target.id, value);
      } else {
        await this.store.renameTab(target.host, target.id, value);
      }
      notice.resolve();
      this.renamePending.set(false);
      this.editing.set(null);
    } catch (err) {
      const message = fill(COPY.toast.renameFailed, {
        reason: err instanceof Error ? err.message : String(err),
      });
      notice.fail(message);
      this.renamePending.set(false);
      this.renameError.set(message);
      this.focusEditInput();
    }
  }

  /** Puts the cursor back in the field that just failed, so the fix is an edit. */
  private focusEditInput(): void {
    afterNextRender(
      () => {
        const input = this.hostEl.querySelector<HTMLInputElement>(".edit-input");
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  protected onEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.confirmRename();
    } else if (event.key === "Escape") {
      // `preventDefault` doubles as the signal to `onEscape` that this Escape
      // was consumed by the rename field and must not close the drawer.
      event.preventDefault();
      event.stopPropagation();
      this.discardRename();
    }
  }

  constructor() {
    // "New tab"/"New workspace" (header `+` menu) create-then-rename rather
    // than prompting up front. Once the newly created item shows up here
    // (via its `*.created` event landing in the store), auto-open its
    // inline rename field.
    effect(() => {
      const pending = this.store.pendingRenameSignal();
      if (!pending) {
        return;
      }
      const key = paneKey(pending.host, pending.id);
      const workspace = pending.kind === "workspace" ? this.store.workspacesSignal().get(key) : undefined;
      const tab = pending.kind === "tab" ? this.store.tabsSignal().get(key) : undefined;
      if (!workspace && !tab) {
        return;
      }
      untracked(() => {
        if (workspace) {
          this.editing.set({ kind: "workspace", host: workspace.host, id: workspace.id });
          this.editingValue.set(workspace.name);
        } else if (tab) {
          this.editing.set({ kind: "tab", host: tab.host, id: tab.id });
          this.editingValue.set(tab.name);
        }
        this.store.consumePendingRename();
      });
    });

    // `KeyboardService`'s `prefix+&` ("close current tab") has no direct
    // reference to this component's `ConfirmModal` — it requests a close via
    // the store instead, mirroring the `pendingRenameSignal` handoff above.
    effect(() => {
      const pending = this.store.pendingCloseTabSignal();
      if (!pending) {
        return;
      }
      const tab = this.store.tabsSignal().get(paneKey(pending.host, pending.id));
      untracked(() => {
        if (tab) {
          this.requestCloseTab(tab);
        }
        this.store.consumePendingCloseTab();
      });
    });

    // Drawer open/close side effects: focus in + trap + inert on open,
    // release + restore on close.
    effect(() => {
      const open = this.layout.railOpen();
      untracked(() => (open ? this.onDrawerOpened() : this.onDrawerClosed()));
    });

    this.desktopQuery?.addEventListener("change", this.onDesktopChange);
  }

  // --- mobile overlay drawer --------------------------------------------

  private readonly desktopQuery: MediaQueryList | null =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(DESKTOP_QUERY)
      : null;

  /** Element focus returns to when the drawer closes (the header hamburger). */
  private restoreFocusTo: HTMLElement | null = null;
  /** Elements this component marked `inert`, so only those are cleared again. */
  private inerted: HTMLElement[] = [];
  /** Set when the close was caused by crossing up past 900px: focus the now-inline rail instead. */
  private focusInlineRailOnClose = false;

  private readonly onDesktopChange = (event: MediaQueryListEvent): void => {
    // Crossing up past 900px: the drawer state is meaningless on the inline
    // rail, so clear it rather than leaving the desktop rail in drawer mode.
    // Rotation lands here too — same width rule, no orientation branch.
    if (event.matches && this.layout.railOpen()) {
      this.focusInlineRailOnClose = true;
      this.layout.closeRail();
    }
  };

  private navEl(): HTMLElement | null {
    return this.hostEl.querySelector<HTMLElement>("nav.rail");
  }

  private onDrawerOpened(): void {
    this.restoreFocusTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.applyInert();
    afterNextRender(
      {
        read: () => {
          const first = this.navEl()?.querySelector<HTMLElement>(FOCUSABLE) ?? this.navEl();
          first?.focus();
        },
      },
      { injector: this.injector }
    );
  }

  private onDrawerClosed(): void {
    this.clearInert();
    this.closeMenu();
    const restore = this.focusInlineRailOnClose
      ? this.navEl()
      : (this.restoreFocusTo ?? document.querySelector<HTMLElement>(".hamburger"));
    this.focusInlineRailOnClose = false;
    this.restoreFocusTo = null;
    if (restore?.isConnected) {
      restore.focus();
    }
  }

  /**
   * Mark every ancestor-sibling of this component `inert`, which is the
   * whole page minus the drawer. `.rail-backdrop` is skipped deliberately:
   * it is board-owned chrome that must stay tappable to dismiss the drawer.
   */
  private applyInert(): void {
    let node: HTMLElement | null = this.hostEl;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) {
        break;
      }
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) {
          continue;
        }
        if (sibling.classList.contains("rail-backdrop")) {
          continue;
        }
        sibling.inert = true;
        this.inerted.push(sibling);
      }
      node = parent;
    }
  }

  private clearInert(): void {
    for (const el of this.inerted) {
      el.inert = false;
    }
    this.inerted = [];
  }

  /**
   * Escape scoped to this component's host — NOT a global binding. While a
   * pane's xterm has focus, unmodified Escape must reach the terminal, so
   * nothing here listens on `document`.
   */
  protected onEscape(event: KeyboardEvent): void {
    if (event.defaultPrevented || !this.layout.railOpen()) {
      return;
    }
    event.preventDefault();
    this.layout.closeRail();
  }

  /** Tab/Shift+Tab wrap inside the open drawer. */
  protected onDrawerKeydown(event: KeyboardEvent): void {
    if (event.key !== "Tab" || !this.layout.railOpen()) {
      return;
    }
    const nav = this.navEl();
    if (!nav) {
      return;
    }
    const items = Array.from(nav.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (items.length === 0) {
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !nav.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    this.desktopQuery?.removeEventListener("change", this.onDesktopChange);
    this.clearInert();
    // The drawer never persists across a route change to pane detail.
    this.layout.closeRail();
  }

  // --- navigation (rail = navigator) ------------------------------------

  protected isTabFilterActive(host: string, tabId: string): boolean {
    const filter = this.tabFilter();
    return filter !== null && filter.host === host && filter.tabId === tabId;
  }

  protected isWorkspaceScopeActive(workspaceId: string): boolean {
    const scope = this.store.scopeSignal();
    return scope !== null && scope.workspaceId === workspaceId && scope.tabId === null;
  }

  protected onTabClick(tab: TabSummary): void {
    // Close before navigating so the drawer is gone by the time the board
    // re-renders under it.
    this.layout.closeRail();
    if (this.isTabFilterActive(tab.host, tab.id)) {
      void this.router.navigate(["/"]);
    } else {
      void this.router.navigate(["/workspace", tab.workspace.id, "tab", tab.id]);
    }
  }

  protected onWorkspaceClick(workspace: WorkspaceSummary): void {
    this.layout.closeRail();
    if (this.isWorkspaceScopeActive(workspace.id)) {
      void this.router.navigate(["/"]);
    } else {
      void this.router.navigate(["/workspace", workspace.id]);
    }
  }

  // --- close: workspace ---------------------------------------------------

  protected readonly closeWorkspaceTarget = signal<WorkspaceSummary | null>(null);
  protected readonly closeWorkspaceGroupRequired = signal(false);

  protected readonly closeWorkspaceRefusalReason = computed(() => {
    const target = this.closeWorkspaceTarget();
    if (!target) {
      return null;
    }
    return this.store.workspaceCountForHost(target.host) <= 1 ? COPY.rail.lastWorkspaceRefusal : null;
  });

  /**
   * Care softens the prompt, never the fact: the honest body names the
   * sessions as ending and unrecoverable, and the workspace being closed.
   */
  protected closeWorkspaceBody(target: WorkspaceSummary): string {
    return `${COPY.confirm.closeWorkspaceBody} ${target.name}`;
  }

  protected requestCloseWorkspace(workspace: WorkspaceSummary, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.closeWorkspaceGroupRequired.set(false);
    this.closeWorkspaceTarget.set(workspace);
  }

  protected cancelCloseWorkspace(): void {
    this.closeWorkspaceTarget.set(null);
    this.closeWorkspaceGroupRequired.set(false);
  }

  protected async confirmCloseWorkspace(): Promise<void> {
    const target = this.closeWorkspaceTarget();
    if (!target) {
      return;
    }
    try {
      await this.store.closeWorkspace(target.host, target.id, this.closeWorkspaceGroupRequired());
      this.closeWorkspaceTarget.set(null);
      this.closeWorkspaceGroupRequired.set(false);
    } catch (err) {
      if (isWorkspaceGroupCloseRequiredError(err) && !this.closeWorkspaceGroupRequired()) {
        // Distinct second confirmation, per CONTRACT-TIER3.md section 6 —
        // not the same modal content as the generic destructive-op confirm.
        this.closeWorkspaceGroupRequired.set(true);
        return;
      }
      // Any other error is a client-local outcome (bridge unreachable,
      // stale id, etc.) — close the modal rather than leaving it stuck.
      this.closeWorkspaceTarget.set(null);
      this.closeWorkspaceGroupRequired.set(false);
    }
  }

  // --- close: tab ---------------------------------------------------------

  protected readonly closeTabTarget = signal<TabSummary | null>(null);

  protected readonly closeTabIsLastInWorkspace = computed(() => {
    const target = this.closeTabTarget();
    if (!target) {
      return false;
    }
    return this.store.tabCountForWorkspace(target.host, target.workspace.id) <= 1;
  });

  protected closeTabBody(target: TabSummary): string {
    const body = `${COPY.confirm.closeTabBody} ${target.name}`;
    return this.closeTabIsLastInWorkspace() ? `${body} ${COPY.confirm.lastTabNote}` : body;
  }

  protected requestCloseTab(tab: TabSummary, event?: Event): void {
    event?.stopPropagation();
    this.closeMenu();
    this.closeTabTarget.set(tab);
  }

  protected cancelCloseTab(): void {
    this.closeTabTarget.set(null);
  }

  protected confirmCloseTab(): void {
    const target = this.closeTabTarget();
    this.closeTabTarget.set(null);
    if (!target) {
      return;
    }
    void this.store.closeTab(target.host, target.id);
  }
}
