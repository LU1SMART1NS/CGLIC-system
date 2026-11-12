import { resumirCelulaGti, textoDaFatia, type FatiasDaAta } from '../config/gruposGti';
import type { PrazoFaixa } from '../components/carteira/carteiraPrazo';
import type { CarteiraItemRow } from '../utils/carteiraItens';
import { NIVEL_ALOCACAO_LABEL, NIVEL_EMPENHO_LABEL } from '../utils/itemAtendimento';
import { FILTRO_PAPEL_LABEL } from '../utils/ataIdentidade';
import { descricaoItemEmFrase } from '../utils/textCase';
import { formatCnpj } from '../utils/format';
import { montarPlanilha, type ColunaDoExcel, type PlanilhaSimples } from './excelSimples';

/** O que a coluna precisa além da linha: o interesse por GTI (a mesma leitura da coluna da tela). */
export interface ContextoCarteiraItens {
  fatiasDaLinha: (row: CarteiraItemRow) => FatiasDaAta | undefined;
}
type Coluna = ColunaDoExcel<CarteiraItemRow, ContextoCarteiraItens>;

const SITUACAO_PRAZO: Record<PrazoFaixa, string> = { REGULAR: 'Vigente', ATENCAO: 'Atenção', CRITICO: 'Crítico', EXPIRADO: 'Encerrada', SEM_DATA: 'Sem data' };
const dataBR = (iso?: string | null) => {
  const [y, m, d] = (iso ?? '').split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};
const num = (v: unknown) => Number(v) || 0;
/** Saldo em unidades: quantitativo SENASP − consumido; sem o saldo sincronizado, em branco (como na tela). */
const saldo = (r: CarteiraItemRow) => (r.consumido == null ? null : r.quantitativoSenasp - r.consumido);

