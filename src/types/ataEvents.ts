/**
 * Tipos de Domínio de Gestão de Eventos e Ciclos de Atas de Registro de Preços (SaldoARP — Fase 6.5)
 *
 * Princípios Fundamentais:
 * 1. FATO OFICIAL ≠ EVENTO ≠ WORKFLOW ≠ TAREFA
 * 2. Assistência, Não Decisão Jurídica (Badges, alertas e orientações sem bloqueios cegos)
 * 3. Preservação Estrita da Rastreabilidade e Transição Determinística de Ciclos
 * 4. Separação Ontológica: Ata de Registro de Preços ≠ Contrato Administrativo
 *
 * REGRA LEGAL CARDINAL (Lei 14.133/2021 c/c Decreto 11.462/2023, art. 23):
 * - É expressamente VEDADO acréscimo de quantitativos em Atas de Registro de Preços.
 * - Não existe "aditivo de acréscimo de 25%" na Ata.
 * - Remanejamento de quantitativos entre participantes é admitido na forma da lei (soma-zero).
 * - Acréscimos de até 25% (ou 50%) são privativos de CONTRATOS formais decorrentes da Ata (Art. 125).
 */

/**
 * 1. Naturezas / Tipos Canônicos de Eventos de Ata (Fatos Formais)
 * Note: ACRESCIMO e SUPRESSAO são deliberadamente ausentes da Ata.
 */
export type AtaEventType =
  | 'CELEBRACAO'              // Assinatura e publicação inicial da Ata
  | 'PRORROGACAO'            // Prorrogação da vigência da Ata (Art. 84, Lei 14.133/2021)
  | 'REAJUSTE'               // Reajuste em sentido estrito (índice oficial previsto em edital)
  | 'REPACTUACAO'            // Repactuação de custos de mão de obra exclusiva
  | 'REEQUILIBRIO'           // Revisão extraordinária / recomposição econômico-financeira
  | 'REMANEJAMENTO'          // Remanejamento de quantitativos entre órgãos (soma-zero)
  | 'APOSTILAMENTO'          // Alterações cadastrais, orçamentárias ou formais sem alteração do objeto
  | 'ENCERRAMENTO_ESCOPO'    // Extinção pelo consumo integral de todos os quantitativos
  | 'ENCERRAMENTO_VIGENCIA'; // Extinção pelo término do prazo de validade temporal

/**
 * 2. Instrumento formal que materializa o evento de Ata
 */
export type AtaEventNature =
  | 'ATA_INICIAL'
  | 'TERMO_ADITIVO_ATA'
  | 'TERMO_APOSTILAMENTO_ATA'
  | 'TERMO_REMANEJAMENTO'
  | 'REGISTRO_ADMINISTRATIVO_ATA';

/**
 * 3. Fonte de origem do evento
 */
export type AtaEventSource =
  | 'PNCP'
  | 'Compras.gov.br'
  | 'DOU'
  | 'SEI'
  | 'SaldoARP'
  | 'INTERNO';

/**
 * 4. Tipo de impacto formal do evento na Ata
 */
export type AtaEventImpact =
  | 'ALTERA_VIGENCIA_ATA'
  | 'ALTERA_PRECO_REGISTRADO'
  | 'REMANEJA_QUANTITATIVO'
  | 'ATUALIZA_DADOS_ATA'
  | 'EXTINGUE_ATA'
  | 'SEM_IMPACTO_FINANCEIRO_TEMPORAL';

/**
 * 5. Taxonomia de Oficialidade do Evento (Linhagem e Soberania dos Dados)
 */
export type AtaEventOficialidade =
  | 'FATO_OFICIAL'            // Publicado no PNCP, DOU ou sistema oficial soberano
  | 'DECISAO_INTERNA'         // Despacho de autoridade, parecer jurídico aprovado
  | 'PROPOSTA_ADMINISTRATIVA' // Pedido de reequilíbrio por fornecedor, ofício de remanejamento
  | 'DADO_INTERNO';           // Anotação operacional de controle do SaldoARP

