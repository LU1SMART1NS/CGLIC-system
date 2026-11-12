import type { AvisoDaEntrega, EntregaFiscalizacao, EtapaEntrega } from '../services/fiscalizacaoService';
import { dataBR, hojeEmBrasilia } from './fiscalizacao';

/** O que mudou no pedido de emenda depois da entrega (migration 274), em uma frase. */
export function textoDoAviso(a: AvisoDaEntrega): string {
  if (a.tipo === 'OUTRO_CONTRATO') return `A nota deste item passou ao contrato ${a.contrato}`;
  const quando = [a.data ? `em ${dataBR(a.data)}` : null, a.sei ? `SEI ${a.sei}` : null].filter(Boolean).join(' · ');
  return `Empenho anulado no pedido${quando ? ` ${quando}` : ''}: o item foi cancelado`;
}

/** Fases e etapas da entrega (protótipo aprovado em 10/11/2026; migration 260). */
export type FaseEntrega = 'PREPARACAO' | 'EXECUCAO' | 'RECEBIMENTO' | 'PAGAMENTO' | 'FINALIZADO';

export const FASES_ENTREGA: { id: Exclude<FaseEntrega, 'FINALIZADO'>; nome: string }[] = [
  { id: 'PREPARACAO', nome: 'Preparação' },
  { id: 'EXECUCAO', nome: 'Execução' },
  { id: 'RECEBIMENTO', nome: 'Recebimento' },
  { id: 'PAGAMENTO', nome: 'Pagamento e doação' }
];

export interface EtapaDef {
  id: EtapaEntrega;
  fase: FaseEntrega;
  nome: string;
  /** A etapa tem documento no SEI (o número é obrigatório). */
  sei: boolean;
}

export const ETAPAS_ENTREGA: EtapaDef[] = [
  { id: 'INFO_PEDIDA', fase: 'PREPARACAO', nome: 'Aguardando informações', sei: false },
  { id: 'INFO_ENVIADA', fase: 'PREPARACAO', nome: 'Informações recebidas', sei: true },
  { id: 'ORDEM', fase: 'PREPARACAO', nome: 'Ordem de Fornecimento enviada', sei: true },
  { id: 'PRODUCAO', fase: 'EXECUCAO', nome: 'Em produção', sei: false },
  { id: 'CONTROLADO', fase: 'EXECUCAO', nome: 'Aguardando o Exército', sei: false },
  { id: 'TRANSITO', fase: 'EXECUCAO', nome: 'Em trânsito', sei: false },
  { id: 'RETIRADA', fase: 'EXECUCAO', nome: 'Aguardando retirada', sei: false },
  { id: 'ENTREGUE', fase: 'RECEBIMENTO', nome: 'Entregue', sei: false },
  { id: 'TRP', fase: 'RECEBIMENTO', nome: 'Recebimento provisório', sei: true },
  { id: 'TRD', fase: 'RECEBIMENTO', nome: 'Recebimento definitivo', sei: true },
  { id: 'PAGAMENTO', fase: 'PAGAMENTO', nome: 'Enviado para pagamento e doação', sei: true },
  { id: 'SAL', fase: 'PAGAMENTO', nome: 'Ofício à SAL', sei: true },
  { id: 'FINALIZADO', fase: 'FINALIZADO', nome: 'Finalizado', sei: false }
];

export function etapaDef(id: EtapaEntrega): EtapaDef {
  return ETAPAS_ENTREGA.find((e) => e.id === id) ?? ETAPAS_ENTREGA[0];
}

export const ordemDaEtapa = (id: EtapaEntrega) => ETAPAS_ENTREGA.findIndex((e) => e.id === id);

/** A fiscalização do item acabou: Ofício à SAL (emenda) ou Finalizado (sem emenda). */
export const itemConcluido = (e: Pick<EntregaFiscalizacao, 'etapa'>) => e.etapa === 'SAL' || e.etapa === 'FINALIZADO';

/** Já chegou ao beneficiário (Entregue em diante). */
export const foiEntregue = (e: Pick<EntregaFiscalizacao, 'etapa'>) => ordemDaEtapa(e.etapa) >= ordemDaEtapa('ENTREGUE');

export type TomPrazo = 'danger' | 'warning' | 'success' | 'neutral';

/**
 * Prazo da entrega pela data prevista (P4): vencida, vence em 30 dias, no prazo, entregue (com ou sem atraso).
 * Aguardando o Exército, o prazo do fornecedor fica suspenso: a espera é da autorização da DFPC, não dele. O item não
 * conta como vencido nem como a vencer enquanto espera.
 */
export function prazoDaEntrega(e: Pick<EntregaFiscalizacao, 'etapa' | 'prevista' | 'entregueEm' | 'responsavel'>, hoje: string = hojeEmBrasilia()): { texto: string; tom: TomPrazo; dias: number | null } {
  if (e.responsavel === 'AREA') return { texto: 'Sem acompanhamento', tom: 'neutral', dias: null };
  const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);
  if (foiEntregue(e)) {
    if (e.entregueEm && e.prevista && e.entregueEm > e.prevista) return { texto: `Entregue com ${dias(e.entregueEm, e.prevista)} dias de atraso`, tom: 'warning', dias: null };
    return { texto: 'Entregue', tom: 'success', dias: null };
  }
  if (e.etapa === 'CONTROLADO') return { texto: 'Prazo suspenso', tom: 'neutral', dias: null };
  if (!e.prevista) return { texto: 'Sem data prevista', tom: 'neutral', dias: null };
  const d = dias(e.prevista, hoje);
  if (d < 0) return { texto: `Vencida há ${-d} ${d === -1 ? 'dia' : 'dias'}`, tom: 'danger', dias: d };
  if (d <= 30) return { texto: d === 0 ? 'Vence hoje' : `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}`, tom: 'warning', dias: d };
  return { texto: 'No prazo', tom: 'neutral', dias: d };
}

