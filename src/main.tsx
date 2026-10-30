import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StudioRouter from './StudioRouter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioRouter />
  </StrictMode>,
);
