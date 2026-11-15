import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Role01Demo } from './Role01Demo';
import './role01-demo.css';

createRoot(document.getElementById('role01-demo-root')!).render(
  <StrictMode><Role01Demo /></StrictMode>,
);
