import { Routes } from '@angular/router';

import { signedIn } from './core/auth/auth.guard';

// Every page is a lazy chunk; the private ones are behind canMatch, so they are not even downloaded signed out.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'contratos' },
  {
    path: 'contratos',
    title: 'Contratos · SECOP alertas',
    loadComponent: () => import('./features/contracts/contracts.page').then((m) => m.ContractsPage),
  },
  {
    path: 'contratos/:id',
    title: 'Contrato · SECOP alertas',
    loadComponent: () => import('./features/contracts/contract.page').then((m) => m.ContractPage),
  },
  {
    path: 'lecturas/fraccionamiento',
    title: 'Posible fraccionamiento · SECOP alertas',
    loadComponent: () => import('./features/analytics/splitting.page').then((m) => m.SplittingPage),
  },
  {
    path: 'lecturas/atipicos',
    title: 'Valores atípicos · SECOP alertas',
    loadComponent: () => import('./features/analytics/outliers.page').then((m) => m.OutliersPage),
  },
  {
    path: 'ingresar',
    title: 'Ingresar · SECOP alertas',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    title: 'Crear cuenta · SECOP alertas',
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'alertas',
    canMatch: [signedIn],
    loadChildren: () => import('./features/subscriptions/subscriptions.routes').then((m) => m.SUBSCRIPTION_ROUTES),
  },
  {
    path: '**',
    title: 'No encontrado · SECOP alertas',
    loadComponent: () => import('./shared/not-found.page').then((m) => m.NotFoundPage),
  },
];
