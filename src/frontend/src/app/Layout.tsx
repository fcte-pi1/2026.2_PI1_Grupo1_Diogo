import { NavLink, Outlet } from 'react-router';
import { IndicadorConexao } from '../componentes';
import estilos from './Layout.module.css';

export function Layout() {
  return (
    <>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Rato Borrachudo</h1>
        <nav className={estilos.navegacao}>
          <NavLink to="/" end>
            Ao vivo
          </NavLink>
          <NavLink to="/historico">Histórico</NavLink>
        </nav>
        <IndicadorConexao />
      </header>
      <main className={estilos.conteudo}>
        <Outlet />
      </main>
    </>
  );
}
