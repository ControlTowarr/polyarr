import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.component').then(m => m.SetupComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'media',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'media/:id',
    loadComponent: () => import('./pages/media-detail/media-detail.component').then(m => m.MediaDetailComponent),
  },
  {
    path: 'sync-profiles',
    redirectTo: '/settings',
    pathMatch: 'full',
  },
  {
    path: 'history',
    loadComponent: () => import('./pages/history/history.component').then(m => m.HistoryComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];
