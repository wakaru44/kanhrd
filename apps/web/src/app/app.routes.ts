import { Routes } from '@angular/router';
import { Board } from './board/board';
import { PaneDetail } from './pane-detail/pane-detail';
import { Settings } from './settings/settings';

export const routes: Routes = [
  { path: '', component: Board },
  { path: 'pane/:host/:id', component: PaneDetail },
  { path: 'settings', component: Settings },
];
