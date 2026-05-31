import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppBootstrap } from './app/providers/AppBootstrap.js';
import { ErrorBoundary } from './app/providers/ErrorBoundary.js';
import { router } from './app/router.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppBootstrap>
        <RouterProvider router={router} />
      </AppBootstrap>
    </ErrorBoundary>
  </React.StrictMode>
);
