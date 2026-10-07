/**
 * Régua única dos alertas do CGLIC: todo limiar de saldo, prazo, vigência e pagamento usado para
 * classificar ou filtrar um alerta mora aqui. Telas e serviços importam daqui e NÃO escrevem o número.
 *
 * Só números de gestão interna: limites que vêm de lei ou decreto (adesão, aditivos, vedações da
 * Lei 14.133) não pertencem a este arquivo e não devem ser parametrizados.
 *
 * Módulo puro (sem imports) para poder ser carregado de qualquer camada. Os valores abaixo são os
 * padrões do sistema; a tela Administração > Regras de Alertas pode sobrepô-los (tabela alert_settings)
 * via `applyAlertRuleOverrides`, sem tocar nos consumidores. Por isso os consumidores LEEM os objetos
 * no momento do uso (nunca copiam o número para uma constante de módulo).
 */

// -----------------------------------------------------------------------------
// 1. Saldo físico do item da Ata (percentual CONSUMIDO do quantitativo SENASP)
// -----------------------------------------------------------------------------
export const SALDO_RULES = {
  /** Acima disso o saldo é crítico (resta menos de 20%). */
  criticoAcimaDePct: 80,
  /** Acima disso o saldo está em atenção (resta menos de 50%). */
  atencaoAcimaDePct: 50,
  /** A partir disso o saldo está esgotado. */
  esgotadoAPartirDePct: 100
};

// -----------------------------------------------------------------------------
// 2. Tarefas dos planos de gestão (dias ÚTEIS até o prazo)
// -----------------------------------------------------------------------------
export const TAREFA_RULES = {
  /** Vence hoje ou em até N dias úteis: urgente. */
  urgenteAteDias: 7,
  /** De urgenteAteDias+1 até N dias úteis: atenção. */
  atencaoAteDias: 30
};

// -----------------------------------------------------------------------------
// 3. Vigência: gatilhos, lembretes de planejamento e faixas das carteiras
// -----------------------------------------------------------------------------
export const VIGENCIA_RULES = {
  /** Antecedência dos gatilhos operacionais, em dias antes do fim da vigência. */
  gatilhoDias: {
    contratoProrrogacao: 180,
    consultaFornecedor: 120,
    contratoRemessaJuridica: 60,
    arpProrrogacao: 180,
    arpExaustao: 90
  },
  /** Prazo de resposta do fornecedor, em dias ÚTEIS após a consulta. */
  respostaFornecedorDiasUteis: 10,
  /** Lembretes de planejamento só aparecem dentro destas janelas (dias até o gatilho). */
  lembreteJanelaDias: { contrato: 60, ata: 90 },
  /** Faixas das carteiras e da Visão Geral. */
  faixaCriticoAteDias: 30,
  faixaAtencaoAteDias: 90,
  /** Divisão intermediária usada nos blocos de prazos da Visão Geral. */
  faixaIntermediariaDias: 60,
  /** Indicador aproximado de "contrato em prorrogação": vence em até N dias. */
  prorrogacaoAproximadaAteDias: 180,
  /** Status "A Vencer" do contrato e linha do tempo "próximo". */
  aVencerAteDias: 60,
  /** Ata "expirando": vence em até N dias. */
  ataExpirandoAteDias: 90
};

// -----------------------------------------------------------------------------
// 4. Motor temporal (nível de atenção de um prazo qualquer)
// -----------------------------------------------------------------------------
export const ATENCAO_NIVEL_RULES = {
  criticoAteDias: 15,
  atencaoAteDias: 60,
  /** "Vence em breve" no estado temporal. */
  venceEmBreveAteDias: 30
};

// -----------------------------------------------------------------------------
// 5. Radar de reajuste/repactuação
// -----------------------------------------------------------------------------
export const REAJUSTE_RULES = {
  /** O radar acende N dias antes do marco... */
  janelaAntesDias: 60,
  /** ...e segue por N dias depois dele. */
  janelaDepoisDias: 30,
  /** Dentro de N dias é urgente; antes disso, próximo. */
  urgenteAteDias: 30
};

// -----------------------------------------------------------------------------
// 6. Prorrogação contratual (orientações)
// -----------------------------------------------------------------------------
export const PRORROGACAO_RULES = {
  marcoProximoAteDias: 60,
  prazoCriticoAteDias: 15
};

