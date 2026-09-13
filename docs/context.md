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
