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
- **Mensurável:** A validação ocorrerá ao completar os três percursos exigidos (preferencialmente na primeira tentativa, garantindo nota máxima por labirinto) e ao exibir os dados telemétricos (tipo de labirinto, trajeto percorrido, consumo de bateria, velocidade média, tempo de conclusão e status do desafio) no sistema web em tempo real;
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

A partir da análise do cenário atual das competições da categoria Micromouse e do mercado de robótica em geral, identificou-se o seguinte conjunto de indicadores que fundamentam o desenvolvimento de um micromouse com foco educacional:

1. Segundo Cai et al. (2010), o Micromouse conta com um histórico de mais de três décadas de competições realizadas mundialmente, sendo guiado por regras padronizadas pelo IEEE;
2. De acordo com a Precedence Research (2023), o mercado global de robôs móveis autônomos (AMR) tem projeção para alcançar a marca de US$ 29,66 bilhões até 2034, registrando uma taxa de crescimento anual composta (CAGR) de 22,31%;
3. Segundo relatório da Cognitive Market Research (2026), o mercado global de robótica educacional deve dar um salto de US$ 1,54 bilhão em 2025 para US$ 10,39 bilhões até 2033, o que representa um expressivo CAGR de 26,87%;
4. Conforme apontado por Al-Sarawi et al. (2020), o mercado global da Internet das Coisas (IoT) possui previsão de expansão de US$ 245 bilhões em 2020 para US$ 8,13 trilhões em 2030, demonstrando um CAGR de 39%;
5. Segundo a Polaris Market Research (2022), o segmento global de robôs de limpeza foi avaliado em US$ 8,3 bilhões no ano de 2021, mantendo uma projeção de crescimento constante e acelerado até 2030;
6. De acordo com Chung et al. (2021), a exposição de estudantes a competições de robótica faz com que 95% deles manifestem interesse em seguir carreiras nas áreas de STEM (Ciência, Tecnologia, Engenharia e Matemática);
7. Conforme levantamento de Santos, Curvelo e Gonçalves (2025), o Brasil figura no 2º lugar mundial em volume de publicações científicas voltadas à formação de professores para o ensino de robótica, evidenciando um mercado institucional e acadêmico altamente receptivo;
8. Segundo Chung et al. (2021), a viabilidade técnica de plataformas de telemetria e monitoramento web foi comprovada ao viabilizar a participação sincronizada e remota de 153 equipes e 360 estudantes em campeonatos mundiais online.

### Membros da Equipe

| **Nome**                               | **Matrícula** | **Curso**              | **E-mail**                  | **Funções**         |
| -------------------------------------- | ------------- | ---------------------- | --------------------------- | ------------------- |
| Alice Rodrigues Mariano                | 242004475     | Engenharia de Software | aliceromar21@gmail.com      | Software            |
| Davi Carneiro de Moura                 | 241012187     | Engenharia de Software | davicm2011.11@gmail.com     | Estrutura           |
| Eduardo Oliveira Valadares             | 231026311     | Engenharia de Software | eduov2004@gmail.com         | Estrutura           |
| Gabriel Côrtes de Sousa                | 251009158     | Engenharia Aeroespacial| bielcs07@gmail.com          | Gerente de Estrutura|
| Gabriel de Araújo Cotrim               | 242004662     | Engenharia Eletrônica  | gabrielcotrim2016@gmail.com | Hardware          |
| Gabriel Escramin Lourenço              | 251039569     | Engenharia de Software | escramingabriel@gmail.com   | Energia             |
| Gustavo Oki de Freitas Rodrigues Leite | 231034716     | Engenharia de Software | gustavooki2004@gmail.com    | Gerente Geral       |
| João Paulo da Silva Pereira            | 241025784     | Engenharia de Software | jotasv2005@gmail.com        | Estrutura           |
| Kaleb de Souza Macedo                  | 231026975     | Engenharia de Software | kmacedo0279@gmail.com       | Energia             |
| Kelyton de Lucas Moraes Santos         | 241012033     | Engenharia de Software | kelytonlucas@gmail.com      | Hardware          |
| Lucas Alves Oliveira dos Santos        | 231027159     | Engenharia de Software | lucasalves2005@gmail.com    | Software            |
| Mateus Fernandes Dantas                | 251026248     | Engenharia de Software | mateusfdantas2007@gmail.com | Gerente de Energia  |
| Matias Cantuária Marin                 | 251026210     | Engenharia Eletrônica  | matiasmarin89@gmail.com     |Gerente de Eletrônica|
| Natan José França                      | 241011537     | Engenharia de Software | natan.j.franca@gmail.com    | Software            |
| Rafael Costa Carvalho                  | 251015262     | Engenharia Automotiva  | rafaratinho2@gmail.com      | Estrutura           |
| Renan Batista Gonçalves Pariz          | 222006392     | Engenharia de Software | renanpariz.0@gmail.com      | Hardware          |
| Ricardo Eduardo da Silva Leal          | 242015405     | Engenharia de Software | 242015405@aluno.unb.br      | Hardware          |
| Samuel Nogueira Caetano                | 231027186     | Engenharia de Software | samueln.caetano42@gmail.com | Gerente de Software |
| Thiago Viriato Accioly                 | 231029340     | Engenharia de Software | thiagoacciolyv@gmail.com    | Energia             |