// -----------------------------------------------------------------------------
// 7. Acompanhamento de pagamentos (dias ÚTEIS)
// -----------------------------------------------------------------------------
export const PAGAMENTO_RULES = {
  /** Vencimento em até N dias úteis: crítico. */
  criticoAteDiasUteis: 3,
  /** Vencimento em até N dias úteis: atenção. */
  atencaoAteDiasUteis: 7,
  /** Prazo padrão para a CGLIC conferir a documentação, contado do recebimento. */
  conferirPadraoDiasUteis: 5,
  /** Prazo padrão para a CGLIC enviar à CGOFI, contado da conferência. */
  enviarPadraoDiasUteis: 2,
  /** Avisar nas Ações quando faltar até N dias úteis para o prazo da etapa da CGLIC (conferir ou enviar). */
  etapaAvisoAteDiasUteis: 2,
  /** Cobrar a CGOFI quando o processo está há mais de N dias úteis sem Ordem Bancária. */
  cgofiSemRespostaAcimaDeDiasUteis: 5,
  /** IN SEGES 77/2022 art. 7º, I: liquidação em até N dias úteis do recebimento da nota (a data do atesto). */
  liquidacaoMaxDiasUteis: 10,
  /** IN SEGES 77/2022 art. 7º, II: pagamento em até N dias úteis da liquidação. */
  pagamentoMaxDiasUteis: 10,
  /** Portaria DGFNSP 50/2025 art. 5º: o processo chega com pelo menos N dias úteis antes do vencimento. */
  chegadaMinimaDiasUteis: 8
};

// -----------------------------------------------------------------------------
// 8. Atualização dos dados lidos da API
// -----------------------------------------------------------------------------
export const SINCRONIZACAO_RULES = {
  /** A quantidade contratada lida da API é relida quando passa de N horas. */
  quantidadeContratadaVencidaEmHoras: 6,
  /** Itens de contrato vigente são relidos da API quando a última leitura passa de N horas. */
  itensContratoVigenteRelidosEmHoras: 24,
  /** Contrato encerrado quase não muda: os itens são relidos a cada N dias. */
  itensContratoEncerradoRelidosEmDias: 30,
  /** Órgãos participantes de item de ata vigente: relidos do Compras.gov.br quando a última leitura passa de N horas. */
  unidadesItemVigenteRelidasEmHoras: 24,
  /** Ata encerrada quase não muda: os órgãos do item são relidos a cada N dias. */
  unidadesItemEncerradoRelidasEmDias: 30,
  /** Item ainda sem cópia (a API não trouxe órgãos): nova tentativa depois de N horas. */
  unidadesItemSemCopiaRelidasEmHoras: 6
};

// -----------------------------------------------------------------------------
// Funções de classificação (única implementação de cada régua)
// -----------------------------------------------------------------------------

export type TarefaPrazoNivel = 'VENCIDA' | 'URGENTE' | 'PROXIMA' | 'DISTANTE';

/** Nível de uma tarefa pelos dias até o prazo (negativo = vencida). */
export function classifyTarefaPrazo(dias: number): TarefaPrazoNivel {
  if (dias < 0) return 'VENCIDA';
  if (dias <= TAREFA_RULES.urgenteAteDias) return 'URGENTE';
  if (dias <= TAREFA_RULES.atencaoAteDias) return 'PROXIMA';
  return 'DISTANTE';
}

/** Dentro da janela de lembrete de planejamento? Atrasado sempre entra; encerrado nunca. */
export function isLembreteNaJanela(params: { diasRestantes: number; atrasado: boolean; isAta: boolean }): boolean {
  if (params.atrasado) return true;
  const janela = params.isAta ? VIGENCIA_RULES.lembreteJanelaDias.ata : VIGENCIA_RULES.lembreteJanelaDias.contrato;
  return params.diasRestantes >= 0 && params.diasRestantes <= janela;
}

// -----------------------------------------------------------------------------
// Parametrização (Administração > Regras de Alertas)
// -----------------------------------------------------------------------------

export type AlertRuleUnit = '%' | 'dias' | 'dias úteis' | 'horas';

export type AlertRuleGroupId = 'saldo' | 'tarefas' | 'vigencia' | 'motor' | 'reajuste' | 'prorrogacao' | 'pagamentos' | 'sincronizacao';

