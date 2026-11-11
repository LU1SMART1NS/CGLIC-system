import type { EntregaFiscalizacao } from '../services/fiscalizacaoService';
import { NOME_SFC, dataBR } from './fiscalizacao';
import { prazoDaEntrega, rotuloDoBeneficiario } from './fiscalizacaoEntregas';
import { gruposALigar } from './fiscalizacaoLigacao';

/* Regras da mesa do Contrato 360 › Fiscalização (Com você · Com outros) e de "com quem está o item", usadas também nas abas Contratos e Itens. */

export type Tom = 'vencido' | 'eu' | 'espera';
export interface Linha { chave: string; tom: Tom; quem?: string; titulo: string; detalhe?: string; prazo?: string; vencido?: boolean; /** Data (AAAA-MM-DD) que dá o prazo do passo, para a lista de contratos. */ limite?: string | null; acoes: Array<{ rotulo: string; principal?: boolean; faz: () => void }> }
export const COR: Record<Tom, string> = { vencido: 'var(--color-danger)', eu: 'var(--primary)', espera: 'var(--color-warning)' };

export const itens = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
const quem = (es: EntregaFiscalizacao[]) => {
  const nomes = [...new Set(es.map((e) => rotuloDoBeneficiario(e).principal))];
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', ');
};
const menorData = (es: EntregaFiscalizacao[]) => es.map((e) => e.prevista).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
export const EM_EXECUCAO = new Set(['ORDEM', 'PRODUCAO', 'TRANSITO', 'RETIRADA']);

type Abrir = (tipo: 'etapa' | 'prevista', itens: EntregaFiscalizacao[]) => void;

/** O que fazer agora no contrato, juntando os itens que estão no mesmo passo (o status anda em bloco). */
export function linhasDoContrato(es: EntregaFiscalizacao[], semProcesso: boolean, abrir: Abrir, processo: () => void): { comVoce: Linha[]; comOutros: Linha[] } {
  const sfc = es.filter((e) => e.responsavel === 'SFC');
  const de = (f: (e: EntregaFiscalizacao) => boolean) => sfc.filter(f);
  const mudar = (rotulo: string, x: EntregaFiscalizacao[]) => ({ rotulo, principal: true, faz: () => abrir('etapa', x) });
  const comVoce: Linha[] = [];
  const comOutros: Linha[] = [];
  if (semProcesso) comVoce.push({ chave: 'processo', tom: 'eu', titulo: 'Registrar o SEI do contrato', detalhe: 'Número SEI do contrato e data do contrato: vale para a autuação.', acoes: [{ rotulo: 'Registrar SEI', principal: true, faz: processo }] });
  const vencidos = de((e) => EM_EXECUCAO.has(e.etapa) && prazoDaEntrega(e).tom === 'danger');
  if (vencidos.length) comVoce.push({ chave: 'cobrar', tom: 'vencido', titulo: `Cobrar o fornecedor · ${itens(vencidos.length)} atrasado${vencidos.length === 1 ? "" : "s"}`, detalhe: quem(vencidos), prazo: dataBR(menorData(vencidos)), vencido: true, limite: menorData(vencidos), acoes: [{ rotulo: 'Nova data prevista', faz: () => abrir('prevista', vencidos) }, mudar('Mudar etapa', vencidos)] });
  const ordem = de((e) => e.etapa === 'INFO_ENVIADA');
  if (ordem.length) comVoce.push({ chave: 'ordem', tom: 'eu', titulo: `Emitir a Ordem de Fornecimento · ${itens(ordem.length)}`, detalhe: `${quem(ordem)} · as informações já chegaram`, acoes: [mudar('Registrar a Ordem', ordem)] });
  const semData = de((e) => EM_EXECUCAO.has(e.etapa) && !e.prevista);
  if (semData.length) comVoce.push({ chave: 'data', tom: 'eu', titulo: `Informar a data prevista de entrega · ${itens(semData.length)}`, detalhe: quem(semData), acoes: [{ rotulo: 'Data prevista', principal: true, faz: () => abrir('prevista', semData) }] });
  const passos: Array<[string, (e: EntregaFiscalizacao) => boolean, string, string]> = [
    ['provisorio', (e) => e.etapa === 'ENTREGUE', 'Receber provisoriamente', 'Registrar o recebimento'],
    ['definitivo', (e) => e.etapa === 'TRP', 'Receber em definitivo', 'Registrar o recebimento'],
    ['pagamento', (e) => e.etapa === 'TRD', 'Enviar para pagamento e doação', 'Registrar o envio'],
    ['sal', (e) => e.etapa === 'PAGAMENTO' && Boolean(e.pagoEm) && e.origem === 'EMENDA', 'Enviar o Ofício à SAL', 'Registrar o ofício'],
    ['finalizar', (e) => e.etapa === 'PAGAMENTO' && Boolean(e.pagoEm) && e.origem !== 'EMENDA', 'Finalizar a fiscalização', 'Finalizar']
  ];
  for (const [chave, f, titulo, botao] of passos) {
    const x = de(f);
    if (x.length) comVoce.push({ chave, tom: 'eu', titulo: `${titulo} · ${itens(x.length)}`, detalhe: quem(x), acoes: [mudar(botao, x)] });
  }
  const info = de((e) => e.etapa === 'INFO_PEDIDA');
  if (info.length) comOutros.push({ chave: 'info', tom: 'espera', quem: 'CAEP', titulo: `Enviar as informações · ${itens(info.length)}`, detalhe: quem(info), acoes: [] });
  const exercito = de((e) => e.etapa === 'CONTROLADO');
  if (exercito.length) comOutros.push({ chave: 'exercito', tom: 'espera', quem: 'Exército (DFPC)', titulo: `Autorizar os controlados · ${itens(exercito.length)}`, detalhe: `${quem(exercito)} · a DFPC pede o termo de doação`, acoes: [] });
  const fornecedor = de((e) => EM_EXECUCAO.has(e.etapa) && prazoDaEntrega(e).tom !== 'danger' && Boolean(e.prevista));
  if (fornecedor.length) comOutros.push({ chave: 'fornecedor', tom: 'espera', quem: 'Fornecedor', titulo: `Entregar · ${itens(fornecedor.length)}`, detalhe: quem(fornecedor), prazo: dataBR(menorData(fornecedor)), limite: menorData(fornecedor), acoes: [] });
  const pagar = de((e) => e.etapa === 'PAGAMENTO' && !e.pagoEm);
  if (pagar.length) comOutros.push({ chave: 'pagar', tom: 'espera', quem: 'Financeiro', titulo: `Pagar a nota · ${itens(pagar.length)}`, detalhe: quem(pagar), acoes: [] });
  const area = es.filter((e) => e.responsavel === 'AREA');
  if (area.length) comOutros.push({ chave: 'area', tom: 'espera', quem: 'Área requisitante', titulo: `Fiscaliza ${itens(area.length)}`, detalhe: `${quem(area)} · sem acompanhamento da ${NOME_SFC}`, acoes: [] });
  return { comVoce, comOutros };
}

