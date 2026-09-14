# English Quest — Contexto do MVP

Queremos criar uma plataforma pessoal para **duas pessoas estudarem juntas para uma certificação avançada de inglês**, inicialmente com objetivo de chegar ao nível **C1**.

A ideia é validar o produto primeiro entre nós dois, descobrir o que realmente é útil e necessário durante o estudo e, somente depois, avaliar uma possível evolução para um produto comercial.

## Clientes

### Web — Next.js

O frontend web será feito em **Next.js** e será o ambiente principal das aulas.

No MVP, será possível:

* Entrar em uma sala de aula;
* Realizar uma conversa em tempo real entre os dois participantes;
* Utilizar áudio/vídeo através de WebRTC;
* Visualizar o histórico das aulas;
* Consultar resultados e evolução.

### Mobile — Flutter

Também haverá um aplicativo mobile para Android/iOS.

O mobile **não terá as aulas via WebRTC no MVP**. Seu objetivo será ser o ambiente de estudo entre as reuniões.

Cada usuário poderá abrir o aplicativo e realizar as atividades que a plataforma/IA recomendou para ele até a próxima aula.

Exemplos:

* Grammar;
* Vocabulary;
* Listening;
* Reading;
* Writing;
* Pronunciation;
* Speaking exercises;
* Revisão de erros identificados anteriormente.

A ideia é que o mobile seja adequado para sessões curtas de estudo durante o dia.

---

# Aula e análise

As aulas acontecerão pelo frontend web utilizando **WebRTC**.

Para o MVP, avaliar o uso de uma solução open-source/self-hosted como **LiveKit**, em vez de implementar um servidor SFU/WebRTC completo do zero.

O ambiente de desenvolvimento deverá ser totalmente local inicialmente, utilizando Docker.

Após uma aula, o sistema deverá processar sua gravação e produzir um resultado individual para cada participante.

Pipeline conceitual:

**Aula → gravação → transcrição → seleção de trechos → análise de pronúncia → análise pedagógica → resultado individual**

## Transcrição

A transcrição deverá ser realizada por um serviço de **Speech-to-Text**, inicialmente podendo utilizar o próprio **Azure Speech**, em vez de implementar uma solução própria de reconhecimento de voz.

A transcrição deverá preservar timestamps e, quando possível, a identificação do participante que falou cada trecho.

Não é necessário enviar toda a aula para análise de pronúncia.

## Pronunciation Assessment

O **Azure Speech Pronunciation Assessment** será utilizado especificamente para avaliar a pronúncia.

A ideia é **não executar pronunciation assessment na aula inteira**, tanto por custo quanto por relevância.

A plataforma deverá selecionar trechos relevantes da conversa — por exemplo, palavras, frases ou respostas em que exista material suficiente para avaliação — e então utilizar o Azure Speech nesses trechos.

O resultado poderá contribuir para métricas como:

* Pronunciation;
* Accuracy;
* Fluency;
* Prosody;
* Fonemas/palavras com maior dificuldade;
* Erros recorrentes.

A estratégia exata de seleção dos trechos deverá ser definida durante a implementação/testes do MVP.

---

# Análise com IA

Depois da transcrição e das análises de Speech, os dados da aula serão enviados para um LLM.

Inicialmente queremos utilizar **Gemini via BYOK (Bring Your Own Key)**.

Cada usuário fornecerá sua própria Gemini API Key.

A IA deverá analisar o desempenho de cada participante separadamente, considerando:

* Grammar;
* Vocabulary;
* Fluency;
* Pronunciation;
* Interaction;
* Comprehension;
* Pontos fortes;
* Erros;
* Erros recorrentes;
* Pontos que precisam ser praticados.

A análise deverá ser estruturada para alimentar o perfil de aprendizagem do usuário.

---

# Learning Profile

Cada usuário terá um perfil de aprendizagem que será atualizado após cada aula.

Exemplo conceitual:

```text
Speaking
  Fluency: 78
  Grammar: 82
  Vocabulary: 75
  Pronunciation: 68

Recurring weaknesses
  - Conditionals
  - Phrasal verbs
  - /θ/ pronunciation

Recent improvements
  - Past perfect
  - Conversation fluency
```