/**
 * 6. Estados do Ciclo de Vida da Ata de Registro de Preços
 */
export type AtaLifecycleState =
  | 'VIGENTE'
  | 'EM_PRORROGACAO'
  | 'EM_REVISAO_PRECO'
  | 'EM_REMANEJAMENTO'
  | 'ESGOTADA'
  | 'EXPIRADA'
  | 'CANCELADA';

/**
 * 7. Interface do Evento de Ata (Fato Formal Ocorrido)
 */
export interface AtaEvent {
  /** Chave lógica canônica e determinística: ATA::{numeroAta}::{uasgGerenciadora}::{tipoEvento}::{identificadorOficial}::{cicloRef} */
  id: string;
  numeroAta: string;
  anoAta: number;
  uasgGerenciadora: string;
  numeroControlePncp?: string;

  tipoEvento: AtaEventType;
  naturezaInstrumento: AtaEventNature;
  oficialidade: AtaEventOficialidade;
  numeroSequencial?: number | string; // Ex: 1 para "1º Termo Aditivo de Prorrogação"
  identificadorOficial: string;       // Ex: "ADIT-01/2026", "REMAN-02/2026"
  descricao: string;

  // Datas formais
  dataAssinatura?: string;    // YYYY-MM-DD
  dataPublicacao?: string;    // YYYY-MM-DD
  dataVigenciaInicio?: string; // YYYY-MM-DD
  dataVigenciaFim?: string;    // YYYY-MM-DD

  // Impactos Formais no Instrumento de Ata
  impacto: AtaEventImpact;
  vigenciaAnterior?: string;
  vigenciaPosterior?: string;
  saldoDisponivelAnterior?: number;
  saldoDisponivelPosterior?: number;

  // Rastreabilidade e Origem Oficial
  fonteOrigem: AtaEventSource;
  processoSeiNumero?: string;
  linkPncp?: string;
  capturedAt: string;
  sourceUpdatedAt?: string;
  rawOfficialData?: any;
}

/**
 * 8. Status da Avaliação Assistida de Prorrogação de Vigência da Ata
 */
export type AtaProrrogationStatus =
  | 'PRONTA'
  | 'PENDENTE_PESQUISA_PRECO'
  | 'PENDENTE_CONCORDANCIA_FORNECEDOR'
  | 'SALDO_ESGOTADO_SEM_PREVISAO_EDITAL'
  | 'PRECO_DESVANTAJOSO'
  | 'IMPEDIDA';

/**
 * 9. Avaliação Assistida de Prorrogação de Vigência da Ata (Art. 84 da Lei 14.133/2021)
 *
 * Fundamentação:
 * - Vigência inicial de até 1 ano, prorrogável por igual período (teto global de 2 anos).
 * - Exige comprovação prévia de vantajosidade dos preços registrados.
 * - Saldo remanescente disponível OU previsão expressa em edital de renovação dos quantitativos (Parecer 75/2024 AGU).
 * - Anuência expressa do fornecedor beneficiário.
 * - SEMPRE assistência e orientação ao gestor, NUNCA bloqueio cego (Pode prosseguir com justificativa).
 */
export interface AtaProrrogationEvaluation {
  numeroAta: string;
  uasgGerenciadora: string;
  vigenciaAtual: string;
  novaVigenciaSugerida?: string;
  status: AtaProrrogationStatus;
  aptaParaProrrogacao: boolean;
  pesquisaPrecoVantajosa?: boolean;
  fornecedorConcordou?: boolean;
  saldoDisponivelTotal: number;
  editalPreveRenovacaoQuantitativos: boolean;
  fundamentacaoLegal: string;
  badge: {
    color: 'verde' | 'amarelo' | 'vermelho';
    label: string;
    orientacao: string;
  };
  alertas: string[];
  recomendacoes: string[];
  podeProsseguirComJustificativa: boolean;
}
