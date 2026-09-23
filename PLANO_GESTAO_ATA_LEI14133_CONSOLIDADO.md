# PLANO CONSOLIDADO — GESTÃO DE ATAS E CONTRATOS À LUZ DA LEI 14.133/2021

**Sistema**: SaldoARP / ComprasSUSP
**Data**: 23/09/2026
**Status**: MATURAÇÃO CONCEITUAL — NADA IMPLEMENTADO AINDA
**Origem**: Sessão de simulação combinando Lei 14.133/2021, gestão ágil de projetos e gamificação, com verificação cruzada contra o código-fonte atual (branch `claude/practical-curie-l7be2j`, commit `62c78e4`)

---

## 1. Objetivo

Desenhar, antes de qualquer implementação, como o SaldoARP deveria gerir o ciclo de vida de Atas de Registro de Preços e Contratos administrativos de forma que:
1. Nenhum prazo legal (vigência, aditivo) seja perdido;
2. As regras aplicadas estejam juridicamente corretas (não aproximadas);
3. O trâmite administrativo (processo SEI) seja respeitado, não contornado;
4. A experiência de uso reduza a carga cognitiva do gestor via estrutura ágil e reforço comportamental (gamificação).

Este documento é o acumulado de uma sessão de simulação — é insumo para uma futura fase de implementação, análoga aos planos já existentes no repositório (`FASE_3_PLANO_CENTRAL_PRAZOS.md`, `FASE_4_PLANO_GESTAO_EVENTOS_CONTRATUAIS.md`).

---

## 2. Cenário de referência (persona da simulação)

**Ana, gestora de contratos da SENASP.** Carteira: 8 Atas de Registro de Preços em fases distintas de vigência + 14 Contratos administrativos (3 contínuos, 11 de escopo fechado). Problema central: prazo que não vira tarefa visível não é gerido, é lembrado de cabeça.

---

## 3. Regras jurídicas validadas (Lei 14.133/2021 e correlatos)

### 3.1. Prazos de vigência e prorrogação

| Instrumento | Prazo inicial | Prorrogação | Base legal |
|---|---|---|---|
| Ata de Registro de Preços | 1 ano | +1 ano (máx. 24 meses total), condicionada a preço vantajoso | Art. 84, Lei 14.133/21 |
| Contrato contínuo | Até 5 anos | Sucessivas, até 10 anos totais (120 meses) | Art. 107 c/c limites doutrinários |
| Aditivo de acréscimo/supressão (Contrato) | — | Limitado a 25% do valor atualizado (50% em reforma de prédio/equipamento); não se renova a cada prorrogação | Art. 125, Lei 14.133/21 |
| Janela de segurança para iniciar prorrogação | — | 180 dias antes do vencimento (orientação consolidada, não é prazo legal expresso) | Jurisprudência TCU |

**Regra crítica**: depois que a vigência termina, não existe aditivo retroativo — o ajuste se extingue. O marco operacional relevante é **vencimento − 180 dias**, não a data de vencimento em si.

### 3.2. Regra de renovação da Ata (saldo × vantajosidade)

O critério legal principal de prorrogação é **vantajosidade de preço** (art. 84), não saldo. Mas saldo entra por outra via: a prorrogação deve ser exercida **antes de expirado o prazo OU esgotado o objeto, o que ocorrer primeiro** — e a extinção da Ata por esgotamento de quantitativos é **independente da data de vigência** (pode ocorrer antes do prazo calendário).

Regra consolidada para o motor de prazos:
```
Elegível para prorrogação SE:
  vantajosidade_confirmada (pesquisa de mercado) E
  (saldo_remanescente > 0 OU edital_previu_renovacao_quantitativos = true)

SENÃO → encerrar por esgotamento de escopo (independente da data de vencimento)
```

A exceção (`edital_previu_renovacao_quantitativos`) só é válida se **prevista expressamente desde a fase de planejamento** no edital e na própria ata (pacificado pelo Parecer nº 00075/2024/Decor/CGU/AGU) — não é inferível depois, precisa ser capturada no cadastro da ata.

### 3.3. Aditivo de valor — duas categorias com respostas opostas

