/**
 * Regras de dependência da arquitetura do backend
 * (docs/software/backend/3_arquitetura.md, seção 5).
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'dominio-isolado',
      comment: 'dominio/ não importa nada de fora dele (nem pg, nem ws, nem fastify).',
      severity: 'error',
      from: { path: '^src/dominio/' },
      to: { pathNot: '^src/dominio/' },
    },
    {
      name: 'aplicacao-so-dominio',
      comment:
        'aplicacao/ depende apenas de dominio/ e de portas (interfaces) declaradas em aplicacao/.',
      severity: 'error',
      from: { path: '^src/aplicacao/' },
      to: { path: '^src/(adaptadores|infra)/' },
    },
    {
      name: 'aplicacao-sem-io',
      comment: 'aplicacao/ não usa bibliotecas de I/O diretamente.',
      severity: 'error',
      from: { path: '^src/aplicacao/' },
      to: { dependencyTypes: ['npm'], path: '(^|/)node_modules/(pg|ws|fastify|@fastify)/' },
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
