import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell.js';
import { AdDetailsPage } from '../pages/AdDetailsPage.js';
import { CatalogFeedPage } from '../pages/CatalogFeedPage.js';
import { CreateChooserPage } from '../pages/CreateChooserPage.js';
import { CreateEquipmentPage } from '../pages/CreateEquipmentPage.js';
import { CreateProductPage } from '../pages/CreateProductPage.js';
import { CreateResumePage } from '../pages/CreateResumePage.js';
import { CreateVacancyPage } from '../pages/CreateVacancyPage.js';
import { FavoritesPage } from '../pages/FavoritesPage.js';
import { HomePage } from '../pages/HomePage.js';
import { MyAdsPage } from '../pages/MyAdsPage.js';
import { ModerationPage } from '../pages/ModerationPage.js';
import { NotFoundPage } from '../pages/NotFoundPage.js';
import { ProfilePage } from '../pages/ProfilePage.js';
import { ResumesPage } from '../pages/ResumesPage.js';
import { ReviewsPage } from '../pages/ReviewsPage.js';
import { VacanciesPage } from '../pages/VacanciesPage.js';
import { VacancyDetailsPage } from '../pages/VacancyDetailsPage.js';
import { appEnv } from '../shared/config/app-env.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'vacancies',
        element: <VacanciesPage />
      },
      {
        path: 'vacancies/:adId',
        element: <VacancyDetailsPage />
      },
      {
        path: 'resumes',
        element: <ResumesPage />
      },
      {
        path: 'resumes/:adId',
        element: <AdDetailsPage />
      },
      {
        path: 'equipment',
        element: <CatalogFeedPage feed="equipment" />
      },
      {
        path: 'equipment/:adId',
        element: <AdDetailsPage />
      },
      {
        path: 'materials',
        element: <CatalogFeedPage feed="materials" />
      },
      {
        path: 'materials/:adId',
        element: <AdDetailsPage />
      },
      {
        path: 'tools',
        element: <CatalogFeedPage feed="tools" />
      },
      {
        path: 'tools/:adId',
        element: <AdDetailsPage />
      },
      {
        path: 'ads/:adId',
        element: <AdDetailsPage />
      },
      {
        path: 'create',
        element: <CreateChooserPage />
      },
      {
        path: 'create/vacancy',
        element: <CreateVacancyPage />
      },
      {
        path: 'create/resume',
        element: <CreateResumePage />
      },
      {
        path: 'create/equipment',
        element: <CreateEquipmentPage />
      },
      {
        path: 'create/material',
        element: <CreateProductPage type="material" />
      },
      {
        path: 'create/tool',
        element: <CreateProductPage type="tool" />
      },
      {
        path: 'favorites',
        element: <FavoritesPage />
      },
      {
        path: 'profile',
        element: <ProfilePage />
      },
      {
        path: 'my-ads',
        element: <MyAdsPage />
      },
      {
        path: 'reviews',
        element: <ReviewsPage />
      },
      {
        path: 'moderation',
        element: <ModerationPage />
      }
    ]
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
], {
  basename: appEnv.routerBasename
});
