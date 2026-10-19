import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { IndicadorConexao } from '../componentes';
import estilos from './Layout.module.css';

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      className={estilos.icone}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Layout() {
  return (
    <>
      <header className={estilos.cabecalho}>
        <div className={estilos.marca}>
          <span className={estilos.marcaIcone} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          <h1 className={estilos.titulo}>Micromouse Dashboard</h1>
        </div>
        <span className={estilos.separador} aria-hidden="true" />
        <IndicadorConexao />
        <span className={estilos.separador} aria-hidden="true" />
        <nav className={estilos.abas} aria-label="Seções do painel">
          <NavLink to="/" end>
            <Icone>
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            </Icone>
            Ao vivo
          </NavLink>
          <NavLink to="/historico">
            <Icone>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </Icone>
            Histórico
          </NavLink>
        </nav>
      </header>
      <main className={estilos.conteudo}>
        <Outlet />
      </main>
    </>
  );
}