O sistema deverá guardar histórico suficiente para perceber evolução e dificuldades persistentes.

A IA não deverá precisar receber todo o histórico bruto a cada execução. O sistema deverá trabalhar preferencialmente com um perfil/resumo estruturado e os dados relevantes das aulas recentes.

---

# Atividades e plano de estudos

Após cada aula, a IA deverá gerar um **plano individual de estudo até a próxima reunião**.

O plano será diferente para cada participante de acordo com suas dificuldades.

A plataforma terá um **Content Bank** com exercícios e conteúdos previamente cadastrados.

Inicialmente, especialmente para Listening e Reading, a ideia é utilizar conteúdo pré-existente e curado, em vez de gerar tudo com IA.

## Listening

Teremos um banco de áudios com metadados, por exemplo:

```text
audio
title
level
duration
accent
topic
transcript
questions
answers
skills
difficulty
source
```

A IA deverá principalmente **selecionar os conteúdos mais adequados** ao perfil do usuário, em vez de gerar um novo áudio para cada atividade.

Isso reduz custos de IA e permite controlar melhor a qualidade do material.

O mesmo conceito poderá ser utilizado futuramente para Reading, Grammar e Vocabulary.

---

# BYOK

O MVP deverá seguir uma estratégia **Bring Your Own Key** para reduzir custos.

Cada usuário poderá fornecer:

* Gemini API Key;
* Azure Speech API Key.

As chaves deverão ser tratadas como credenciais sensíveis e nunca expostas diretamente no frontend.

O objetivo é que o custo de consumo das ferramentas de IA fique associado ao próprio usuário, permitindo aproveitar eventuais free tiers/quotas dos serviços.

Também queremos evitar chamadas desnecessárias ao LLM. A IA deve ser utilizada principalmente para:

* Analisar aulas;
* Identificar padrões;
* Atualizar/recomendar objetivos;
* Selecionar atividades;
* Gerar explicações personalizadas;
* Criar exercícios quando realmente necessário.

Conteúdo estático, como Listening e Reading, deverá preferencialmente ser reutilizado a partir do Content Bank.

---

# Infraestrutura local

O MVP deverá ser desenvolvido inicialmente **sem necessidade de hospedagem externa**.

A infraestrutura local deverá utilizar Docker, inicialmente com componentes como:

```text
Next.js
NestJS
PostgreSQL
Redis
MinIO
LiveKit
```

O **MinIO** será utilizado localmente como substituto compatível com S3 para armazenar:

* Gravações das aulas;
* Áudios;
* Conteúdos de Listening;
* Outros arquivos necessários.

O **LiveKit** deverá ser avaliado como servidor WebRTC self-hosted local.

Posteriormente, a infraestrutura poderá migrar para AWS, mantendo a abstração de storage compatível com S3.

---

# Ciclo principal do produto

O objetivo central do MVP é validar este ciclo:

```text
┌──────────────┐
│     Aula     │
└──────┬───────┘
       ↓
┌──────────────┐
│ Transcrição │
└──────┬───────┘
       ↓
┌────────────────────┐
│ Pronunciation      │
│ Assessment         │
│ (trechos)          │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ IA analisa aula    │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ Learning Profile   │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ Plano individual   │
│ de estudos         │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ Mobile              │
│ atividades         │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│      Nova aula      │
└────────────────────┘
```

O principal objetivo do MVP não é criar uma plataforma completa de inglês, mas validar se esse **ciclo de conversa → diagnóstico → estudo personalizado → nova avaliação** realmente melhora nossa preparação para o C1.

Durante o uso, devemos observar quais métricas, tipos de exercícios, análises e funcionalidades realmente são úteis. Essas descobertas deverão orientar as próximas fases do projeto e, futuramente, uma possível versão comercial.

---

# Decisões validadas do MVP

Esta seção registra as decisões já fechadas. Onde houver divergência com o texto acima, vale o que está aqui.

## Escopo

O MVP contempla o **ciclo completo com os dois clientes**: aula na web via WebRTC, gravação, transcrição, pronunciation assessment em trechos, análise por IA, learning profile, plano individual de estudos e execução das atividades no app Flutter. Nada do ciclo fica de fora.

