# Diagramas do Frontend — fontes editáveis e imagens exportadas

Cada diagrama é versionado com o **arquivo-fonte editável** e a **imagem exportada em PNG**, conforme o *Guia da Equipe de Software* (§5.1 e §7). Os documentos Markdown exibem o PNG, que também pode ser incluído diretamente no relatório final em LaTeX. Para alterar um diagrama, edite a fonte e regenere a imagem.

| Fonte | Ferramenta | Imagem | Usado em |
|:--|:--|:--|:--|
| `2_diagrama_de_atividades_operador_frontend.drawio` | draw.io | `.png` | [2_diagrama_de_atividades.md](../2_diagrama_de_atividades.md) |
| `arq-fe-01-camadas.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — visão lógica: camadas e módulos |
| `arq-fe-02-modelo-estado.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — visão lógica: modelo de estado |
| `arq-fe-03-componentes.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — visão lógica: componentes por tela |
| `arq-fe-04-estados-conexao.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — visão lógica: estados da conexão |
| `arq-fe-05-seq-atualizacao.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — processos: atualização ao vivo |
| `arq-fe-06-seq-reconexao.mmd` | Mermaid | `.png` | [3_arquitetura.md](../3_arquitetura.md) — processos: reconexão e ressincronização |

## Como regenerar

**Mermaid** (requer Node.js). Execute dentro desta pasta:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -c mermaid-config.json -b white -s 2 -i arq-fe-01-camadas.mmd -o arq-fe-01-camadas.png
```

- `-s 2` exporta em escala 2×, para a imagem ficar nítida no GitHub, no PDF e no projetor.
- Use sempre o [`mermaid-config.json`](mermaid-config.json) deste diretório, o mesmo do backend, para manter a aparência dos diagramas igual entre as subfrentes.
- O comando exato de cada diagrama está na segunda linha do respectivo `.mmd`.

**draw.io:** abrir o `.drawio` no [diagrams.net](https://app.diagrams.net/) ou na extensão do VS Code e exportar como PNG.
