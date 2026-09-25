# Diagramas do Backend — fontes editáveis e imagens exportadas

Cada diagrama é versionado com o **arquivo-fonte editável** e a **imagem exportada (SVG)**, conforme o *Guia da Equipe de Software* (§5.1 e §7). Os documentos Markdown exibem o SVG. Para alterar um diagrama, edite a fonte e regenere a imagem.

| Fonte | Ferramenta | Usado em |
|:--|:--|:--|
| `atividades-A-recepcao-persistencia.puml` | PlantUML | [2_diagrama_de_atividades.md](../2_diagrama_de_atividades.md) |
| `atividades-B-monitoramento-sinal.puml` | PlantUML | [2_diagrama_de_atividades.md](../2_diagrama_de_atividades.md) |
| `arq-01-modulos.puml` | PlantUML | [3_arquitetura.md](../3_arquitetura.md) — visão lógica |
| `arq-02-modelo-dominio.mmd` … `arq-09-implantacao.mmd` | Mermaid | [3_arquitetura.md](../3_arquitetura.md) |
| `arq-10-der.mmd` | Mermaid | [3_arquitetura.md](../3_arquitetura.md) — DER |

## Como regenerar

**PlantUML** (requer Java 11+):

```bash
# baixar uma vez: https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/1.2025.4/plantuml-1.2025.4.jar
java -jar plantuml.jar -charset UTF-8 -tsvg *.puml
```

**Mermaid** (requer Node.js):

```bash
npx -p @mermaid-js/mermaid-cli mmdc -c mermaid-config.json -b white -i arq-10-der.mmd -o arq-10-der.svg
```

Use sempre o [`mermaid-config.json`](mermaid-config.json) deste diretório (`htmlLabels: false`), para que os rótulos apareçam também quando o SVG é exibido como imagem no GitHub.