**Orientador: Prof.º Diogo Caetano Garcia**

---

### Orçamento Estimado (R$)

> A ser definido com base no levantamento de componentes eletrônicos (ESP32, sensores IR, motores DC com encoder, chassi, bateria LiPo), materiais para a pista de testes 4×4 e demais insumos. Cada membro contribuirá proporcionalmente à realidade individual da equipe.

**Frente de Energia**

O total previsto com os itens recomendados para a alimentação do projeto é de aproximadamente R$ 141,00 a R$ 166,00. Este valor engloba as opções que apresentaram a melhor relação entre preço, marca e avaliação de compradores. Os componentes levantados são:

* **Baterias LiPo 2S 7,4 V:** A recomendação para baterias de 700 a 1100 mAh é a LiPo Ultra 7,4V 1100mAh 2S 20C, custando R$ 132,00. Para capacidades menores, entre 300 e 550 mAh, recomenda-se a Tattu 550mAh 2S 95C R-Line por R$ 51,84.
* **Conector XT30:** O par (macho e fêmea) em compra avulsa custa R$ 5,22.
* **Conector XT60:** O par (macho e fêmea) possui preço variando entre R$ 3,61 e R$ 4,66. Como esse plugue já acompanha a maior parte das baterias LiPo de fábrica no Brasil, a compra avulsa pode não ser necessária, reduzindo o orçamento.
* **Conector JST-XH:** Utilizado como conector de balanceamento, um kit com 10 pares custa R$ 28,90. Geralmente este item já acompanha a bateria.

Os valores informados representam o preço de compra avulsa em plataformas online, pesquisados em setembro de 2026, sem considerar os custos com frete.

**Frente de Estruturas**

O total previsto para os componentes estruturais do projeto é de aproximadamente R$ 160,00 a R$ 220,00. O levantamento considerou as seguintes estimativas para peças e materiais:

* **Chassi:** A ser fabricado via impressão 3D utilizando filamento PETG, com custo estimado entre R$ 80,00 e R$ 100,00. Esse valor inclui o custo da impressão e do material, contando com uma margem de redundância para cobrir prováveis reimpressões da peça.
* **Rodas:** A faixa de preço varia de R$ 10,00 a R$ 50,00. O custo final dependerá das especificações dos motores e do chassi, sendo possível optar por versões mais simples e baratas ou modelos mais caros.
* **Roda boba:** Custo estimado entre R$ 4,00 e R$ 7,00. 
* **Parafusos, porcas e arruelas:** Custo previsto de aproximadamente R$ 15,00. Por serem fáceis de encontrar, podem ser comprados presencialmente em lojas de materiais de construção, dispensando a compra online.
* **MDF/Balsa:** Material destinado à confecção da pista (labirinto), com valor estimado de R$ 50,00. Assim como as ferragens, pode ser adquirido em lojas físicas de materiais de construção. Parte desse custo pode ser abatida, pois um dos membros da equipe possui pedaços de madeira em casa disponíveis para uso.

A pesquisa de preços para os componentes online (como rodas e roda boba) foi realizada em setembro de 2026, consultando as plataformas Google Shopping, Mercado Livre e Shopee.

**Frente de Hardware**

O total previsto com os itens recomendados para a eletrônica embarcada do projeto é de aproximadamente R$ 690,04, já incluído o imposto incidente sobre os componentes importados. O levantamento adotou uma estratégia de compra mista: apenas os sensores de distância e os motores são importados, por apresentarem diferença de preço superior a três vezes em relação às lojas nacionais, enquanto todos os demais componentes são adquiridos no Brasil, com pronta entrega. Os componentes levantados são:

* **Microcontrolador ESP32 (2 un., R$ 85,22):** responsável pelo processamento do algoritmo Flood Fill e pela transmissão da telemetria por Wi-Fi ao sistema web. Adotada a versão de 30 pinos, cujos pinos ausentes em relação à de 38 correspondem à interface da memória flash interna e não são utilizáveis como GPIO.

* **Sensores de distância VL53L1X (7 un., R$ 154,00):** sensores de tempo de voo (ToF) a laser, dispostos nas posições frontal, diagonais e laterais, usados para detecção das paredes do labirinto. A tecnologia ToF foi escolhida no lugar de sensores infravermelhos de reflexão porque a medida independe da cor da superfície, condição relevante em um labirinto de paredes brancas e chão preto, e porque dispensa a calibração individual que a alternativa exigiria — etapa que representaria risco direto ao objetivo de concluir cada labirinto na primeira tentativa. É o item de maior peso no orçamento (22% do total).

* **Sensor inercial MPU-6050 (2 un., R$ 43,50):** giroscópio e acelerômetro usados para controle de curvas e correção de trajetória. 

* **Sensor INA219 (1 un., R$ 15,00):** medição de tensão, corrente e potência, atendendo diretamente ao requisito de exibir o consumo de bateria na telemetria em tempo real.

