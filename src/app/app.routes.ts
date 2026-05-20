import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./board/board').then((m) => m.Board),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'agents',
    loadComponent: () => import('./agents/agents').then((m) => m.Agents),
  },
];
