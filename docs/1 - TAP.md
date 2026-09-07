# Termo de Abertura do Projeto

> **Termo de abertura do projeto / Project Charter.**
> Um documento publicado pelo iniciador ou patrocinador do projeto que autoriza formalmente a existência de um projeto e fornece ao gerente do projeto a autoridade para aplicar os recursos organizacionais nas atividades do projeto.

---

## Visão Geral do Projeto

### Dados do projeto

- **Nome do Projeto:** [nome]
- **Data de Início:** 02/09/2026
- **Data de Término:** 02/12/2026
- **Patrocinador:** Universidade de Brasília

### Objetivos

> O que a grupo pretende obter com a realização do projeto. Descrever o que se pretende realizar para resolver o problema central ou explorar a oportunidade identificada. Para a correta definição do objetivo siga a regra "SMART":
>
> - **_Specific_ (específico):** Deve ser redigido de forma clara, concisa e compreensiva;
> - **_Measurable_ (mensurável):** O objetivo específico deve ser mensurável, ou seja, possível de ser medido por meio de um ou mais indicadores;
> - **_Agreed_ (acordado):** Deve ser acordado com as partes interessadas, ou seja, as áreas envolvidas na empresa: P&D, Produção, Comercial, Marketing, Financeira, Jurídica, Manutenção, ambiental, entre outras;
> - **_Realistic_ (realista):** Deve estar centrado na realidade, no que é possível de ser feito considerando as premissas e restrições existentes, como: orçamento e tempo;
> - **_Time Bound_ (Limitado no tempo):** Deve ter um prazo determinado para sua finalização.

Este projeto tem como propósito central criar um Micromouse totalmente autônomo projetado para mapear e solucionar três configurações de labirintos, **4×4 células (72×72 cm²)**, **8×4 células (144×72 cm²)** e **12×4 células (216×72 cm²)**, sem qualquer intervenção humana, partindo de um beco sem saída em um canto e alcançando o canto diametralmente oposto. Para assegurar o cumprimento dessa meta, foram definidos os seguintes parâmetros SMART:

- **Específico:** Construir um sistema embarcado que integre detecção de obstáculos por sensores, mapeamento em tempo real da estrutura do labirinto, navegação autônoma inteligente por meio do algoritmo **Flood Fill** e transmissão contínua de dados telemétricos para um painel web;
- **Mensurável:** A validação ocorrerá ao completar os três percursos exigidos — preferencialmente na primeira tentativa, garantindo nota máxima por labirinto — e ao exibir os dados telemétricos (tipo de labirinto, trajeto percorrido, consumo de bateria, velocidade média, tempo de conclusão e status do desafio) no sistema web em tempo real;
- **Acordado:** O desenvolvimento está estritamente alinhado às normas e exigências estipuladas pelos professores da disciplina de Projeto Integrador 1 (PI1), respeitando as restrições físicas do robô, as especificações do labirinto e os marcos avaliativos do semestre;
- **Realista:** A execução aplica metodologias de engenharia simultânea e o algoritmo de busca **Flood Fill**, adequado à capacidade computacional do microcontrolador escolhido e ao tempo disponível no semestre letivo 2026/2. O desenvolvimento em fases progressivas (simulação em PC → simulação de microcontrolador → hardware real) reduz riscos e viabiliza entregas contínuas;
- **Temporal:** O protótipo funcional e sua respectiva documentação deverão ser finalizados, entregues e aprovados até 02/12/2026, respeitando rigorosamente todos os marcos do calendário acadêmico (TAP, Requisitos, EAP, Projeto Conceitual, Cronograma, Testes de Software, Testes de Integração e Apresentação Final).

---

### Algoritmo de Navegação — Flood Fill

O algoritmo adotado para a navegação autônoma do Micromouse é o **Flood Fill**.

#### Como funciona

O Flood Fill opera por propagação de distâncias a partir da célula objetivo. O processo ocorre em três etapas cíclicas durante toda a navegação:

1. **INUNDAÇÃO (Flood)** - Célula objetivo recebe distância 0. Cada célula adjacente sem parede recebe +1. Propaga como água enchendo um espaço.
2. **DECISÃO (Move)** - O robô se desloca para a célula vizinha com menor valor de distância calculado.
3. **ATUALIZAÇÃO (Update)** - Sensores detectam novas paredes. O mapa é atualizado e o flood fill é reexecutado.

