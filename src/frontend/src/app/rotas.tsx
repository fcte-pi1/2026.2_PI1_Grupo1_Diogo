import { createBrowserRouter } from 'react-router';
import { PaginaAoVivo } from '../paginas/ao-vivo/PaginaAoVivo';
import { Layout } from './Layout';

// Histórico e detalhe são carregados sob demanda (RNF-42).
export const roteador = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <PaginaAoVivo /> },
      {
        path: '/historico',
        lazy: async () => ({
          Component: (await import('../paginas/historico/PaginaHistorico')).PaginaHistorico,
        }),
      },
      {
        path: '/historico/:id',
        lazy: async () => ({
          Component: (await import('../paginas/detalhe/PaginaDetalhe')).PaginaDetalhe,
        }),
      },
    ],
  },
]);
