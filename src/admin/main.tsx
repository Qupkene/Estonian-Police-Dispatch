// The admin panel's entry (admin/index.html, built by vite.admin.config.ts into dist/admin/).
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './admin.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { NoticeProvider } from './ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NoticeProvider>
      <App />
    </NoticeProvider>
  </StrictMode>,
);
