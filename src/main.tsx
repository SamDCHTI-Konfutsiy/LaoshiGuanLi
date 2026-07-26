import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import '@/i18n';
import { App } from '@/App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element (#root) not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