export interface AlertRuleDefinition {
  /** Chave estável gravada em alert_settings.key (caminho no objeto de regras). */
  key: string;
  group: AlertRuleGroupId;
  label: string;
  hint?: string;
  unit: AlertRuleUnit;
  min: number;
  max: number;
}

export const ALERT_RULE_GROUPS: Array<{ id: AlertRuleGroupId; label: string; description: string }> = [
  { id: 'saldo', label: 'Saldo dos itens da Ata', description: 'Percentual consumido do quantitativo SENASP que acende os alertas de saldo.' },
  { id: 'tarefas', label: 'Tarefas dos planos de gestão', description: 'Dias úteis até o prazo da tarefa (sem fins de semana, feriados e pontos facultativos). Tarefa vencida é sempre crítica.' },
  { id: 'vigencia', label: 'Vigência, lembretes e carteiras', description: 'Faixas de prazo das carteiras e da Visão Geral, janelas dos lembretes e antecedência dos gatilhos de planejamento.' },
  { id: 'motor', label: 'Nível de atenção dos prazos', description: 'Classificação de qualquer prazo em crítico, atenção ou normal.' },
  { id: 'reajuste', label: 'Radar de reajuste e repactuação', description: 'Janela em que o marco anual aparece no radar.' },
  { id: 'prorrogacao', label: 'Prorrogação contratual', description: 'Faixas usadas nas orientações de prorrogação.' },
  { id: 'pagamentos', label: 'Acompanhamento de pagamentos', description: 'Prazos em dias úteis das faturas e do processo na CGOFI.' },
  { id: 'sincronizacao', label: 'Atualização dos dados da API', description: 'Quando a quantidade contratada lida da API é relida.' }
];

