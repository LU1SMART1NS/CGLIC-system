/**
 * Tipos de Domínio de Extinção, Encerramento e Rescisão Contratual (SaldoARP — Fase 4.4A)
 *
 * Princípios Fundamentais:
 * 1. FIM DA VIGÊNCIA ≠ ENCERRAMENTO FORMAL ≠ EXTINÇÃO CONTRATUAL
 * 2. TERMO DE RECEBIMENTO DEFINITIVO (TRD) = Instrumento Formal de Atesto, cuja ausência é PENDÊNCIA OPERACIONAL (não tipo jurídico novo)
 * 3. TAREFA CONCLUÍDA ≠ FATO OFICIAL
 * 4. DECISÃO INTERNA ≠ PUBLICAÇÃO OFICIAL SOBERANA
 * 5. FATO OFICIAL → EVENTO → WORKFLOW → TAREFA
 */

import type { AmendmentOfficialityClassification } from './contractAmendments';

/**
 * 1. Modalidades Jurídicas Canônicas de Extinção Contratual
 */
export type ContractExtinctionType =
  | 'EXTINCAO_ORDINARIA'           // Cumprimento regular do objeto e encerramento normal
  | 'EXTINCAO_UNILATERAL'          // Rescisão unilateral pela Administração (art. 137, I/art. 138, I da Lei 14.133/21)
  | 'EXTINCAO_CONSENSUAL'           // Rescisão consensual / distrato bilateral (art. 138, II da Lei 14.133/21)
  | 'EXTINCAO_JUDICIAL_ARBITRAL';   // Rescisão determinada por sentença judicial ou laudo arbitral (art. 138, III)

/**
 * 2. Instrumentos Formais de Extinção Contratual
 * NOTA: O instrumento formal é opcional durante a instrução e exigível apenas na formalização/publicação.
 */
export type ContractExtinctionInstrument =
  | 'TERMO_RECEBIMENTO_DEFINITIVO'
  | 'TERMO_ENCERRAMENTO'
  | 'TERMO_EXTINCAO_CONTRATUAL'
  | 'ATO_UNILATERAL'
  | 'INSTRUMENTO_CONSENSUAL'
  | 'DECISAO_JUDICIAL'
  | 'DECISAO_ARBITRAL'
  | 'OUTRO';

/**
 * 3. Situações Operacionais Assistivas do Domínio (Ciclo de Encerramento e Extinção)
 * Representa o estado fático do contrato no SaldoARP sem sobrescrever o lifecycle global soberano.
 */
export type ContractClosureOperationalState =
  | 'VIGENTE'
  | 'FIM_VIGENCIA'
  | 'EM_ANALISE_ENCERRAMENTO'
  | 'PENDENCIAS_POS_VIGENCIA'
  | 'AGUARDANDO_RECEBIMENTO_DEFINITIVO'
  | 'AGUARDANDO_QUITACAO'
  | 'AGUARDANDO_LIBERACAO_GARANTIA'
  | 'EM_INSTRUCAO_EXTINCAO'
  | 'EXTINCAO_AGUARDANDO_CONFIRMACAO'
  | 'ENCERRADO'
  | 'EXTINTO';

/**
 * 4. Checklist Assistido de Encerramento e Obrigações Finais
 * Auxilia a fiscalização e a gestão de contratos a rastrear pendências sem automação cega de quitação.
 */
export interface ContractClosureChecklist {
  // Recebimento do Objeto (Art. 140 da Lei 14.133/21)
  objetoRecebidoProvisorio?: boolean;
  dataRecebimentoProvisorio?: string;
  objetoRecebidoDefinitivo?: boolean;
  dataRecebimentoDefinitivo?: string;
  termoRecebimentoDefinitivoSei?: string;
  pendenciasExecucaoIdentificadas?: boolean;
  descricaoPendenciasExecucao?: string;

  // Liquidação, Pagamentos e Saldos
  pagamentosPendentes?: boolean;
  saldoFinanceiroRemanescente?: number;
  empenhosRemanescentesParaEstorno?: boolean;
  valorEstornoProposto?: number;

  // Garantia Contratual (Art. 96 a 102 da Lei 14.133/21)
  garantiaExigida?: boolean;
  garantiaLiberada?: boolean;
  documentoLiberacaoGarantiaSei?: string;

  // Obrigações Remanescentes e Regularidade
  obrigacoesPosContratuaisPendentes?: boolean;
  pendenciasTrabalhistasFiscais?: boolean;
  regularidadeSicafFinalVerificada?: boolean;
  relatorioFiscalizacaoFinalSei?: string;
  processoSeiArquivado?: boolean;
}

/**
 * 5. Motivação e Enquadramento da Extinção Antecipada / Rescisão
 * Registra dados instrutórios sem substituir a análise e decisão jurídica da autoridade/CONJUR.
 */
export interface ExtinctionMotivation {
  fundamentoLegal?: string; // Ex: "Art. 137, inciso I da Lei nº 14.133/2021"
  descricaoMotivo?: string;
  referenciaNormativa?: string;
  documentoSeiComprobatorio?: string;
  processoSeiNumero?: string;
  decisaoAdministrativaNumero?: string;
  parecerJuridicoNumero?: string;
  contraditorioAmplaDefesaAssegurado?: boolean;
  processoSancionadorInstaurado?: boolean;
  penalidadesEmApuracao?: string[];
  observacoes?: string;
}

/**
 * 6. Status da Avaliação Assistida de Prontidão para Encerramento / Extinção
 */
export type ExtinctionReadinessStatus =
  | 'PRONTO_PARA_ENCERRAMENTO'
  | 'PENDENCIAS_IMPEDITIVAS'
  | 'INFORMACOES_INSUFICIENTES'
  | 'REQUER_ANALISE';

export interface ContractClosureEvaluationResult {
  status: ExtinctionReadinessStatus;
  pendenciasIdentificadas: string[];
  orientacoesAssistivas: string[];
  podeProsseguirComJustificativa: boolean; // Sempre TRUE (assistência, sem bloqueio cego)
}

/**
 * 7. Entidade Canônica do Domínio de Extinção / Encerramento Contratual
 */
export interface ContractExtinctionDomain {
  /** Chave determinística: EXTINCAO::{contractKey}::{tipoExtincao}::{cycleRef}{::identificador} */
  id: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string;

  tipoExtincao: ContractExtinctionType;
  situacaoOperacional: ContractClosureOperationalState;
  instrumentoFormal?: ContractExtinctionInstrument;
  identificadorInstrumento?: string; // Ex: "TRD nº 01/2026" ou "Termo de Rescisão nº 02/2026"
  dataEfeitoExtincao?: string; // YYYY-MM-DD

  // Checklist e Motivação
  checklist: ContractClosureChecklist;
  motivacao?: ExtinctionMotivation;
  avaliacaoProntidao: ContractClosureEvaluationResult;

  // Oficialidade e Rastreabilidade
  oficialidade: AmendmentOfficialityClassification;
  processoSeiId?: string;
  processoSeiNumero?: string;
  linkPncp?: string;
  observacoes?: string;
}
