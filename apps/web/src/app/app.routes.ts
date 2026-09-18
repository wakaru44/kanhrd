import { Routes } from '@angular/router';
import { Board } from './board/board';
import { PaneDetail } from './pane-detail/pane-detail';
import { Settings } from './settings/settings';
import { NotFound } from './not-found/not-found';

export const routes: Routes = [
  { path: '', component: Board },
  { path: 'workspace/:workspaceId', component: Board },
  { path: 'workspace/:workspaceId/tab/:tabId', component: Board },
  { path: 'pane/:host/:id', component: PaneDetail },
  { path: 'settings', component: Settings },
  // Labs: unlisted, reachable by URL only, one exact path per lab and no
  // `labs` index — the bare prefix falls through to `**`. Always
  // `loadComponent`, so nothing a lab imports lands in the initial bundle,
  // and this lazy import is the ONE edge from product code into `labs/`
  // (openspec add-labs-surface; enforced by labs/labs-boundary.spec.ts).
  {
    path: 'labs/file-explorer/mock1',
    loadComponent: () =>
      import('./labs/file-explorer/mock1/mock1').then((m) => m.FileExplorerMock1),
  },
  // Last, and last only: `**` matches anything the routes above did not, so
  // a stale bookmark lands on a page that says so and offers a way back
  // rather than on a blank outlet.
  { path: '**', component: NotFound },
];