#### Implementação no projeto

O Flood Fill será implementado em C++ no firmware embarcado seguindo arquitetura em camadas, com separação clara entre o algoritmo (independente de hardware) e os drivers de sensores e motores. Isso permite testar e validar o algoritmo integralmente em simulação no PC antes da integração com o hardware físico.

---

### Público-Alvo

> Pessoas, empresas, instituições etc. que podem usufruir dos produtos, serviços e resultados gerados pelo projeto, cujos requisitos (tópico abaixo) devem atender as suas necessidades. Podem ser internas ou externas à organização, mas, merecem destaque especial, pois, o projeto está sendo feito para atendê-los de forma direta ou indireta.

O público-alvo deste projeto abrange pessoas, instituições e empresas que podem usufruir dos produtos e resultados gerados, dividindo-se entre beneficiários diretos e indiretos:

#### Público-Alvo Direto

- **Instituições de Ensino e Estudantes (Robótica, Engenharias e Computação):** Usufruem do projeto como ferramenta educacional e plataforma de desenvolvimento. A solução atende à necessidade acadêmica de integrar conhecimentos multidisciplinares na prática, permitindo que os alunos desenvolvam e apliquem competências em eletrônica, eficiência energética, desenvolvimento de software e estruturas físicas.
- **Equipes de Robótica e Competidores de Micromouse:** Utilizam o sistema como produto focado em alta performance. O projeto atende diretamente à necessidade desses usuários por ferramentas de coleta, visualização e monitoramento de dados em tempo real, viabilizando depuração de falhas, análise de desempenho e melhoria contínua das estratégias de navegação autônoma.

#### Público-Alvo Indireto

- **Setor Tecnológico e Empresas de Automação:** Organizações e indústrias que atuam no desenvolvimento de robótica móvel, sistemas embarcados e Internet das Coisas (IoT). O projeto gera valor indireto ao validar conceitos de mapeamento espacial e arquiteturas de telemetria aplicáveis em automação industrial, logística e robôs autônomos de uso doméstico.

---

### Descrição do Problema

> Informar o problema ou a oportunidade (necessidade) que justifica o porquê de o projeto ser realizado. Por exemplo: atende uma demanda específica do consumidor final; supre uma necessidade do mercado comercializador; é um diferencial X para o órgão regulamentador.

O desenvolvimento do projeto [nome] é motivado pela necessidade de solucionar um problema latente na formação em engenharia: a **lacuna entre o conhecimento acadêmico isolado e os desafios multidisciplinares exigidos pelo mercado de tecnologia**. Atualmente, há uma carência de plataformas que permitam a aplicação prática e integrada de disciplinas fundamentais, como Hardware, Estruturas, Software e Eficiência Energética.

Diante desse problema, o projeto apresenta-se como uma **oportunidade** que justifica sua realização em duas frentes principais:

- **Atendimento a uma Necessidade de Formação e Qualificação:**
  O projeto supre a necessidade de uma plataforma educacional prática, permitindo o desenvolvimento de competências aplicadas. Isso qualifica os desenvolvedores para atuarem no setor de automação com uma visão sistêmica e integrada, um diferencial altamente valorizado pelo mercado de trabalho.

* **Oportunidade no Mercado Comercializador (Escalabilidade Tecnológica):**
  Além do viés acadêmico, o projeto atende a uma crescente demanda comercial por tecnologias autônomas. A arquitetura desenvolvida (focada em sensoriamento, mapeamento de ambientes e tomada de decisão) supre a necessidade da indústria por bases tecnológicas escaláveis. Esses conceitos são exatamente os mesmos exigidos pelo mercado para o desenvolvimento de inovações práticas voltadas ao consumidor final, como eletrodomésticos autônomos (robôs aspiradores), brinquedos inteligentes, robôs educacionais e sistemas de entretenimento interativo.

### Indicadores

> Listar até 10 indicadores que determinam o mercado consumidor do produto desenvolvido: exemplo:
>
> 1. nº de alunos da FGA que utilizam ônibus às 18:00;
> 2. nº de usuários do restaurante universitários,
> 3. número de idosos classificados como público-alvo no DF e no estado de Goiás,
> 4. nº de empresas de segurança registradas no DF etc.

