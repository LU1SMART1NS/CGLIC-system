import type { EntregaFiscalizacao } from '../services/fiscalizacaoService';
import { dataBR } from './fiscalizacao';

/*
 * Prazo de entrega (migration 294). O prazo vem do Termo de Referência da compra (amostra de 30 compras no
 * PNCP): dias, contagem (corridos ou úteis) e a partir de quando conta (recebimento ou emissão da Ordem, assinatura do
 * contrato ou autorização do Exército). O dia do começo não conta (Lei 14.133, art. 183); em dias corridos, vencimento
 * em sábado ou domingo passa para a segunda. Feriados nacionais fixos entram na conta dos dias úteis.
 */

export type ContagemPrazo = 'CORRIDOS' | 'UTEIS';
export type InicioPrazo = 'OF_RECEBIMENTO' | 'OF_EMISSAO' | 'ASSINATURA' | 'EXERCITO';
export interface RegraDoPrazo {
  dias: number;
  contagem: ContagemPrazo;
  inicio: InicioPrazo;
  /** TR = lido do Termo de Referência e confirmado pelo gestor da ata; CONTRATO = corrigido no contrato. */
  origem?: 'TR' | 'CONTRATO';
  ata?: string | null;
  trecho?: string | null;
  documento?: string | null;
  confirmadoPor?: string | null;
  confirmadoEm?: string | null;
  /** Vale pela leitura clara do TR, sem confirmação do gestor da ata (migration 309). */
  automatico?: boolean;
  /** Prazo próprio de itens da ata, com a chave "ata|item" (migration 301). */
  porItem?: Record<string, number>;
  /** Quem informou ou mudou a regra no contrato, quando e por quê. */
  definidoPor?: string | null;
  definidoEm?: string | null;
  motivo?: string | null;
}

export const INICIOS: Array<{ id: InicioPrazo; nome: string; curto: string }> = [
  { id: 'OF_RECEBIMENTO', nome: 'Recebimento da Ordem pelo fornecedor', curto: 'do recebimento da Ordem' },
  { id: 'OF_EMISSAO', nome: 'Emissão da Ordem', curto: 'da emissão da Ordem' },
  { id: 'ASSINATURA', nome: 'Assinatura do contrato', curto: 'da assinatura do contrato' },
  { id: 'EXERCITO', nome: 'Autorização do Exército (controlados)', curto: 'da autorização do Exército' }
];
export const inicioDef = (i: InicioPrazo) => INICIOS.find((x) => x.id === i)!;

const UM_DIA = 864e5;
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
const somar = (iso: string, n: number) => paraIso(new Date(paraData(iso).getTime() + n * UM_DIA));
export const diasEntre = (a: string, b: string) => Math.round((paraData(b).getTime() - paraData(a).getTime()) / UM_DIA);

const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
const util = (iso: string) => {
  const s = paraData(iso).getUTCDay();
  return s !== 0 && s !== 6 && !FERIADOS_FIXOS.includes(iso.slice(5));
};

/** Data de início + dias, na contagem da regra. */
export function previstaPelaRegra(inicio: string, dias: number, contagem: ContagemPrazo = 'CORRIDOS'): string {
  if (contagem === 'UTEIS') {
    let d = inicio;
    for (let n = 0; n < dias; ) { d = somar(d, 1); if (util(d)) n++; }
    return d;
  }
  let d = somar(inicio, dias);
  while (!util(d)) d = somar(d, 1);
  return d;
}
/** Compatível com a primeira versão do protótipo (dias corridos do recebimento da Ordem). */
export const previstaPelaOrdem = (recebidaEm: string, dias: number) => previstaPelaRegra(recebidaEm, dias, 'CORRIDOS');

export const textoDosDias = (dias: number, contagem: ContagemPrazo = 'CORRIDOS') =>
  `${dias} ${dias === 1 ? (contagem === 'UTEIS' ? 'dia útil' : 'dia corrido') : contagem === 'UTEIS' ? 'dias úteis' : 'dias corridos'}`;
export const textoDaRegra = (r: Pick<RegraDoPrazo, 'dias' | 'contagem' | 'inicio'>) => `${textoDosDias(r.dias, r.contagem)} ${inicioDef(r.inicio).curto}`;

/** Prazo suspenso no Exército: os dias de espera voltam ao fornecedor (a data anda o mesmo tanto). */
export function devolverSuspensao(prevista: string, entrouEm: string, autorizadoEm: string): { dias: number; nova: string } {
  const dias = Math.max(0, diasEntre(entrouEm, autorizadoEm));
  return { dias, nova: somar(prevista, dias) };
}

/** De onde veio a data prevista, numa frase curta (janela do item e lista). */
export function origemDaPrevista(e: Pick<EntregaFiscalizacao, 'prevista' | 'previstaOrigem' | 'ordemRecebidaEm' | 'prazoDias' | 'previstaAnterior' | 'diasSuspensos'> & Partial<Pick<EntregaFiscalizacao, 'prazoContagem'>>): string | null {
  const c = e.prazoContagem ?? 'CORRIDOS';
  if (!e.prevista) return null;
  const suspensos = e.diasSuspensos ? ` · +${e.diasSuspensos} dias no Exército` : '';
  switch (e.previstaOrigem) {
    case 'ORDEM':
      return (e.ordemRecebidaEm && e.prazoDias ? `${textoDosDias(e.prazoDias, c)} do recebimento da Ordem em ${dataBR(e.ordemRecebidaEm)}` : 'pela Ordem de Fornecimento') + suspensos;
    case 'ASSINATURA':
      return `${e.prazoDias ? textoDosDias(e.prazoDias, c) : 'prazo'} da assinatura do contrato${suspensos}`;
    case 'EXERCITO':
      return `${e.prazoDias ? textoDosDias(e.prazoDias, c) : 'prazo'} da autorização do Exército`;
    case 'PRORROGACAO':
      return `prorrogada${e.previstaAnterior ? `; era ${dataBR(e.previstaAnterior)}` : ''}${suspensos}`;
    case 'PLANILHA':
      return 'informada antes da Ordem; confirme pela Ordem';
    default:
      return 'informada à mão; confirme pela Ordem';
  }
}

/** Item em execução que ainda não tem o recebimento da Ordem (a data não está pela regra). */
export const semRecebimentoDaOrdem = (e: Pick<EntregaFiscalizacao, 'ordemRecebidaEm' | 'previstaOrigem'>) =>
  !e.ordemRecebidaEm && e.previstaOrigem !== 'PRORROGACAO' && e.previstaOrigem !== 'ASSINATURA' && e.previstaOrigem !== 'EXERCITO';
