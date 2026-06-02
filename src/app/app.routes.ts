import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { poDevGuard } from './shared/guards/po-dev.guard';
import { seniorDevGuard } from './shared/guards/senior-dev.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'create',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login').then((m) => m.Login),
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.Profile),
    canActivate: [authGuard],
  },
  {
    path: 'create',
    loadComponent: () => import('./create/create').then((m) => m.Create),
    canActivate: [authGuard],
  },
  {
    path: 'checkpoint/:sessionId',
    loadComponent: () => import('./checkpoint/checkpoint').then((m) => m.Checkpoint),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
    canActivate: [authGuard],
  },
  {
    path: 'board',
    loadComponent: () => import('./board/board').then((m) => m.Board),
    canActivate: [poDevGuard],
  },
  {
    path: 'agents',
    loadComponent: () => import('./agents/agents').then((m) => m.Agents),
    canActivate: [seniorDevGuard],
  },
];
