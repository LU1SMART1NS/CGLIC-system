/**
 * Tipos de Domínio do Dashboard Gerencial (CGLIC 3.0 — Fase 8-B)
 *
 * Princípios Fundamentais:
 * 1. O Dashboard é uma camada de leitura e agregação determinística — nunca uma nova fonte de dados.
 * 2. Separação Estrita de Domínios: Quantidade Física de Ata ≠ Valor Contratual ≠ Execução Financeira ≠ Trabalho Operacional.
 * 3. Todas as grandezas são obtidas dos SSOTs oficiais e consolidados.
 */

import type { SyncMetadata } from './index';
import type { ReajusteRadarAlert } from './contractReajusteRadar';
import type { CentralPrazosKPIs } from './centralPrazos';
import type { PaymentFollowUpCycle } from './paymentFollowUp';

/**
 * 1. Bloco de KPIs Executivos
 */
export interface ManagementDashboardExecutiveKPIs {
  totalContratos: number;
  contratosAtivos: number;
  contratosEncerrados: number;
  contratosEmProrrogacao: number;
  valorOriginalTotal: number;
  valorVigenteTotal: number;
  deltaAcumuladoTotal: number;
  percentualVariacaoAcumulada: number;
}

/**
 * 2. Bloco de Prazos e Vigência Contratual
 */
export interface ManagementDashboardDeadlinesSummary {
  vencendo30Dias: number;
  vencendo60Dias: number;
  vencendo90Dias: number;
  contratosVencidos: number;
  prorrogaçõesEmCurso: number;
  itensVencendo: Array<{
    contractKey: string;
    numeroContrato: string;
    anoContrato?: number;
    fornecedorNome?: string;
    dataVigenciaFim: string;
    diasRestantes: number;
    faixa: '30D' | '60D' | '90D' | 'VENCIDO';
  }>;
}

export type DashboardAttentionCategory =
  | 'TAREFA_ATRASADA'
  | 'TAREFA_PROXIMA'
  | 'PAGAMENTO_CRITICO'
  /** Expectativa de pagamento: previsão mensal a enviar, nota mensal que não chegou, entrega prevista sem nota. */
  | 'PAGAMENTO_PREVISTO'
  | 'REAJUSTE_RADAR'
  | 'ATA_CRITICA'
  | 'LEMBRETE';

export type DashboardAttentionSeverity = 'CRITICA' | 'URGENTE' | 'ATENCAO' | 'INFO';

export interface DashboardAttentionItem {
  id: string;
  category: DashboardAttentionCategory;
  severity: DashboardAttentionSeverity;
  title: string;
  description?: string;
  contractKey?: string;
  numeroContrato?: string;
  arpKey?: string;
  numeroAta?: string;
  cycleKey?: string;
  taskId?: string;
  diasRelevantes?: number;
  dataAlvo?: string;
  targetUrl?: string;
  badgeLabel?: string;
  /**
   * Chave para marcar o aviso como resolvido (avisosResolvidosService): saldo, reajuste e lembrete.
   * Tarefa se resolve concluindo-a; pagamento, registrando a etapa (sem chave).
   */
  avisoChave?: string;
  /** Alertas de saldo: descrição do item da Ata e seu fornecedor (a coluna Objeto/Fornecedor prefere estes). */
  objetoItem?: string;
  fornecedorNome?: string;
}

/**
 * 3. Bloco "Atenção Agora" (Resumo Operacional Crítico)
 */
export interface ManagementDashboardAttentionSummary {
  totalAlertasAtivos: number;
  criticalCount: number;
  overdueTasksCount: number;
  upcomingTasksCount: number;
  paymentAlertsCount: number;
  reajusteAlertsCount: number;
  atasCriticasCount: number;
  radarsReajuste: ReajusteRadarAlert[];
  radarsUrgentesCount: number;
  pagamentosCriticosCount: number;
  tarefasVencidasCount: number;
  prazosKpis: CentralPrazosKPIs;
  items: DashboardAttentionItem[];
  /** Avisos marcados como resolvidos (avisos_resolvidos): fora de items e das contagens. */
  resolvidos?: DashboardAttentionItem[];
}

export interface ManagementDashboardEmpenhoDetail {
  empenhoKey: string;
  numeroEmpenho: string;
  ano?: number;
  contratoNumero?: string;
  fornecedorNome?: string;
  valorEmpenhado: number;
  valorLiquidado: number;
  valorPago: number;
  saldoALiquidar: number;
  saldoAPagar: number;
  saldoNaoExecutado: number;
  percentualExecutado: number;
}

/**
 * 4. Bloco de Execução Orçamentária e Financeira Oficial
 */