/**
 * O que impede a mudança de etapa para as entregas escolhidas (as mesmas regras da RPC mudar_etapa_entregas):
 * entrega da área requisitante não tem etapa; envio para pagamento só depois de entregue; Ofício à SAL e
 * Finalizado só depois de pago; Ofício à SAL só em entrega de emenda.
 */
export function bloqueioDaEtapa(entregas: Pick<EntregaFiscalizacao, 'responsavel' | 'entregueEm' | 'pagoEm' | 'origem'>[], etapa: EtapaEntrega): string | null {
  if (entregas.some((e) => e.responsavel === 'AREA')) return 'Item da área requisitante não tem etapa na SFC/CGLIC.';
  if ((etapa === 'PAGAMENTO' || etapa === 'SAL' || etapa === 'FINALIZADO') && entregas.some((e) => !e.entregueEm)) return 'Registre a entrega antes do envio para pagamento e doação.';
  if (etapa === 'SAL' && entregas.some((e) => e.origem !== 'EMENDA')) return 'Ofício à SAL só em item de emenda.';
  if ((etapa === 'SAL' || etapa === 'FINALIZADO') && entregas.some((e) => e.origem === 'EMENDA' && !e.pagoEm)) return 'O Ofício à SAL e o fim da fiscalização vêm depois do pagamento: há nota ainda não paga.';
  return null;
}

/** Nome do beneficiário nas listas: sigla, e o nome por extenso embaixo. */
export function rotuloDoBeneficiario(e: Pick<EntregaFiscalizacao, 'beneficiarioSigla' | 'beneficiarioNome' | 'beneficiarioRazao'> & Partial<Pick<EntregaFiscalizacao, 'beneficiarioTexto'>>): { principal: string; detalhe: string | null } {
  const principal = e.beneficiarioSigla || e.beneficiarioNome || e.beneficiarioRazao || e.beneficiarioTexto || 'Beneficiário a informar';
  const detalhe = e.beneficiarioSigla ? e.beneficiarioNome || e.beneficiarioRazao : e.beneficiarioNome ? e.beneficiarioRazao : null;
  return { principal, detalhe: detalhe && detalhe !== principal ? detalhe : null };
}

export function nomeDoItem(e: Pick<EntregaFiscalizacao, 'itemNome' | 'itemDescricao' | 'itemKey'> & Partial<Pick<EntregaFiscalizacao, 'itemTexto'>>): string {
  return e.itemNome || e.itemDescricao || e.itemTexto || e.itemKey || 'Item';
}

/** Ata, UASG e número do item a partir da chave do item da ata ("00031/2025-200331-00002"); nulo no item da planilha sem ligação. */
export function ataEItemDaChave(itemKey: string | null | undefined): { ata: string; uasg: string; item: string } | null {
  if (!itemKey) return null;
  const [ata, uasg, item] = itemKey.split('-');
  return ata && uasg && item ? { ata, uasg, item } : null;
}

/** Passos do item na fiscalização, com o nome de cada um (o mesmo desenho da régua do Pedido 360). */
export const PASSOS_FISC = ['Informações', 'Ordem', 'Produção', 'Entregue', 'Recebido', 'Pagamento', 'Ofício à SAL'] as const;

/** Passo em que o item está (o primeiro que falta) e, quando parado, o motivo no lugar do nome. */
const comSal = (e: Pick<EntregaFiscalizacao, 'origem' | 'emenda'>) => e.origem === 'EMENDA' || Boolean(e.emenda);
/** Os passos do item: o Ofício à SAL só existe para item de emenda. */
export const passosDoItem = (e: Pick<EntregaFiscalizacao, 'origem' | 'emenda'>) => (comSal(e) ? PASSOS_FISC : PASSOS_FISC.slice(0, -1));

export function passoDoItem(e: Pick<EntregaFiscalizacao, 'etapa' | 'pagoEm' | 'origem' | 'emenda'>): { passo: number; parado: string | null; fim: boolean } {
  switch (e.etapa) {
    case 'INFO_PEDIDA': return { passo: 0, parado: null, fim: false };
    case 'INFO_ENVIADA': return { passo: 1, parado: null, fim: false };
    case 'ORDEM':
    case 'PRODUCAO': return { passo: 2, parado: null, fim: false };
    case 'CONTROLADO': return { passo: 2, parado: 'Aguardando o Exército', fim: false };
    case 'TRANSITO': return { passo: 3, parado: 'Em trânsito', fim: false };
    case 'RETIRADA': return { passo: 3, parado: 'Aguardando retirada', fim: false };
    case 'ENTREGUE':
    case 'TRP': return { passo: 4, parado: e.etapa === 'TRP' ? 'Recebido provisoriamente' : null, fim: false };
    case 'TRD': return { passo: 5, parado: null, fim: false };
    case 'PAGAMENTO': return e.pagoEm ? (comSal(e) ? { passo: 6, parado: null, fim: false } : { passo: 5, parado: null, fim: true }) : { passo: 5, parado: 'Aguardando o pagamento', fim: false };
    default: return { passo: comSal(e) ? 6 : 5, parado: null, fim: true };
  }
}