## Contas e autenticação

Os usuários serão **criados por seed** (script/comando de inicialização), dois por padrão. O produto terá **apenas tela de login** — não haverá cadastro público nem fluxo de convite no MVP.

O modelo de dados **não tem limite de usuários**. Uma conta inserida direto no banco loga e usa tudo que é por usuário — chaves, perfil, plano, atividades, histórico — sem mudança de código.

## Número de participantes na aula

Decisão: **destravar sem construir agora.**

O MVP opera com 2 participantes, mas o produto não fica preso a esse número:

* O limite da sala é **configuração** (`LESSON_MAX_PARTICIPANTS`, padrão 2, suportado até 4), não uma constante;
* O cenário gera **um papel por participante**, com as relações entre eles — não um par fixo;
* A análise recebe "os demais participantes" como contexto, no plural;
* A fronteira de privacidade vale contra todos os outros, não contra "o parceiro".

Isso já funciona com N sem mudança nenhuma, porque **o pipeline bifurca por participante**: gravação (track egress é por track publicada), transcrição, seleção de trechos, pronúncia, análise, perfil, geração de conteúdo, plano e atividades não têm noção de "par".

Fica de fora do MVP, e é o que tornaria N de verdade viável no dia a dia:

* **Aulas simultâneas e múltiplas salas** — hoje é uma sala única e uma aula por vez, seja qual for o limite configurado. Com 3+ usuários no sistema isso significa que não dá para ter duas aulas ao mesmo tempo nem uma aula que exclua alguém;
* Layout de vídeo otimizado além de grade uniforme;
* Modo observador, papel de professor, permissões por participante.

Custo a considerar: o cenário passa de 3 chamadas por aula (1 situação + 2 cards) para **1 + N**, com o pior caso em 4 × (1 + N) por causa dos rerolls.

## Aula

A sala de aula é **ad-hoc e sempre disponível**: não existe agendamento nem calendário. Qualquer um dos dois abre a sala e aguarda; a aula começa quando ambos estão conectados.

## Cenário e personas da aula

**Toda aula tem um cenário.** Ele é preparado na sala de espera, antes de a aula começar — não é agendamento, é preparação. O cenário dá domínio de vocabulário e um norte para a conversa, e depois alimenta a análise da IA como contexto do que era esperado.

São dois artefatos com visibilidades diferentes:

* **Situação compartilhada** (os dois veem) — cenário, premissa com uma tensão, os **dois papéis já nomeados e a relação entre eles** (ex.: `Traveler` ↔ `Airline agent`), domínio de vocabulário e alguns ganchos de discussão. Gerada por quem abre a sala, com a chave dele, **sem nenhum dado de perfil**;
* **Card de persona privado** (só o dono vê o seu) — elabora o papel já atribuído: background, um objetivo privado, uma restrição, registro a adotar e expressões-alvo. Gerado pela chave do próprio participante, a partir da situação compartilhada e do perfil dele.

**Coerência por construção:** como os dois papéis e a relação entre eles vêm da situação compartilhada, as personas não podem divergir para ficções desconexas. O prompt do card recebe a situação literal e apenas o *rótulo* do outro papel — nunca o card do parceiro.

**Deliberadamente aberto:** a situação apresenta premissa e tensão, nunca o desfecho; o card dá objetivo, nunca falas prontas. Os prompts proíbem explicitamente prescrever o resultado da conversa ou fornecer frases de exemplo para ler.

Isso também resolve um problema real: conversa livre entre as mesmas duas pessoas converge para os assuntos confortáveis e o vocabulário já dominado. O cenário força domínios novos.

Regras complementares: papéis sorteados na geração da situação; domínio de vocabulário rotativo sem repetir nos últimos 5 encontros; quem abriu pode sortear outra situação até 3 vezes antes de começar; na primeira aula, sem perfil ainda, os cards saem só da situação.

Esta decisão **respeita a regra de BYOK**: nenhum perfil de um participante é processado pela chave do outro.

## Gravação

A gravação usa **track egress por participante**: um arquivo de áudio isolado por pessoa, gravado no MinIO. **Vídeo não é gravado** no MVP.

