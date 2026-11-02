import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getBrowserStorage } from './storage/localStorageRepo';
import { initializeStore } from './store/budgetStore';
import './styles.css';

initializeStore(getBrowserStorage());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