### Membros da Equipe

| **Nome**                               | **Matrícula** | **Curso**              | **E-mail**                  | **Funções**         |
| -------------------------------------- | ------------- | ---------------------- | --------------------------- | ------------------- |
| Alice Rodrigues Mariano                | 242004475     |                        | aliceromar21@gmail.com      |                     |
| Davi Carneiro de Moura                 | 241012187     |                        | davicm2011.11@gmail.com     |                     |
| Eduardo Oliveira Valadares             | 231026311     |                        | eduov2004@gmail.com         |                     |
| Gabriel Côrtes de Sousa                | 251009158     |                        | bielcs07@gmail.com          |                     |
| Gabriel de Araújo Cotrim               | 242004662     |                        | gabrielcotrim2016@gmail.com |                     |
| Gabriel Escramin Lourenço              | 251039569     |                        | escramingabriel@gmail.com   |                     |
| Gustavo Oki de Freitas Rodrigues Leite | 231034716     |                        | gustavooki2004@gmail.com    |                     |
| João Paulo da Silva Pereira            | 241025784     |                        | jotasv2005@gmail.com        |                     |
| Kaleb de Souza Macedo                  | 231026975     |                        | kmacedo0279@gmail.com       |                     |
| Kelyton de Lucas Moraes Santos         | 241012033     |                        | kelytonlucas@gmail.com      |                     |
| Lucas Alves Oliveira dos Santos        | 231027159     |                        | lucasalves2005@gmail.com    |                     |
| Mateus Fernandes Dantas                | 251026248     |                        | mateusfdantas2007@gmail.com |                     |
| Matias Cantuária Marin                 | 251026210     |                        | matiasmarin89@gmail.com     |                     |
| Natan José França                      | 241011537     |                        | natan.j.franca@gmail.com    |                     |
| Rafael Costa Carvalho                  | 251015262     |                        | rafaratinho2@gmail.com      |                     |
| Renan Batista Gonçalves Pariz          | 222006392     |                        | renanpariz.0@gmail.com      |                     |
| Ricardo Eduardo da Silva Leal          | 242015405     |                        | 242015405@aluno.unb.br      |                     |
| Samuel Nogueira Caetano                | 231027186     | Engenharia de Software | samueln.caetano42@gmail.com | Gerente de Software |
| Thiago Viriato Accioly                 | 231029340     |                        | thiagoacciolyv@gmail.com    |                     |

**Orientador: Prof.º Diogo Caetano Garcia**

---

### Orçamento Estimado (R$)

> A ser definido com base no levantamento de componentes eletrônicos (ESP32, sensores IR, motores DC com encoder, chassi, bateria LiPo), materiais para a pista de testes 4×4 e demais insumos. Cada membro contribuirá proporcionalmente à realidade individual da equipe.

---

### Duração Estimada (horas)

#### Software

##### Premissas do cálculo

- **Período:** 02/09/2026 a 02/12/2026 — **13 semanas**
- **Equipe de software:** **5 membros** (Gerente de Software + 4 desenvolvedores), correspondendo à área de software dentro do grupo multidisciplinar de 19 integrantes
- **Regime:** estudantes em período letivo regular, com dedicação média de **10 horas/semana** por membro ao projeto

##### Distribuição por fase do projeto

| Fase                                   | Período        | Atividades de Software                                                                                                                    |
| -------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Planejamento e Requisitos**          | Sem. 1–3       | TAP, levantamento de requisitos de software, definição de arquitetura e stack tecnológica, configuração do repositório GitHub             |
| **Projeto Conceitual de Software**     | Sem. 4–5       | Diagramas de arquitetura, definição de protocolos de comunicação (WiFi/WebSocket), modelagem do banco de dados, prototipação do dashboard |
| **Desenvolvimento**                    | Sem. 5–11      |                                                                                                                                           |
| **Testes de Software**                 | Sem. 11–12     | Testes unitários (Google Test), testes de integração parcial, validação da telemetria, correção de bugs                                   |
| **Testes de Integração e Finalização** | Sem. 12–13     | Demonstração do sistema completo, ajustes finais, relatório de encerramento, preparação da apresentação final                             |
| **Total**                              | **13 semanas** |                                                                                                                                           |
