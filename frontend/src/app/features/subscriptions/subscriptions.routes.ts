import { Routes } from '@angular/router';

export const SUBSCRIPTION_ROUTES: Routes = [
  {
    path: '',
    title: 'Mis alertas · SECOP alertas',
    loadComponent: () => import('./subscriptions.page').then((m) => m.SubscriptionsPage),
  },
  {
    path: 'nueva',
    title: 'Nueva alerta · SECOP alertas',
    loadComponent: () => import('./subscription-editor.page').then((m) => m.SubscriptionEditorPage),
  },
  {
    path: ':id',
    title: 'Alerta · SECOP alertas',
    loadComponent: () => import('./subscription.page').then((m) => m.SubscriptionPage),
  },
  {
    path: ':id/editar',
    title: 'Editar alerta · SECOP alertas',
    loadComponent: () => import('./subscription-editor.page').then((m) => m.SubscriptionEditorPage),
  },
];