| Tipo | Aplica-se à Ata? | Instrumento | Base legal |
|---|---|---|---|
| Reajuste (índice, inflação ordinária) | **Sim** | Apostila (se já previsto no edital/ata) ou aditivo | Art. 82, Lei 14.133/21; art. 136, I |
| Repactuação (custo de mão de obra) | **Sim** | Idem | Art. 82 |
| Reequilíbrio/revisão (evento imprevisível) | **Sim** | Idem, mais parecer jurídico | Art. 82 |
| Acréscimo de quantidade/valor total (o "aditivo de 25%") | **Não** — só se aplica ao Contrato derivado, nunca à Ata em si | Termo aditivo de contrato | Art. 125 c/c Decreto 11.462/2023, art. 23 (veda expressamente acréscimo de quantitativo na Ata) |

O que a Ata **pode** ter em vez de acréscimo é **remanejamento**: mover saldo não usado de um participante para outro, com **consentimento prévio obrigatório da unidade cedente** — operação soma-zero, nunca aumenta o total registrado.

### 3.4. Contratos sem Ata e empenhos que substituem contrato (Art. 95)

Dois eixos independentes, não um:
- **Eixo 1 — Origem do preço**: derivado de Ata (SRP) ou direto (licitação comum, dispensa, inexigibilidade).
- **Eixo 2 — Instrumento formalizador**: Termo de Contrato (regra geral) ou instrumento substitutivo do **art. 95** — carta-contrato, nota de empenho, autorização de compra, ordem de execução de serviço.

Instrumento substitutivo é cabível em duas hipóteses: (I) dispensa por valor; (II) entrega imediata e integral sem obrigações futuras, independente do valor. Mesmo substituindo o contrato, precisa carregar as cláusulas essenciais do art. 92 (de forma concisa). O art. 82, §6º confirma que os dois eixos são independentes: dá para ter Ata + empenho substituindo contrato ao mesmo tempo.

**4 combinações válidas (nenhuma é "dado incompleto"):**

| | Termo de Contrato | Instrumento substitutivo (art. 95) |
|---|---|---|
| **Com Ata (SRP)** | Caso padrão (Contratação→Ata→Contrato→Empenho) | Empenho consome saldo da Ata direto, sem contrato formal |
| **Sem Ata (direto)** | Dispensa/inexigibilidade formalizada por contrato comum | Só existe o empenho — sem Ata, sem Contrato |

**Consequência para o motor de prazos**: instrumento substitutivo, por definição do inciso II, não gera obrigação futura — não tem vigência a prorrogar, não entra no board de D-180. Participa apenas do farol de saldo (se tiver Ata de origem) e do controle de limite anual de dispensa (teto ainda não mapeado neste plano).

---

## 4. Farol de saldo (proposta de indicador visual)

Não é só "quanto resta" — é **quando vai acabar**, cruzando duas variáveis:
1. Nível de saldo (% remanescente do gerenciador)
2. Velocidade de consumo (burn rate projetado)

### 4 estados propostos

| Farol | Condição | Ação sugerida |
|---|---|---|
| 🟢 Confortável | saldo ≥ 40% **e** projeção de esgotamento > D-180 | Monitorar |
| 🟡 Atenção | saldo 15–40% **ou** projeção entre D-180 e D-90 | Sinalizar no radar, avaliar cenário |
| 🟠 Crítico | saldo < 15% **ou** projeção < D-90 (mas > 0) | Decidir: nova licitação, remanejamento, ou aceitar encerramento |
| 🔴 Esgotado | saldo = 0 | Bloqueia prorrogação (salvo exceção do edital) → aciona encerramento por escopo |

Limiares (40%/15%) não têm base normativa — são calibráveis com uso real. O que não é calibrável é a lógica de cruzamento saldo × burn rate × D-180.

Cálculo por **item** (onde o saldo realmente vive); a Ata herda o **pior estado entre seus itens**. Falta no schema: série temporal de consumo (hoje só existe "total empenhado", não "ritmo de empenho").

Acessibilidade: cor nunca sozinha — ícone + rótulo textual sempre junto (site gov.br, requisito de acessibilidade).

---

## 5. Camada ágil (Ata/Contrato tratados como "projeto")

Já validado em uso real no setor público (caso Receita Estadual do Paraná — Kanban por squad, Dono do Produto, daily, backlog por user stories).

- **1 card por Ata/Contrato** — não linha de planilha. Carrega vencimento real, data-gatilho (D-180), % de valor aditivado, histórico de aditivos.
- **Kanban de 5 colunas**, avançado por condição legal satisfeita, não por vontade do gestor:
  `Monitorando → Radar Aberto (D-180) → Pesquisa de Vantajosidade → Aditivo em Elaboração/Assinatura → Publicado (PNCP/DOU)`
- **Sprint = ciclo de revisão quinzenal**: garantir que nenhum card ficou parado além do esperado (equivalente a WIP limit).
- **Backlog priorizado por urgência objetiva** (dias até D-180), não por achismo.

