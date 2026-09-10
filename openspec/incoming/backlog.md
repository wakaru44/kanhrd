# OpenSpec Incoming Backlog

## Mobile terminal scroll and gesture ownership

**Problem**

In Chrome on iPhone, terminal history cannot be navigated naturally by touch. The user currently must use the scrollbar or other touch UI controls, and a vertical boundary gesture can be interpreted by the browser as pull-to-refresh instead of remaining with the terminal.

**Reproduction/current evidence**

Reproduces every time in Chrome on iPhone: open the board, tap a pane card title, open the full-screen pane detail terminal, ensure enough output exists to scroll, then swipe vertically on the terminal output. Current observations are that the app shell uses a fixed viewport height with a scrollable main area, the mobile pane-detail and terminal wrappers suppress overflow, and xterm has scrollback enabled without app-level touch or vertical overscroll handling. These observations suggest where to investigate but do not yet establish the root cause. Safari and installed/PWA modes remain unverified.

**Expected behavior**

While the user interacts with terminal scrollback, the terminal owns vertical gestures and page pull-to-refresh does not steal them, including at the scroll boundary. Treat this as a mobile-web layout and interaction-design problem rather than merely adding a scrollbar.

**Investigation/fix notes**

Trace gesture ownership across the app shell, full-screen pane detail, terminal wrappers, and xterm viewport. Evaluate touch scrolling and overscroll containment together, preserving terminal input and surrounding board behavior. Do not assume any one observed layout rule is the complete cause.

**Verification/acceptance criteria**

- On Chrome on iPhone, repeated upward and downward swipes naturally navigate terminal history when sufficient scrollback exists.
- At both scroll boundaries, continued vertical gestures do not trigger page pull-to-refresh while interacting with the terminal.
- Terminal input and non-terminal board scrolling continue to work as intended.
- Safari and installed/PWA behavior are explicitly tested and documented during the investigation.

---

## Terminal font-size control

**Problem**

Terminal font size is hard-coded at `13px`. Settings exposes terminal color themes but provides no font-size preference or control.

**Reproduction/current evidence**

Open Settings and inspect the terminal options: color-theme selection is available, but font-size adjustment is not. Open a terminal and observe that it uses the fixed `13px` size.

**Expected behavior**

Users can adjust terminal font size through a sensible preference that persists across sessions, applies to terminals, and causes terminal layout to refit correctly.

**Investigation/fix notes**

Determine the appropriate settings UI, allowed values or range, default and migration behavior, and how open and newly created terminals receive the preference. Confirm that resizing text refits terminal geometry without breaking output, input, or responsive layouts; leave the exact UI and range open unless an existing repository specification defines them.

**Verification/acceptance criteria**

- A user can change terminal font size through the product UI and see the new size applied to open and newly opened terminals.
- The selected size survives reload and a new session.
- Terminal rows and columns are refitted after the size changes, with no clipping, overlap, or loss of input usability.
- The control remains usable across supported desktop and mobile viewport sizes, and terminal color-theme behavior remains unchanged.