export const ALERT_RULE_DEFINITIONS: AlertRuleDefinition[] = [
  { key: 'saldo.criticoAcimaDePct', group: 'saldo', label: 'Saldo crítico acima de', hint: 'Consumo acima deste percentual = crítico.', unit: '%', min: 1, max: 99 },
  { key: 'saldo.atencaoAcimaDePct', group: 'saldo', label: 'Saldo em atenção acima de', hint: 'Consumo acima deste percentual = atenção.', unit: '%', min: 1, max: 98 },

  { key: 'tarefa.urgenteAteDias', group: 'tarefas', label: 'Tarefa urgente até', hint: 'Vence hoje ou em até N dias úteis.', unit: 'dias úteis', min: 0, max: 60 },
  { key: 'tarefa.atencaoAteDias', group: 'tarefas', label: 'Tarefa em atenção até', hint: 'Depois do urgente, até N dias úteis.', unit: 'dias úteis', min: 1, max: 365 },

  { key: 'vigencia.faixaCriticoAteDias', group: 'vigencia', label: 'Vigência crítica até', hint: 'Faixa crítica das carteiras e da Visão Geral.', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.faixaIntermediariaDias', group: 'vigencia', label: 'Vigência, faixa intermediária até', hint: 'Divisão interna da faixa de atenção na Visão Geral.', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.faixaAtencaoAteDias', group: 'vigencia', label: 'Vigência em atenção até', hint: 'Faixa de atenção das carteiras.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.aVencerAteDias', group: 'vigencia', label: 'Contrato "A Vencer" até', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.ataExpirandoAteDias', group: 'vigencia', label: 'Ata "expirando" até', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.prorrogacaoAproximadaAteDias', group: 'vigencia', label: 'Indicador de prorrogação até', hint: 'Contratos que vencem em até N dias contam como "em prorrogação" na Visão Geral.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.lembreteJanelaDias.contrato', group: 'vigencia', label: 'Lembrete do contrato aparece em até', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.lembreteJanelaDias.ata', group: 'vigencia', label: 'Lembrete da ata aparece em até', unit: 'dias', min: 1, max: 365 },
  { key: 'vigencia.gatilhoDias.contratoProrrogacao', group: 'vigencia', label: 'Gatilho de prorrogação do contrato', hint: 'Dias antes do fim da vigência.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.gatilhoDias.consultaFornecedor', group: 'vigencia', label: 'Gatilho de consulta ao fornecedor', hint: 'Dias antes do fim da vigência.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.gatilhoDias.contratoRemessaJuridica', group: 'vigencia', label: 'Gatilho de remessa jurídica do contrato', hint: 'Dias antes do fim da vigência.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.gatilhoDias.arpProrrogacao', group: 'vigencia', label: 'Gatilho de prorrogação da ata', hint: 'Dias antes do fim da vigência.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.gatilhoDias.arpExaustao', group: 'vigencia', label: 'Gatilho de exaustão da ata', hint: 'Dias antes do fim da vigência.', unit: 'dias', min: 1, max: 730 },
  { key: 'vigencia.respostaFornecedorDiasUteis', group: 'vigencia', label: 'Prazo de resposta do fornecedor', unit: 'dias úteis', min: 1, max: 60 },

  { key: 'atencaoNivel.criticoAteDias', group: 'motor', label: 'Prazo crítico até', unit: 'dias', min: 0, max: 365 },
  { key: 'atencaoNivel.atencaoAteDias', group: 'motor', label: 'Prazo em atenção até', unit: 'dias', min: 1, max: 365 },
  { key: 'atencaoNivel.venceEmBreveAteDias', group: 'motor', label: '"Vence em breve" até', unit: 'dias', min: 1, max: 365 },

  { key: 'reajuste.janelaAntesDias', group: 'reajuste', label: 'Radar acende antes do marco', unit: 'dias', min: 1, max: 365 },
  { key: 'reajuste.janelaDepoisDias', group: 'reajuste', label: 'Radar segue depois do marco', unit: 'dias', min: 0, max: 365 },
  { key: 'reajuste.urgenteAteDias', group: 'reajuste', label: 'Radar urgente até', unit: 'dias', min: 1, max: 365 },

  { key: 'prorrogacao.marcoProximoAteDias', group: 'prorrogacao', label: 'Marco de reajuste próximo até', unit: 'dias', min: 1, max: 365 },
  { key: 'prorrogacao.prazoCriticoAteDias', group: 'prorrogacao', label: 'Prazo de vigência crítico até', unit: 'dias', min: 1, max: 365 },

  { key: 'pagamento.criticoAteDiasUteis', group: 'pagamentos', label: 'Fatura crítica até', hint: 'Dias úteis até o vencimento.', unit: 'dias úteis', min: 0, max: 30 },
  { key: 'pagamento.atencaoAteDiasUteis', group: 'pagamentos', label: 'Fatura em atenção até', hint: 'Dias úteis até o vencimento.', unit: 'dias úteis', min: 1, max: 60 },
  { key: 'pagamento.conferirPadraoDiasUteis', group: 'pagamentos', label: 'Prazo padrão para conferir a documentação', hint: 'Dias úteis desde o recebimento. O gestor pode alongar com justificativa.', unit: 'dias úteis', min: 1, max: 30 },
  { key: 'pagamento.enviarPadraoDiasUteis', group: 'pagamentos', label: 'Prazo padrão para enviar à CGOFI', hint: 'Dias úteis desde a conferência. O gestor pode alongar com justificativa.', unit: 'dias úteis', min: 1, max: 30 },
  { key: 'pagamento.etapaAvisoAteDiasUteis', group: 'pagamentos', label: 'Avisar o prazo da etapa quando faltar', hint: 'Dias úteis para conferir ou enviar à CGOFI. Depois do prazo, o aviso fica urgente.', unit: 'dias úteis', min: 0, max: 15 },
  { key: 'pagamento.cgofiSemRespostaAcimaDeDiasUteis', group: 'pagamentos', label: 'Cobrar a CGOFI após', hint: 'Dias úteis desde o envio sem ordem bancária.', unit: 'dias úteis', min: 1, max: 60 },
  { key: 'pagamento.liquidacaoMaxDiasUteis', group: 'pagamentos', label: 'Prazo de liquidação', hint: 'Do atesto à liquidação no SIAFI (IN 77, art. 7º, I).', unit: 'dias úteis', min: 1, max: 30 },
  { key: 'pagamento.pagamentoMaxDiasUteis', group: 'pagamentos', label: 'Prazo de pagamento', hint: 'Da liquidação à ordem bancária (IN 77, art. 7º, II).', unit: 'dias úteis', min: 1, max: 30 },
  { key: 'pagamento.chegadaMinimaDiasUteis', group: 'pagamentos', label: 'Chegada mínima antes do vencimento', hint: 'Antecedência do processo em relação ao vencimento (Portaria DGFNSP 50/2025, art. 5º).', unit: 'dias úteis', min: 0, max: 30 },

  { key: 'sincronizacao.quantidadeContratadaVencidaEmHoras', group: 'sincronizacao', label: 'Reler a quantidade contratada após', unit: 'horas', min: 1, max: 168 }
];

// Chave do alerta -> objeto de regras que a guarda.
const RULE_TARGETS: Record<string, Record<string, any>> = {
  saldo: SALDO_RULES,
  tarefa: TAREFA_RULES,
  vigencia: VIGENCIA_RULES,
  atencaoNivel: ATENCAO_NIVEL_RULES,
  reajuste: REAJUSTE_RULES,
  prorrogacao: PRORROGACAO_RULES,
  pagamento: PAGAMENTO_RULES,
  sincronizacao: SINCRONIZACAO_RULES
};

function resolve(key: string): { holder: Record<string, any>; prop: string } | null {
  const [root, ...path] = key.split('.');
  let holder: Record<string, any> | undefined = RULE_TARGETS[root];
  if (!holder || path.length === 0) return null;
  for (const segment of path.slice(0, -1)) {
    holder = holder?.[segment];
    if (!holder) return null;
  }
  const prop = path[path.length - 1];
  return typeof holder[prop] === 'number' ? { holder, prop } : null;
}

/** Valores de fábrica, congelados na carga do módulo (antes de qualquer sobreposição). */
function readRule(key: string): number {
  const target = resolve(key)!;
  return target.holder[target.prop] as number;
}

export const ALERT_RULE_DEFAULTS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(ALERT_RULE_DEFINITIONS.map((d) => [d.key, readRule(d.key)]))
);

