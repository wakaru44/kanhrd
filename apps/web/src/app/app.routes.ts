import { Routes } from '@angular/router';
import { Board } from './board/board';
import { PaneDetail } from './pane-detail/pane-detail';

export const routes: Routes = [
  { path: '', component: Board },
  { path: 'pane/:host/:id', component: PaneDetail },
];
