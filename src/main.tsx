import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { browserDeps } from './app/deps';
import { createServices } from './app/services';
import { createDexieRepositories } from './data/dexie/dexieRepositories';
import { App } from './ui/App';
import { ServicesProvider } from './ui/ServicesProvider';
import { listenForInstall } from './ui/install/installState';
import './index.css';

// Composición: el único lugar donde se elige la implementación de persistencia.
const services = createServices(createDexieRepositories(), browserDeps);

// Guarda el aviso de "se puede instalar" del navegador, que puede llegar antes que React.
listenForInstall();

// Pide al navegador que no borre los datos por su cuenta (falta de espacio, poco uso).
void services.storage.request();

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ServicesProvider>
  </StrictMode>,
);
