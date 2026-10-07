import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { iniciarMonitorSaude } from './adaptadores/http';
import { ClientePainelWS } from './adaptadores/ws';
import { roteador } from './app/rotas';
import './estilos/global.css';

// Os adaptadores vivem fora da árvore de componentes: navegar entre telas não derruba a conexão (RF-58).
new ClientePainelWS().iniciar();
iniciarMonitorSaude();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <RouterProvider router={roteador} />
  </StrictMode>,
);
