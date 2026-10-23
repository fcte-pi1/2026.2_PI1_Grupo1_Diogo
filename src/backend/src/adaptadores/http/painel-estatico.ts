import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Caminhos do backend: um 404 neles é da API, e nunca vira a página do painel. */
function doBackend(caminho: string): boolean {
  if (caminho === '/health') return true;
  // Por segmento: `/api` e `/api/...` são da API, mas `/apis` não.
  return ['/api', '/ws'].some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/**
 * Um caminho cujo último segmento tem extensão (`/assets/app-velho.js`, `/favicon.ico`) é um
 * arquivo. Se ele não existe, a resposta é 404, e não o `index.html`: depois de um novo build,
 * uma aba aberta que peça o asset com o hash antigo receberia HTML no lugar de JavaScript, e o
 * navegador mostraria um erro de tipo MIME difícil de entender.
 */
function pareceArquivo(caminho: string): boolean {
  return /\.[^./]+$/.test(caminho.split('/').pop() ?? '');
}

/**
 * Serve o painel compilado (`vite build`) na mesma origem da API, como a arquitetura do
 * frontend propõe (§6): sem CORS, e o painel deriva o endereço do WebSocket da própria página.
 * Só em produção (`PAINEL_DIR`); no desenvolvimento, o painel roda no Vite.
 *
 * As rotas do painel (`/historico/:id`, por exemplo) não são arquivos: um GET que não acha
 * arquivo nem rota devolve o `index.html`, e o roteador do React resolve a página.
 */
export async function servirPainel(app: FastifyInstance, painelDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: painelDir,
    // O cabeçalho de cache é definido abaixo; o padrão do plugin o sobrescreveria.
    cacheControl: false,
    // Os arquivos de `assets/` têm o hash do conteúdo no nome: podem ficar em cache para sempre.
    setHeaders: (res, caminho) => {
      const imutavel = caminho.split(/[\\/]/).includes('assets');
      res.setHeader('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  app.setNotFoundHandler((req, reply) => {
    const caminho = req.url.split('?')[0] ?? '';
    const rotaDoPainel = !doBackend(caminho) && !pareceArquivo(caminho);
    if ((req.method === 'GET' || req.method === 'HEAD') && rotaDoPainel) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${req.method}:${req.url} not found`,
    });
  });
}
