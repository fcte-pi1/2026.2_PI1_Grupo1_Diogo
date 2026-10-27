/**
 * Regras de dependência da arquitetura do frontend
 * (docs/software/frontend/3_arquitetura.md, seção 5.2).
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'dominio-isolado',
      comment:
        'dominio/ não importa nada de fora dele: nem React, nem Zustand, nem APIs do navegador.',
      severity: 'error',
      from: { path: '^src/dominio/' },
      to: { pathNot: '^src/dominio/' },
    },
    {
      name: 'formatacao-so-dominio',
      comment: 'formatacao/ depende apenas dos tipos de dominio/.',
      severity: 'error',
      from: { path: '^src/formatacao/' },
      to: { pathNot: '^src/(formatacao|dominio)/' },
    },
    {
      name: 'estado-sem-adaptadores-e-ui',
      comment: 'estado/ depende de dominio/ e protocolo/; acessa HTTP só por porta.',
      severity: 'error',
      from: { path: '^src/estado/' },
      to: { path: '^src/(adaptadores|componentes|paginas|view-model)/' },
    },
    {
      name: 'adaptadores-sem-ui',
      comment: 'adaptadores/ despacham ações para estado/ e nunca importam componentes.',
      severity: 'error',
      from: { path: '^src/adaptadores/' },
      to: { path: '^src/(componentes|paginas|view-model)/' },
    },
    {
      name: 'ui-sem-adaptadores',
      comment: 'componentes/ e paginas/ nunca importam adaptadores/ diretamente.',
      severity: 'error',
      from: { path: '^src/(componentes|paginas)/' },
      to: { path: '^src/adaptadores/' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