Consequências:

* A atribuição de fala é exata, sem necessidade de diarização;
* O pronunciation assessment roda sobre áudio limpo, sem contaminação da voz do outro participante;
* O histórico de aulas não terá replay de vídeo.

## BYOK — roteamento das chaves

**A chave de cada usuário processa somente os dados daquele usuário.** A chave Azure Speech do usuário A transcreve e avalia a pronúncia do track de A; a chave Gemini de A gera a análise, a atualização de perfil e o plano de estudos de A. Não há fallback para a chave do parceiro.

Consequência: o processamento pós-aula é **independente por participante** — o pipeline bifurca, e a falta de chave (ou falha) de um participante não impede o processamento do outro.

## Seleção de trechos para pronunciation assessment

A seleção é **determinística, baseada em regras sobre os metadados da transcrição** — sem chamada extra ao LLM. Critérios: duração da fala (faixa útil de alguns segundos), quantidade de palavras e confiança do STT, com **teto de trechos por participante por aula** para controlar custo.

Os limites exatos são parâmetros ajustáveis durante os testes do MVP.

## Origem do conteúdo das atividades

O Content Bank é **híbrido**, com um campo de procedência (`curated` ou `generated`) em cada item.

### Listening — curado

Listening é sempre importado, nunca gerado. O motivo não é apenas custo: a dificuldade real do listening vem de propriedades do áudio autêntico — sotaque, velocidade, *connected speech*, hesitação, sobreposição, ruído. TTS (mesmo ElevenLabs) entrega áudio limpo e articulado demais, produzindo um listening falsamente fácil que não treina o que a prova C1 cobra.

A fonte inicial é um site externo de listenings já identificado. Os metadados são montados manualmente, com auxílio de IA de uso geral, fora do produto.

Estrutura de importação:

```text
assignment-content/
  listening/
    <slug>/
      audio.mp3        (ou extensão equivalente)
      meta.json        (title, level, duration, accent, topic,
                        transcript, questions, answers, skills,
                        difficulty, source)
```

Regras:

* O importador é **idempotente por slug** — reimportar atualiza, não duplica;
* Os arquivos de áudio **não são versionados no git** (bloat binário permanente). A pasta fica fora do controle de versão ou usa git-lfs;
* O importador faz upload para o MinIO e o banco guarda apenas a chave do objeto;
* O `meta.json` é versionado e revisável em diff.

### Reading, Vocabulary e Grammar — gerados por IA

Gerados sob medida a partir do learning profile, mirando as fraquezas recorrentes do participante. Um reading que usa deliberadamente as conditionals erradas na última aula vale mais que um texto genérico de banco — é exatamente o ciclo que o MVP quer validar.

Regras:

* Geração **em lote, uma vez por plano de estudos** — nunca por atividade aberta;
* Todo item gerado é **persistido no Content Bank** com procedência `generated` e fica reutilizável nos ciclos seguintes, inclusive para o outro participante com dificuldade equivalente;
* Reading **curado continua possível** pelo mesmo importador e pela mesma estrutura de pastas, como opção — texto autêntico de nível C1 costuma superar texto de LLM quando existe um bom disponível.

## Prompts e controle de dificuldade do conteúdo gerado

Os prompts ficam em **arquivos `.yaml` versionados no repositório** — revisáveis em diff, versionados junto do código, sem infra externa e funcionais no ambiente Docker local. Cada arquivo carrega identificador, versão, parâmetros do modelo, esquema de saída estruturada, instruções e template com variáveis.

Todo item gerado guarda **qual prompt e qual versão o produziu**, para permitir rastrear o que funciona ao longo do uso.

Pedir "nível C1" ao LLM não produz nível C1 — produz texto médio com vocabulário levemente mais formal. A dificuldade é operacionalizada em restrições verificáveis, em quatro camadas dentro do prompt:

