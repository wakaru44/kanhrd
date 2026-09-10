## 0. Gate — blocked on maintainer decisions

This change is **proposal only**. Do not implement it. Tasks below are a
sketch of the shape, not a work list, and 0.1/0.2 must be answered
first.

- [ ] 0.1 Q1: group by repository (`project.repo_name`) or by checkout
      path (`project.checkout_path`)? Linked worktrees make these
      different answers for the same cards.
- [ ] 0.2 Q4: how do swimlanes and `add-parked-columns` compose? Both
      rearrange the board; neither can be designed alone.
- [ ] 0.3 Q2: hide an empty band, or keep its slot the way status
      columns keep theirs?
- [ ] 0.4 Q3: swimlanes below 900px — desktop-only, or page within the
      current band?
- [ ] 0.5 Q5: one virtual scroller per column per band, or a different
      virtualization strategy once bands multiply the scrollers?

## 1. Sketch (do not start)

- [ ] 1.1 Derive the grouping key per pane for each dimension.
- [ ] 1.2 Render bands, each holding the visible status columns.
- [ ] 1.3 Setting in `SettingsService` plus a board-level control.
- [ ] 1.4 Empty-band and no-match behaviour per Q2.
- [ ] 1.5 Mobile behaviour per Q3.
- [ ] 1.6 Virtualization per Q5.