---

## 6. Camada de gamificação (baseada em evidência, não decoração)

Pesquisa 2026: gamificação de **reconhecimento** supera gamificação de **disputa**; ganho real de produtividade só se sustenta se reforça comportamento real. Para prazo legal: **o jogo é a gestora contra o calendário, não contra colegas** — sem ranking público entre servidores.

- **Streak "Zero Prazo Perdido"** com mecanismo de *freeze* (férias/licença não quebra a sequência).
- **Badges por marco cumprido**, não por volume: "Radar Antecipado", "Aditivo Preciso", "Zero Vencimento".
- **Barra de progresso numérica por instrumento** ("218 dias até o teto legal de 24 meses") — feedback imediato reduz procrastinação.
- **XP por complexidade real**, não por quantidade — evita otimizar pela tarefa fácil e ignorar a difícil.

---

## 7. Arquitetura de dados/workflow proposta

### 7.1. O padrão já existe — para Contrato, não para Ata

`src/types/contractEvents.ts` já implementa exatamente o esqueleto certo: princípio **"FATO OFICIAL ≠ EVENTO ≠ WORKFLOW ≠ TAREFA"**, badges de conformidade verde/amarelo/vermelho (`AditamentoLimitEvaluation`, art. 125/126) e **"Assistência, Não Decisão Jurídica"** (alerta, nunca bloqueio cego). Falta o espelho para Ata.

| Existe (`Contract*`) | Falta (`Ata*`) |
|---|---|
| `ContractEventType`: CELEBRACAO, PRORROGACAO, REAJUSTE, REPACTUACAO, ACRESCIMO, SUPRESSAO, APOSTILAMENTO, ENCERRAMENTO, RESCISAO | `AtaEventType`: CELEBRACAO, PRORROGACAO, REAJUSTE, REPACTUACAO, REEQUILIBRIO, **REMANEJAMENTO** (novo), APOSTILAMENTO, ENCERRAMENTO_ESCOPO, ENCERRAMENTO_VIGENCIA — **sem** ACRESCIMO/SUPRESSAO (vedado por lei na Ata) |
| `ContractEventNature`: TERMO_ADITIVO vs TERMO_APOSTILAMENTO | Igual — reajuste/repactuação/reequilíbrio viram apostila quando previstos |
| `ContractEventImpact` | Igual, mas ALTERA_QUANTITATIVO só via REMANEJAMENTO (soma-zero) |
| `AditamentoLimitEvaluation` (badge 25/50%) | `SaldoFarolEvaluation` (mesmo shape `{color, label, orientacao}`, ver seção 4) |
| `ContractWorkflowStatus` | `AtaWorkflowStatus` + estado extra `AGUARDANDO_CONSENTIMENTO_CEDENTE` (obrigatório no remanejamento) |

### 7.2. Trâmite SEI

Padrão confirmado (CGU, TJDFT, ANTAQ): **processo-mãe** da Ata (aberto na licitação) + **processos relacionados/apensados** por evento, cada um com checklist de instrução próprio.

| Evento | Instrução mínima no SEI |
|---|---|
| Prorrogação (art. 84) | Pesquisa de vantajosidade + farol de saldo + parecer jurídico + despacho de autorização + termo aditivo + publicação PNCP |
| Reajuste/Repactuação/Reequilíbrio (art. 82) | Memória de cálculo + comprovação da variação + parecer jurídico (se reequilíbrio extraordinário) + apostila ou aditivo |
| Remanejamento | Manifestação de saldo ocioso da cedente + **consentimento formal da cedente** + despacho da gerenciadora |

Todo evento carrega `processoSeiNumero` — já é o padrão em `ContractEvent`, deve se repetir 1:1 em `AtaEvent`.

---

## 8. Achados de código (gaps confirmados por leitura direta do repositório)

1. **`contractProrrogationService.ts`** cobre só prorrogação de **Contrato** (art. 106/107) — não existe equivalente para Ata (art. 84).
2. **`centralPrazosService.ts`** (linhas ~279-333) trata o gatilho de vencimento de Ata **só por `dataVigenciaFinal`** — nenhuma consulta a saldo. Hoje geraria alerta de "planejar prorrogação" mesmo para ata já com saldo zerado.
3. **`ArpRecord`** (`src/types/index.ts:8-38`) não tem saldo agregado nem `previsaoRenovacaoQuantitativos`.
4. **`Contrato.arpId`** (`src/types/index.ts:374`) é **obrigatório** (`arpId: string`, sem `?`) — o tipo atual não consegue representar um Contrato sem Ata, que é juridicamente válido (dispensa/inexigibilidade sem SRP). **Correção pontual recomendada, isolada do resto do plano.**
5. Não existe campo `tipoInstrumento` para distinguir Termo de Contrato de instrumento substitutivo (art. 95).
6. Nenhuma referência no código a `instrumentoSubstitutivo`, `cartaContrato`, `ordemExecucaoServico`, `autorizacaoCompra` ou art. 95 — categoria inteira ainda não modelada.