* **Motores DC N20 com encoder e redução (3 un., R$ 90,00):** acionamento e odometria. Os encoders viabilizam a contagem de células percorridas e o cálculo da velocidade média. 

* **Ponte H DRV8833 (2 un., R$ 20,72):** driver de acionamento dos motores, escolhido pela baixa queda de tensão, pelas proteções internas e pelo tamanho compatível com a restrição de 16,5 cm do robô. 

* **Conversor DC-DC MP1584 (2 un., R$ 12,00):** rebaixa os 7,4 V da bateria LiPo para o barramento de 5 V da eletrônica. 

* **Prototipagem e interface (R$ 84,85):** perfboards, protoboard, kit de jumpers, DIP switch para seleção do tipo de labirinto e chaves liga-desliga. 

* **Montagem, consumíveis e proteção (R$ 117,00):** parafusos e espaçadores M2/M3, LEDs e resistores, pin headers, espaguete termorretrátil, capacitores de desacoplamento, fita dupla-face, abraçadeiras, cola instantânea, buzzer de depuração e o circuito de proteção contra inversão de polaridade. 

* **ICMS sobre os itens importados (R$ 67,75):** alíquota de 20% do Distrito Federal, calculada sobre os R$ 271,00 de mercadoria importada. O Imposto de Importação federal é zero para remessas de até US$ 50, condição respeitada pelo fracionamento do pedido.

Não estão incluídos neste total os itens já orçados por outras frentes — bateria LiPo e conectores (Energia), rodas, roda boba, chassi e ferragens (Estruturas) — nem o estanho de solda e o fio, cedidos por um integrante da equipe.

**Plano de contingência:** Caso a remessa internacional não chegue a tempo dos testes de bancada previstos para a semana 6, os quatro componentes importados precisam ser recomprados no Brasil, e nenhum cenário de substituição cabe no teto de R$ 700,00:

| Cenário | Descrição | Total |
| :--- | :--- | :--- |
| A — Integral | Mesma lista, tudo comprado no Brasil | R$ 1.210,09 |
| B — Com VL53L0X | Troca do sensor ToF pelo VL53L0X, demais itens mantidos | R$ 877,59 |
| C — Mínimo | VL53L0X, 5 sensores, 2 motores, sem unidades de reserva | R$ 711,79

A diferença vem quase toda de dois itens: o sensor VL53L1X custa R$ 66,40 em loja nacional contra cerca de R$ 22 importado, e o motor N20 com encoder custa por volta de R$ 113 aqui contra cerca de R$ 30. Caso a contingência seja acionada, a frente de hardware recomenda o cenário B, com pedido de suplementação de R$ 177,59, preservando as unidades de reserva. A troca pelo VL53L0X implica perda do controle de região de interesse do sensor, a ser compensada por colimadores mecânicos no chassi, o que exige articulação com a frente de estruturas. 

Os preços dos componentes nacionais foram consultados diretamente nas lojas MakerHero e Eletrogate em setembro de 2026; os valores de importação representam faixas de plataformas internacionais no mesmo período. Os custos de frete não estão considerados.

---

### Duração Estimada (horas)
* Período: 02/09/2026 a 02/12/2026 (13 semanas).

**Hardware**

- **Equipe de hardware:** **5 membros** (Gerente de Hardware + 4 integrantes), correspondendo à área de eletrônica dentro do grupo multidisciplinar de 19 integrantes.
- **Regime:** estudantes em período letivo regular, com dedicação média de **4 a 6 horas/semana** por membro ao projeto, adotando-se 5 horas/semana como valor de referência. Este tempo é adicional às duas aulas práticas semanais da disciplina.
- **Carga estimada de trabalho extraclasse:** correspondendo a **25 horas/semana** somadas as cinco pessoas. As horas das aulas práticas são adicionais a esse total.

**Distribuição por fase do projeto**

| Fase | Período | Atividades de Hardware |
| :--- | :--- | :--- |
| **Planejamento e Requisitos** | Sem. 1-3 | TAP, levantamento de requisitos de hardware, definição da arquitetura eletrônica, pesquisa de componentes e orçamento. |
| **Projeto Conceitual de Hardware** | Sem. 4-5 | Diagrama de blocos, esquemático elétrico, mapa de pinos do ESP32, definição do barramento I2C, dimensionamento de corrente e simulação de circuitos. |
| **Aquisição e Testes de Bancada** | Sem. 6-8 | Compra dos componentes, validação individual dos módulos em protoboard, reendereçamento dos sensores ToF, testes de acionamento e leitura de encoders. |
| **Montagem e Integração Eletrônica** | Sem. 9-10 | Montagem definitiva em perfboard, soldagem, chicote de fiação, acomodação no chassi e ajuste da alimentação. |
| **Testes de Hardware** | Sem. 11-12 | Testes de sensores, ponte H e encoders, medição de consumo com o INA219, depuração e correção de falhas. |
| **Testes de Integração e Finalização** | Sem. 13 | Suporte à integração com software, energia e estruturas, ajustes finais e preparação da apresentação final. |
| **Total** | **13 semanas** | |

#### Software

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
