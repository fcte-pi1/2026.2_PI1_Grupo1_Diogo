/** Falha ao entregar o arquivo ao navegador (HU-FE-15 CA4). */
export class ErroExportacao extends Error {
  constructor() {
    super('Falha ao iniciar o download da exportação');
    this.name = 'ErroExportacao';
  }
}

/** Inicia o download de `conteudo` como arquivo `nome`, sem sair da página. */
export function baixarArquivo(nome: string, conteudo: string, tipoConteudo: string): void {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(new Blob([conteudo], { type: tipoConteudo }));
    const ancora = document.createElement('a');
    ancora.href = url;
    ancora.download = nome;
    ancora.style.display = 'none';
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();
  } catch {
    throw new ErroExportacao();
  } finally {
    if (url !== null) {
      const liberar = url;
      setTimeout(() => URL.revokeObjectURL(liberar), 10_000);
    }
  }
}