/** Valores em vigor agora (padrão + sobreposições aplicadas). */
export function getAlertRuleValues(): Record<string, number> {
  return Object.fromEntries(ALERT_RULE_DEFINITIONS.map((d) => [d.key, readRule(d.key)]));
}

/** Sobrepõe valores. Chaves desconhecidas ou não numéricas são ignoradas; o resto volta ao padrão. */
export function applyAlertRuleOverrides(overrides: Record<string, unknown> = {}): void {
  for (const def of ALERT_RULE_DEFINITIONS) {
    const target = resolve(def.key)!;
    const raw = overrides[def.key];
    const value = typeof raw === 'string' ? Number(raw) : raw;
    target.holder[target.prop] =
      typeof value === 'number' && Number.isFinite(value) ? value : ALERT_RULE_DEFAULTS[def.key];
  }
}

/** Valida limites individuais e a coerência entre faixas. Devolve mensagens por chave ('' = geral). */
export function validateAlertRuleValues(values: Record<string, number>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of ALERT_RULE_DEFINITIONS) {
    const v = values[def.key];
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
      errors[def.key] = 'Informe um número inteiro.';
    } else if (v < def.min || v > def.max) {
      errors[def.key] = `Use um valor entre ${def.min} e ${def.max}.`;
    }
  }
  const order = (smaller: string, larger: string, message: string) => {
    if (!errors[larger] && !errors[smaller] && values[smaller] >= values[larger]) errors[larger] = message;
  };
  order('saldo.atencaoAcimaDePct', 'saldo.criticoAcimaDePct', 'O limite crítico deve ser maior que o de atenção.');
  order('tarefa.urgenteAteDias', 'tarefa.atencaoAteDias', 'O prazo de atenção deve ser maior que o urgente.');
  order('vigencia.faixaCriticoAteDias', 'vigencia.faixaIntermediariaDias', 'A faixa intermediária deve ser maior que a crítica.');
  order('vigencia.faixaIntermediariaDias', 'vigencia.faixaAtencaoAteDias', 'A faixa de atenção deve ser maior que a intermediária.');
  order('atencaoNivel.criticoAteDias', 'atencaoNivel.atencaoAteDias', 'O prazo de atenção deve ser maior que o crítico.');
  order('pagamento.criticoAteDiasUteis', 'pagamento.atencaoAteDiasUteis', 'O prazo de atenção deve ser maior que o crítico.');
  order('prorrogacao.prazoCriticoAteDias', 'prorrogacao.marcoProximoAteDias', 'O marco próximo deve ser maior que o prazo crítico.');
  if (!errors['reajuste.urgenteAteDias'] && !errors['reajuste.janelaAntesDias'] && values['reajuste.urgenteAteDias'] >= values['reajuste.janelaAntesDias']) {
    errors['reajuste.urgenteAteDias'] = 'O limite urgente deve ser menor que a janela antes do marco.';
  }
  return errors;
}
