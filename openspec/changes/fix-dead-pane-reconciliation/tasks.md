## 1. Bridge

- [x] 1.1 Snapshot the tracked pane set before the `pane.list` poll request
- [x] 1.2 Synthesize a `pane.closed` bridge-event for every snapshotted pane absent from the response
- [x] 1.3 Untrack the pane (status baseline AND name-cache placement) as part of that
- [x] 1.4 Regression test: a pane vanishing from `pane.list` with no herdr push yields exactly one `pane.closed`
