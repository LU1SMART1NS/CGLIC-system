/**
 * Tipos de Domínio da Central de Prazos e Tarefas (SaldoARP — Fase 3)
 */

import type { TemporalStatus, AtencaoNivel, RegraOrigemTipo, ExplicabilidadePrazo } from './temporal';
import type { ContractTaskStatusValue } from './index';

export type CentralPrazosItemTipo = 'GATILHO_OPERACIONAL' | 'TAREFA_HUMANA' | 'MARCO_CONTRATUAL';

export type EntidadeOrigemTipo = 'CONTRATO' | 'ARP';

export type CentralPrazosTab =
  | 'TODAS'
  | 'ATRASADAS'
  | 'HOJE'
  | 'SETE_DIAS'
  | 'TRINTA_DIAS'
  | 'FUTURAS'
  | 'MINHAS';

export interface CentralPrazosItem {
  /** Chave lógica determinística de idempotência (ex: CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20261130) */
  id: string;
  tipoItem: CentralPrazosItemTipo;
  entidadeOrigem: EntidadeOrigemTipo;
  contractKey?: string;
  arpKey?: string;
  identificadorFormatado: string; // Ex: "Contrato 15/2026" ou "ARP 00049/2025"
  uasg: string;
  objetoResumido?: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  processoNumero?: string;

  // Marco e Temporalidade
  marcoEvento: string; // Ex: "Término da Vigência", "Reajuste Periódico", "Vigência da Ata"
  dataBase: string; // YYYY-MM-DD
  fonteDataBase: string; // "Contratos.gov.br" | "Compras.gov.br" | "PNCP" | "Interno"
  regraNome: string;
  regraTipo: RegraOrigemTipo; // OPERACIONAL | CONTRATUAL | EDITAL | INTERNA | LEGAL
  dataAlvo: string; // YYYY-MM-DD
  diasRestantes: number;
  estadoTemporal: TemporalStatus; // FUTURO | VENCE_EM_BREVE | VENCE_HOJE | ATRASADO | CONCLUIDO
  nivelAtencao: AtencaoNivel; // NORMAL | ATENCAO | CRITICO

  // Atribuição e Ação
  responsavelNome?: string;
  isGestorContrato?: boolean;
  acaoDescricao: string;

  // Vínculo com Tarefa Persistida (quando existir)
  tarefaId?: string;
  tarefaStatus?: ContractTaskStatusValue; // PENDENTE | EM_ANDAMENTO | CONCLUIDA | NAO_APLICAVEL
  observacoes?: string;

  // Ficha de Explicabilidade Transparente
  explicabilidade: ExplicabilidadePrazo;
}

export interface CentralPrazosKPIs {
  total: number;
  atrasadas: number;
  venceHoje: number;
  proximos7Dias: number;
  proximos30Dias: number;
  futuras: number;
  concluidas: number;
}

export interface CentralPrazosFilterParams {
  tab: CentralPrazosTab;
  busca: string;
  responsavel: string;
  uasg: string;
  entidadeTipo: 'TODOS' | 'CONTRATO' | 'ARP';
  statusTarefa: 'TODOS' | 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'SEM_TAREFA';
  nivelAtencao: 'TODOS' | 'CRITICO' | 'ATENCAO' | 'NORMAL';
  usuarioAtual?: string;
}