export interface ManagementDashboardFinancialSummary {
  totalEmpenhado: number;
  totalLiquidado: number;
  totalPago: number;
  saldoALiquidar: number;
  saldoAPagar: number;
  saldoNaoExecutado: number;
  totalRpInscrito: number;
  totalRpPago: number;
  saldoRpPendente: number;
  rppInscrito?: number;
  rppPago?: number;
  rpnpInscrito?: number;
  rpnpPago?: number;
  taxaLiquidacaoPercentual: number;
  taxaPagamentoPercentual: number;
  taxaPagamentoSobreEmpenhadoPercentual?: number;
  topEmpenhos?: ManagementDashboardEmpenhoDetail[];
  // Indicador futuro (Fase 8-F)
  burnRateMensalDisponivel: boolean;
}

/**
 * 5. Bloco de Saldos Físicos de Ata de Registro de Preços (ARP)
 */
export interface ManagementDashboardArpItemSummary {
  itemKey: string;
  numeroAta: string;
  codigoUasg?: string;
  numeroItem: number | string;
  descricaoItem?: string;
  fornecedorNome?: string;
  quantidadeHomologada: number;
  quantidadeConsumida: number;
  saldoDisponivel: number;
  percentualConsumido: number;
  isCritico: boolean; // percentualConsumido > 80%
  isProximoLimite?: boolean; // 50% < percentualConsumido <= 80%
  totalEmpenhosVinculados?: number;
  contractKey?: string;
}

export interface ManagementDashboardArpSummary {
  totalAtas: number;
  totalItens: number;
  itensCriticosCount: number; // Consumo > 80%
  itensProximosLimiteCount?: number; // 50% < Consumo <= 80%
  quantidadeHomologadaTotal?: number;
  quantidadeEmpenhadaTotal?: number;
  saldoFisicoTotal?: number;
  percentualConsumoGlobal?: number;
  topItensConsumidos: ManagementDashboardArpItemSummary[];
  itensCriticosDetalhe?: ManagementDashboardArpItemSummary[];
}

/**
 * 6. Bloco de Acompanhamento de Faturamento e Pagamentos
 */
export interface ManagementDashboardPaymentsSummary {
  totalCiclos: number;
  ciclosAbertosCount: number;
  ciclosConcluidosCount: number;
  ciclosCriticosCount: number; // Prazos <= 3 dias úteis ou vencidos
  ciclosAtrasoCgofiCount: number; // Sem resposta CGOFI > 5 dias úteis
  faturasVencidasCount?: number;
  faturasVenceHojeCount?: number;
  faturasProximasVencimentoCount?: number;
  envioCgofiAtrasadoCount?: number;
  documentacaoPendenteCount?: number;
  margemEnvioEstreitaCount?: number;
  distribuicaoPorEstado?: Record<string, number>;
  ciclosRecentes: PaymentFollowUpCycle[];
  ciclosAbertosDetalhe?: PaymentFollowUpCycle[];
  // Indicador de Desempenho CGOFI (Fase 8-H)
  tempoMedioCgofiDisponivel: boolean;
  tempoMedioCgofiDias?: number;
}

export interface ManagementDashboardFilters {
  uasg?: string;
  contractKey?: string;
  numeroAta?: string;
  statusContrato?: 'TODOS' | 'ATIVO' | 'ENCERRADO' | 'EM_PRORROGACAO';
  /**
   * Escopo ASSIGNED do perfil "gestor" (role_domain_scopes.contracts, migration
   * 20260925000023): quando informado, restringe TODA a base (contratos,
   * empenhos, ciclos de pagamento, itens de ARP vinculados, planos de tarefa)
   * às chaves aqui listadas antes de qualquer outro filtro ser aplicado. Não
   * confundir com `contractKey` (seleção pontual de um único contrato na UI).
   */
  assignedContractKeys?: string[];
  /**
   * Atas atribuídas ao gestor (public.ata_managers, migration 20260929000038),
   * já incluindo as Atas dos seus contratos atribuídos diretamente — ver
   * useAssignedManagementScope. Usado para recortar os itens/saldos físicos
   * de ARP pela Ata inteira, não só pela fatia ligada a `assignedContractKeys`.
   */
  assignedAtaKeys?: string[];
}

export interface ManagementDashboardFilterOption {
  key: string;
  label: string;
  sublabel?: string;
}

export interface ManagementDashboardAvailableFilters {
  contracts: ManagementDashboardFilterOption[];
  atas: ManagementDashboardFilterOption[];
}

/**
 * Read Model Unificado do Dashboard Gerencial
 */
export interface ManagementDashboardReadModel {
  uasg: string;
  dataCalculo: string; // ISO timestamp
  executive: ManagementDashboardExecutiveKPIs;
  deadlines: ManagementDashboardDeadlinesSummary;
  attention: ManagementDashboardAttentionSummary;
  financial: ManagementDashboardFinancialSummary;
  arp: ManagementDashboardArpSummary;
  payments: ManagementDashboardPaymentsSummary;
  filtersApplied?: ManagementDashboardFilters;
  availableFilters?: ManagementDashboardAvailableFilters;
  syncInfo?: SyncMetadata;
}