1. **Descritores em vez de rótulo** — faixa de palavras, comprimento médio de sentença, proporção de vocabulário fora das palavras mais frequentes, estruturas de nível obrigatórias (inversão, cleft sentences, nominalização, hedging, linguagem idiomática), registro abstrato/argumentativo;
2. **Fraquezas do perfil como estruturas obrigatórias** — N ocorrências da estrutura-alvo distribuídas naturalmente pelo texto;
3. **Anti-engessamento** — gênero sorteado de uma lista rotativa, exigência de tese ou tensão em vez de panorama equilibrado, proibição do formato listicle, exigência de particulares concretos, lista de expressões banidas e seed de variação por geração;
4. **Exemplars de estilo no próprio YAML** — trechos curtos de texto autêntico como few-shot de registro, não de conteúdo.

Sobre essas camadas atua um **gate determinístico pós-geração**, em código e sem chamada extra de IA: contagem de palavras na faixa, comprimento médio de sentença, type-token ratio, percentual de vocabulário fora de uma lista de frequência versionada no repo, presença das estruturas-alvo e ausência dos termos banidos. Item reprovado é regenerado uma vez, com os motivos da falha anexados ao prompt.

### Calibração pelo uso

Ao concluir uma atividade, o participante registra em um toque se ela foi **fácil demais, adequada ou difícil demais**, e opcionalmente se não foi útil. A avaliação é gravada junto da versão do prompt que gerou o item, fornecendo o sinal para afinar os YAMLs ao longo do uso.

## Atividades e paridade entre clientes

O plano de estudos contempla **todos os tipos de atividade**:

* **Objetivas** — Grammar, Vocabulary, Listening e Reading, de resposta fechada (múltipla escolha, preencher lacuna, ordenação), corrigidas automaticamente em código, sem custo de IA no momento da resposta;
* **Writing** — texto livre a partir de um enunciado, corrigido pelo Gemini com retorno estruturado: erros por categoria, sugestões e versão revisada;
* **Pronunciation e Speaking** — gravação de voz no cliente, enviada ao Azure Pronunciation Assessment pela mesma rota BYOK do pipeline pós-aula;
* **Revisão de erros anteriores** — itens montados sobre erros já identificados em aulas e atividades, reapresentados ao longo do tempo.

**Regra de paridade: os dois clientes fazem tudo, exceto a aula ao vivo.** A chamada WebRTC é exclusiva da web; todo o resto — atividades de todos os tipos, histórico de aulas, resultados, learning profile, evolução e gestão das chaves BYOK — existe tanto na web quanto no mobile.

Escrever um writing pelo celular é desconfortável, mas deve ser possível.

## Plano de estudos

O plano é entregue **dividido em sessões diárias curtas**, com meta de tempo por sessão, adequado a estudo em intervalos curtos ao longo do dia.

Como não existe agendamento de aulas, o plano **não tem data de término**: permanece ativo até ser substituído pelo plano gerado após a próxima aula.

Na virada de ciclo, os itens não concluídos que **ainda correspondem a uma fraqueza atual do perfil migram** para o plano novo; os demais são arquivados junto do plano anterior.

## Origem dos scores do Learning Profile

Os números do perfil têm **origem híbrida**:

* **Pronúncia** — vem diretamente dos números do Azure Pronunciation Assessment (accuracy, fluency, prosody), objetivos e comparáveis entre aulas;
* **Grammar, Vocabulary, Interaction e Comprehension** — atribuídos pelo LLM segundo uma rúbrica fixa.

O perfil é **média ponderada das aulas e atividades recentes, não sobrescrita** pela última medição: um dia ruim não derruba o perfil inteiro.

**Aulas e atividades alimentam o perfil.** Erros em questões objetivas, correções de writing e scores de pronúncia das atividades também atualizam scores e fraquezas, o que dá sinal de evolução entre as aulas e torna a revisão de erros mais precisa.

## Idioma

A interface dos dois clientes é **em inglês**, reforçando imersão e coerente com o objetivo C1. Enunciados, correções e explicações pedagógicas também saem em inglês.

O `docs/context.md` e a comunicação do time permanecem em português.

## Fora do escopo do MVP

Desejados para o futuro, mas **não desenvolvidos agora**:

* Player da aula com transcrição sincronizada no histórico;
* Notificações de lembrete de estudo e de resultado pronto.

Não previstos para o projeto:

* Uso offline no mobile com sincronização posterior;
* Visão comparativa de evolução entre os dois participantes.