/** Com quem está o item (a mesma regra da mesa do contrato): o passo é do fiscal, de outros, ou acabou. */
export function comQuemEstaOItem(e: EntregaFiscalizacao): 'VOCE' | 'OUTROS' | 'FIM' {
  if (e.responsavel === 'AREA') return 'OUTROS';
  if (e.etapa === 'SAL' || e.etapa === 'FINALIZADO') return 'FIM';
  if (e.etapa === 'INFO_PEDIDA' || e.etapa === 'CONTROLADO') return 'OUTROS';
  if (EM_EXECUCAO.has(e.etapa)) return !e.prevista || prazoDaEntrega(e).tom === 'danger' ? 'VOCE' : 'OUTROS';
  if (e.etapa === 'PAGAMENTO') return e.pagoEm ? 'VOCE' : 'OUTROS';
  return 'VOCE';
}

/**
 * Itens da planilha sem item da ata (migration 268): uma linha só, com quantos itens e quantos nomes escritos. Com o
 * fiscal quando o contrato tem itens de ata para escolher; senão, espera a Vinculação (Contratos à ata).
 */
export function linhaDeLigacao(es: EntregaFiscalizacao[], temItensDaAta: boolean, ligar: () => void): Linha | null {
  const gs = gruposALigar(es);
  if (!gs.length) return null;
  const n = gs.reduce((t, g) => t + g.es.length, 0);
  const nomes = gs.length === 1 ? `"${gs[0].texto}"` : `${gs.length} nomes escritos na planilha`;
  if (!temItensDaAta) return { chave: 'ligar', tom: 'espera', quem: 'Vinculação', titulo: `Ligar o contrato à ata · ${itens(n)} da planilha esperam`, detalhe: `${nomes} · depois os itens se ligam pelo nome`, acoes: [] };
  return { chave: 'ligar', tom: 'eu', titulo: `Ligar ao item da ata · ${itens(n)} da planilha`, detalhe: `${nomes} · uma escolha por nome`, acoes: [{ rotulo: 'Ligar ao item da ata', principal: true, faz: ligar }] };
}
