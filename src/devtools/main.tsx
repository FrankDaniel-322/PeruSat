import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DevApp } from './DevApp';
import '../index.css';

createRoot(document.getElementById('devtools-root')!).render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
);
