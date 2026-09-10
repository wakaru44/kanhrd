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
  // Last, and last only: `**` matches anything the routes above did not, so
  // a stale bookmark lands on a page that says so and offers a way back
  // rather than on a blank outlet.
  { path: '**', component: NotFound },
];
