import { NavLink, Outlet } from 'react-router';
import { IndicadorConexao } from '../componentes';
import estilos from './Layout.module.css';

export function Layout() {
  return (
    <>
      <header className={estilos.cabecalho}>
        <div className={estilos.marca}>
          <span className={estilos.marcaIcone} aria-hidden="true">RB</span>
          <h1 className={estilos.titulo}>Micromouse Dashboard</h1>
        </div>
        <span className={estilos.separador} aria-hidden="true" />
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
