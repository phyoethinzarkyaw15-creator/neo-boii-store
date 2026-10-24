import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

function mountAdminApp(): void {
  let rootElement = document.getElementById('admin-root');
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'admin-root';
    document.body.appendChild(rootElement);
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AdminApp />
      </ErrorBoundary>
    </StrictMode>
  );
}

mountAdminApp();

