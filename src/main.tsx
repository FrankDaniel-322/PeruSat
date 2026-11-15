import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntegrationHarness } from './dev/IntegrationHarness';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><IntegrationHarness /></StrictMode>,
);