/** Colunas da Carteira › Itens em grupos, na ordem do arquivo. `padrao` = marcada na primeira vez. */
export const GRUPOS_CARTEIRA_ITENS: ReadonlyArray<{ id: string; titulo: string; colunas: ReadonlyArray<Coluna & { padrao?: boolean }> }> = [
  {
    id: 'ata',
    titulo: 'Ata',
    colunas: [
      { id: 'ata', titulo: 'Ata', largura: 13, padrao: true, valor: (r) => r.arp.numeroAtaRegistroPreco },
      { id: 'uasg', titulo: 'UASG', largura: 9, padrao: true, valor: (r) => r.arp.codigoUnidadeGerenciadora },
      { id: 'orgao', titulo: 'Órgão gerenciador', largura: 36, valor: (r) => r.arp.nomeUnidadeGerenciadora ?? '' },
      { id: 'papel', titulo: 'Papel da SENASP', largura: 14, valor: (r) => (r.arp.papelSenasp ? FILTRO_PAPEL_LABEL[r.arp.papelSenasp] : '') },
      { id: 'compra', titulo: 'Compra', largura: 13, valor: (r) => (r.arp.numeroCompra ? `${r.arp.numeroCompra}/${r.arp.anoCompra}` : '') },
      { id: 'objeto', titulo: 'Objeto da ata', largura: 50, valor: (r) => r.arp.objeto ?? '' },
      { id: 'vigencia', titulo: 'Vigência até', largura: 12, padrao: true, valor: (r) => dataBR(r.arp.dataVigenciaFinal) },
      { id: 'dias', titulo: 'Dias para vencer', largura: 10, formato: 'inteiro', padrao: true, valor: (r) => r.diasRestantes },
      { id: 'situacao', titulo: 'Situação', largura: 11, padrao: true, valor: (r) => SITUACAO_PRAZO[r.faixa] },
      { id: 'gestor', titulo: 'Gestor', largura: 28, padrao: true, valor: (r) => r.gestorNome ?? '' }
    ]
  },
  {
    id: 'item',
    titulo: 'Item e fornecedor',
    colunas: [
      { id: 'item', titulo: 'Item', largura: 7, padrao: true, valor: (r) => Number(r.item.numeroItem) },
      { id: 'descricao', titulo: 'Descrição', largura: 60, padrao: true, valor: (r) => descricaoItemEmFrase(r.item.descricaoItem) },
      { id: 'pdm', titulo: 'PDM', largura: 9, valor: (r) => r.item.codigoPdm ?? null },
      { id: 'fornecedor', titulo: 'Fornecedor', largura: 40, padrao: true, valor: (r) => r.item.nomeRazaoSocialFornecedor ?? '' },
      { id: 'cnpj', titulo: 'CNPJ', largura: 20, valor: (r) => formatCnpj(r.item.niFornecedor) },
      { id: 'valorUnitario', titulo: 'Valor unitário', largura: 15, formato: 'reais', padrao: true, valor: (r) => num(r.item.valorUnitario) },
      { id: 'homologada', titulo: 'Qtd. registrada na ata (todos os órgãos)', largura: 14, formato: 'inteiro', valor: (r) => num(r.item.quantidadeHomologadaItem) },
      {
        id: 'gti',
        titulo: 'Interesse principal',
        largura: 26,
        padrao: true,
        valor: (r, ctx) => {
          const { destaque, secundaria } = resumirCelulaGti(ctx.fatiasDaLinha(r));
          return destaque ? [destaque, secundaria].filter((f) => f !== null).map(textoDaFatia).join(' · ') : '';
        }
      }
    ]
  },
  {
    id: 'saldo',
    titulo: 'Saldo da SENASP',
    colunas: [
      { id: 'senasp', titulo: 'Quantitativo SENASP', largura: 13, formato: 'inteiro', padrao: true, valor: (r) => r.quantitativoSenasp },
      { id: 'consumido', titulo: 'Consumido', largura: 12, formato: 'inteiro', padrao: true, valor: (r) => r.consumido ?? null },
      { id: 'saldo', titulo: 'Saldo', largura: 12, formato: 'inteiro', padrao: true, valor: saldo },
      { id: 'consumo', titulo: 'Consumo', largura: 10, formato: 'percentual', padrao: true, valor: (r) => (r.consumoPct == null ? null : Math.round(r.consumoPct * 10) / 10) },
      { id: 'valorSaldo', titulo: 'Valor do saldo', largura: 16, formato: 'reais', padrao: true, valor: (r) => { const s = saldo(r); return s == null ? null : Math.round(s * num(r.item.valorUnitario) * 100) / 100; } }
    ]
  },
  {
    id: 'execucao',
    titulo: 'Alocação e empenho',
    colunas: [
      { id: 'alocado', titulo: 'Alocado às unidades', largura: 13, formato: 'inteiro', padrao: true, valor: (r) => r.alocado },
      { id: 'alocacao', titulo: 'Alocação', largura: 20, padrao: true, valor: (r) => NIVEL_ALOCACAO_LABEL[r.nivelAlocacao] },
      { id: 'contratada', titulo: 'Contratado', largura: 12, formato: 'inteiro', valor: (r) => r.contratada },
      { id: 'empenhado', titulo: 'Empenhado', largura: 12, formato: 'inteiro', padrao: true, valor: (r) => r.empenhado },
      { id: 'empenho', titulo: 'Empenho', largura: 22, padrao: true, valor: (r) => NIVEL_EMPENHO_LABEL[r.nivelEmpenho] },
      { id: 'ataAssinada', titulo: 'Qtd. da ata assinada', largura: 14, valor: (r) => (r.ataAssinada === 'A_INFORMAR' ? 'A informar' : r.ataAssinada === 'INFORMADA' ? 'Informada' : '') }
    ]
  }
];

export const COLUNAS_CARTEIRA_ITENS: ReadonlyArray<Coluna> = GRUPOS_CARTEIRA_ITENS.flatMap((g) => g.colunas);
export const COLUNAS_PADRAO_CARTEIRA_ITENS: string[] = GRUPOS_CARTEIRA_ITENS.flatMap((g) => g.colunas.filter((c) => c.padrao).map((c) => c.id));

/** Aba única "Itens" da Carteira com as colunas escolhidas, na ordem das linhas recebidas. */
export function planilhaCarteiraItens(rows: readonly CarteiraItemRow[], ids: readonly string[], ctx: ContextoCarteiraItens, hoje: string, recorte: string): PlanilhaSimples | null {
  return montarPlanilha({ nome: 'Itens', titulo: `Carteira de Itens · ${recorte} em ${dataBR(hoje)}`, vazio: 'Nenhum item.' }, COLUNAS_CARTEIRA_ITENS, ids, rows, ctx);
}
