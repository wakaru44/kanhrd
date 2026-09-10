import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COPY } from '../shared/copy';
import { BoardReturnService } from '../state/board-return.service';

/**
 * The `**` route. Reached by a stale bookmark, a typo, or a link to a
 * resource whose URL shape no longer exists.
 *
 * An empty state is a next step, not a message (docs/UX-GUIDELINES.md,
 * "Empty states are next steps"), so this is a heading and a way out —
 * nothing else. There is no illustration, no error code and no apology:
 * `off the map.` says the whole thing, and `docs/BRAND.md`'s approved-copy
 * table carries no body line for this surface, so none is invented here.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
})
export class NotFound {
  private readonly boardReturn = inject(BoardReturnService);

  protected readonly copy = COPY;

  /**
   * The board this lands on: the one the user was last on, scope and all,
   * or `/` when they arrived here cold. Either way a working board link,
   * which is the one thing this page owes them.
   *
   * Captured once at construction, like `PaneDetail.backUrl` — the record
   * is written as the board is torn down, before this view is built.
   */
  protected readonly backUrl = this.boardReturn.boardUrl();
}