---

## 9. Pendências em aberto (para próximas sessões de maturação)

- Definir limiares finais do farol de saldo com dados reais de consumo.
- Modelar a série temporal de empenhos por item (necessária para burn rate).
- Especificar `AtaWorkflowStatus` completo (mirroring `ContractWorkflowStatus`) e o checklist de prontidão equivalente ao `ProrrogationReadinessChecklist`.
- Mapear o teto de limite anual de dispensa por fornecedor/órgão (mencionado na seção 3.4, ainda não pesquisado a fundo).
- Decidir se `AtaEvent`/`AtaWorkflow` viram arquivos próprios (`types/ataEvents.ts`, `services/ataEventService.ts`) espelhando os de contrato, ou se o domínio é unificado sob um tipo genérico `InstrumentoContratual`.

---

## 10. Fontes consultadas

- [Prazo de vigência da Ata de Registro de Preços e suas consequências — Observatório Nova Lei](https://www.novaleilicitacao.com.br/2023/11/09/prazo-de-vigencia-da-ata-de-registro-de-precos-e-suas-consequencias/)
- [Como formalizar a prorrogação da vigência de uma ata — Blog Zênite](https://zenite.blog.br/como-formalizar-a-prorrogacao-da-vigencia-de-uma-ata-de-registro-de-precos-firmada-no-regime-da-lei-no-14-133-21/)
- [Aditivos em Contratos Contínuos: Limites na Lei 14.133 — Legale](https://legale.com.br/blog/aditivos-em-contratos-continuos-limites-na-lei-14-133/)
- [Aditivo de acréscimo e supressão na prorrogação de contrato — Conjur](https://conjur.com.br/2026-mar-23/aditivos-de-acrescimo-e-supressao-na-prorrogacao-dos-contratos-continuados-2/)
- [No regime da Lei nº 14.133/21, como definir o período de vigência dos contratos? — Blog Zênite](https://zenite.blog.br/no-regime-da-lei-no-14-133-21-como-definir-o-periodo-de-vigencia-dos-contratos-e-como-fica-a-contagem-nas-prorrogacoes/)
- [6.3. Manutenção e prorrogação do contrato — TCU](https://licitacoesecontratos.tcu.gov.br/6-3-manutencao-e-prorrogacao-do-contrato/)
- [Renovação (prorrogação) antecipada de ata e renovação de quantitativos — Blog Zênite](https://zenite.blog.br/renovacao-prorrogacao-antecipada-de-ata-de-registro-de-precos-e-a-renovacao-de-quantitativos/)
- [Renovação dos quantitativos de atas de registro de preços — Conjur](https://www.conjur.com.br/2025-mar-28/a-possibilidade-de-renovacao-dos-quantitativos-previstos-em-atas-de-registro-de-precos-na-sistematica-da-lei-14-133/)
- [Nº 40/25 — Renovação de quantitativos das atas — Portal de Compras do Governo Federal](https://www.gov.br/compras/pt-br/acesso-a-informacao/comunicados/2025/no-40-25-renovacao-de-quantitativos-das-atas-de-registro-de-precos)
- [Renovação das Atas de Registro de Preços e seus quantitativos — Jusbrasil](https://www.jusbrasil.com.br/artigos/renovacao-das-atas-de-registro-de-precos-e-seus-quantitativos-e-a-lei-n-14133-2021/5008872611)
- [O reequilíbrio econômico-financeiro na ata de registro de preços — Migalhas](https://www.migalhas.com.br/depeso/445073/o-reequilibrio-economico-financeiro-na-ata-de-registro-de-precos)
- [Nova Lei de Licitações: atualização de preços registrados — Blog Zênite](https://zenite.blog.br/nova-lei-de-licitacoes-atualizacao-de-precos-registrados/)
- [Parecer do MPC-ES: reequilíbrio econômico-financeiro se aplica a atas de registro de preços](https://www.mpc.es.gov.br/2025/12/parecer-do-mpc-es-e-acatado-e-tribunal-define-que-reequilibrio-economico-financeiro-se-aplica-a-atas-de-registro-de-precos/)
- [Art. 23 do Decreto nº 11.462/2023 — Jusbrasil](https://www.jusbrasil.com.br/topicos/629981865/art-23-do-decreto-n-11462-de-31-de-marco-de-2023)
- [O Remanejamento de Quantitativos em Ata de Registro de Preço — Sollicita](https://portal.sollicita.com.br/Noticia/21066/o-remanejamento-de-quantitativos-em-ata-de-registro-de-pre%C3%A7o)
- [Contratos de serviços resultantes de atas podem ter aditivos de acréscimo/supressão? — Blog Zênite](https://zenite.blog.br/contratos-de-servicos-resultantes-de-atas-de-registros-de-precos-podem-ter-aditivos-para-acrescimo-e-supressao-de-valor-e-de-modificacao-de-prazo-e-vigencia/)
- [O Sistema de Registro de Preços e o Gerenciamento do Saldo Registrado em Ata — SECOMP](https://www.campogrande.ms.gov.br/secomp/artigos/o-sistema-de-registro-de-precos-e-o-gerenciamento-do-saldo-registrado-em-ata/)
- [Manual – Gestão de Atas de Registro de Preços — Portal Gov.br](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manuais-passo-a-pasoo/manual_gestao_de_atas_de_registro_de_preco_srp_v1.pdf)
- [A substituição do instrumento de contrato na Lei nº 14.133/2021 — Blog Zênite](https://zenite.blog.br/a-substituicao-do-instrumento-de-contrato-na-lei-no-14-133-2021/)
- [Nova Lei de Licitações: a substituição do contrato por outros documentos — Blog Zênite](https://zenite.blog.br/nova-lei-de-licitacoes-a-substituicao-do-contrato-por-outros-documentos/)
- [Comentários - Artigo 95 — TCE-SP](https://www.tce.sp.gov.br/legislacao-comentada/lei-14133-1o-abril-2021/95)
- [Dispensa e inexigibilidade de licitação para registro de preços — Blog Zênite](https://zenite.blog.br/dispensa-e-inexigibilidade-de-licitacao-para-registro-de-precos/)
- [Contratação direta na Lei 14.133/2021: dispensa e inexigibilidade explicadas — Schiefler Advocacia](https://schiefler.adv.br/contratacao-direta-na-lei-14-133-2021-dispensa-e-inexigibilidade-explicadas/)
- [Aplicação de metodologias ágeis na Gestão Pública: o método Kanban — CLP](https://clp.org.br/aplicacao-de-metodologias-ageis-na-gestao-publica-o-metodo-kanban/)
- [Revista do Serviço Público (ENAP) — Métodos ágeis no setor público](https://revista.enap.gov.br/index.php/RSP/article/download/4310/3322/19349)
- [How Gamification Boosts Employee Engagement — Bucketlist (2026)](https://bucketlistrewards.com/blog/gamification-employee-engagement-strategies-tools/)
- [Gamification and Time Management — Smartico](https://www.smartico.ai/blog-post/gamification-and-time-management)
- [How to Gamify Productivity? — Latenode](https://latenode.com/blog/implementation-guides-tutorials/getting-started-guides/how-to-gamify-productivity-best-tools-and-practices)
- [PROCESSO ADMINISTRATIVO: FLUXO COMPLETO E LEGISLAÇÕES — Wiki DCOM/UFSC](https://compras.wiki.ufsc.br/index.php/PROCESSO_ADMINISTRATIVO:_FLUXO_COMPLETO_E_LEGISLA%C3%87%C3%95ES)
- [Guia de Fluxos de Gestão e Fiscalização de Contratos Administrativos — CADE](https://cdn.cade.gov.br/Portal/centrais-de-conteudo/publicacoes/guias-e-manuais-administrativos-e-procedimentais/guia-de-fluxos-de-gestao-e-fiscalizacao-de-contratos-administrativos-do-cade.pdf)
- [Manual de Boas Práticas do SEI — CGU](https://repositorio.cgu.gov.br/bitstream/1/38788/15/MANUAL_BOAS_PRATICAS_SEI.pdf)
- [Caderno de Boas Práticas em Gestão e Fiscalização de Contratos — TJDFT](https://www.tjdft.jus.br/transparencia/governanca-institucional/governanca-de-aquisicoes/caderno-de-boas-praticas-em-gestao-e-fiscalizacao-de-contratos-do-tjdft.pdf)
