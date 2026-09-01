import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'setup',
    title: 'Setup Wizard - Polyarr',
    loadComponent: () => import('./pages/setup/setup.component').then(m => m.SetupComponent),
  },
  {
    path: 'dashboard',
    title: 'Dashboard - Polyarr',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'media',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'media/:id',
    title: 'Media Details - Polyarr',
    loadComponent: () => import('./pages/media-detail/media-detail.component').then(m => m.MediaDetailComponent),
  },
  {
    path: 'sync-profiles',
    redirectTo: '/settings',
    pathMatch: 'full',
  },
  {
    path: 'history',
    title: 'Sync History - Polyarr',
    loadComponent: () => import('./pages/history/history.component').then(m => m.HistoryComponent),
  },
  {
    path: 'settings',
    title: 'Settings - Polyarr',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];
