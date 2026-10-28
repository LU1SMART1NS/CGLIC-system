import { resumirCelulaGti, textoDaFatia } from '../config/gruposGti';
import { descricaoItemEmFrase } from '../utils/textCase';
import { dataBR, diasEntre, rotuloItemDaAta, ROTULO_SITUACAO_KIT } from '../utils/emendasKits';
import { itemComSaldo, kitComSaldo, type LinhaItemCaep, type LinhaKitCaep } from '../utils/emendasItensSaldo';
import { montarPlanilha, type ColunaDoExcel, type PlanilhaSimples } from './excelSimples';

/** Colunas escolhidas na janela de exportação, pelo id; sem escolha, saem todas. */
export interface EscolhaDeColunas {
  itens: string[];
  kits: string[];
}

const gnd = (g: LinhaItemCaep['gnd']) => (g === 'GND-4' ? 'GND-4 · Investimento' : g === 'GND-3' ? 'GND-3 · Custeio' : 'GND a informar');
const interesse = (l: LinhaItemCaep) => {
  const { destaque, secundaria } = resumirCelulaGti(l.fatias);
  return destaque ? [destaque, secundaria].filter((f) => f !== null).map(textoDaFatia).join(' · ') : 'Sem dados dos órgãos';
};
const porDescricao = (a: LinhaItemCaep, b: LinhaItemCaep) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR');

export const COLUNAS_ITENS: ColunaDoExcel<LinhaItemCaep, string>[] = [
  { id: 'ata', titulo: 'Ata', largura: 14, valor: (l) => l.numeroAta },
  { id: 'item', titulo: 'Item', largura: 8, valor: (l) => Number(l.numeroItem) },
  { id: 'descricao', titulo: 'Descrição', largura: 60, valor: (l) => descricaoItemEmFrase(l.descricao) },
  { id: 'quadro', titulo: 'Nome na Ata', largura: 40, valor: (l) => l.nomeCurto ?? '' },
  { id: 'gnd', titulo: 'GND', largura: 20, valor: (l) => gnd(l.gnd) },
  { id: 'gti', titulo: 'Interesse principal', largura: 26, valor: interesse },
  { id: 'vigencia', titulo: 'Vigência até', largura: 13, valor: (l) => (l.vigenciaFinal ? dataBR(l.vigenciaFinal) : '') },
  { id: 'dias', titulo: 'Dias para vencer', largura: 10, formato: 'inteiro', valor: (l, hoje) => (l.vigenciaFinal ? diasEntre(hoje, l.vigenciaFinal) : null) },
  { id: 'alocado', titulo: 'Alocado à CAEP', largura: 12, formato: 'inteiro', valor: (l) => l.alocado },
  { id: 'reservado', titulo: 'Reservado', largura: 12, formato: 'inteiro', valor: (l) => l.reservado },
  { id: 'pedidos', titulo: 'Pedidos', largura: 9, formato: 'inteiro', valor: (l) => l.pedidos },
  { id: 'saldo', titulo: 'Saldo', largura: 12, formato: 'inteiro', valor: (l) => l.saldo },
  { id: 'preco', titulo: 'Valor unitário previsto', largura: 16, formato: 'reais', valor: (l) => l.previsto },
  { id: 'valorSaldo', titulo: 'Valor do saldo', largura: 18, formato: 'reais', valor: (l) => Math.round(l.saldo * l.previsto * 100) / 100 }
];

const comItem = (i: NonNullable<LinhaKitCaep['calculo']['componentes'][number]['item']>) => `${rotuloItemDaAta(i)} · ${descricaoItemEmFrase(i.descricao)}`;

export const COLUNAS_KITS: ColunaDoExcel<LinhaKitCaep, string>[] = [
  { id: 'kit', titulo: 'Kit', largura: 32, valor: (k) => k.nome },
  { id: 'descricao', titulo: 'Descrição', largura: 40, valor: (k) => k.descricao ?? '' },
  { id: 'situacao', titulo: 'Situação', largura: 16, valor: (k) => ROTULO_SITUACAO_KIT[k.calculo.situacao] },
  { id: 'possiveis', titulo: 'Kits possíveis', largura: 10, formato: 'inteiro', valor: (k) => k.calculo.kitsPossiveis },
  { id: 'valor', titulo: 'Valor por kit', largura: 16, formato: 'reais', valor: (k) => k.calculo.valorPorKit },
  { id: 'limite', titulo: 'Item que limita', largura: 40, valor: (k) => (k.calculo.itemLimitante?.item ? comItem(k.calculo.itemLimitante.item) : '') },
  {
    id: 'composicao',
    titulo: 'Composição (quantidade por kit)',
    largura: 80,
    valor: (k) => k.calculo.componentes.map((c) => `${c.quantidade} × ${c.item ? comItem(c.item) : `${c.itemKey} (sem alocação da CAEP)`}`).join('; ')
  }
];

/** Itens e kits que entram no Excel, na ordem da tela. */
export function comSaldo(itens: LinhaItemCaep[], kits: LinhaKitCaep[]): { itens: LinhaItemCaep[]; kits: LinhaKitCaep[] } {
  return {
    itens: itens.filter(itemComSaldo).sort(porDescricao),
    kits: kits.filter(kitComSaldo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  };
}

/**
 * As abas do Excel de Emendas › Itens: itens com saldo (o trilho "Com saldo" de Por item) e kits com saldo (ativos e que
 * ainda cabem ao menos uma vez), só com as colunas escolhidas. Aba sem nenhuma coluna escolhida fica de fora.
 */
export function planilhasDeSaldo(itens: LinhaItemCaep[], kits: LinhaKitCaep[], hoje: string, escolha?: EscolhaDeColunas): PlanilhaSimples[] {
  const linhas = comSaldo(itens, kits);
  return [
    montarPlanilha({ nome: 'Itens com saldo', titulo: `Emendas › Itens · Itens com saldo em ${dataBR(hoje)}`, vazio: 'Nenhum item com saldo.' }, COLUNAS_ITENS, escolha?.itens, linhas.itens, hoje),
    montarPlanilha({ nome: 'Kits com saldo', titulo: `Emendas › Itens · Kits com saldo em ${dataBR(hoje)}`, vazio: 'Nenhum kit com saldo.' }, COLUNAS_KITS, escolha?.kits, linhas.kits, hoje)
  ].filter((p): p is PlanilhaSimples => p !== null);
}
