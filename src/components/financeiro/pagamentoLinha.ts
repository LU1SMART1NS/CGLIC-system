import type { StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import type { EtapaPagamento, PagamentoCarteiraRow } from '../../services/financeiroCarteiraService';
import { getPaymentStatusDisplay } from '../../utils/paymentStatusDisplay';
import { dataBR, diasDesde } from './financeiroFormat';

/** Ordem das etapas (para ordenar pela coluna Etapa). */
export const ORDEM_ETAPA: Record<EtapaPagamento, number> = {
  NA_CGLIC: 0,
  NA_CGOFI: 1,
  EM_ANDAMENTO: 2,
  ERRO_SIAFI: 3,
  AGUARDANDO_OB: 4,
  PAGA: 5,
  CANCELADA: 6
};

export interface LinhaPagamento {
  /** Identificação da cobrança: nota fiscal/fatura ou, no ciclo, o atesto. */
  documento: string;
  referencia: string | null;
  empenho: string | null;
  valor: number;
  etapa: { label: string; variant: StatusBadgeVariant; detalhe: string | null };
  prazo: { texto: string; detalhe: string | null; atrasado: boolean; ordem: string | null };
  /** Ano da cobrança (emissão da fatura ou recebimento do ciclo), para o filtro de ano. */
  ano: string | null;
  /** Texto pesquisável da linha (sem o contrato, que a página junta). */
  busca: string;
}

const ETAPA_DO_CICLO = { CONFERENCIA: 'Conferir até', ENVIO: 'Enviar à CGOFI até', COBRANCA_CGOFI: 'Cobrar a CGOFI em' } as const;

const diasUteis = (n: number) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** O que a tabela mostra de cada linha (ciclo da CGLIC ou fatura do Contratos.gov.br). */
export function descreverLinha(row: PagamentoCarteiraRow, hoje: Date = new Date()): LinhaPagamento {
  if (row.tipo === 'CICLO') {
    const { ciclo } = row;
    const status = getPaymentStatusDisplay(ciclo.status);
    const etapaAtual = ciclo.etapaAtual;
    const atraso = etapaAtual?.atrasado ? Math.abs(etapaAtual.diasUteisRestantes) : 0;
    return {
      documento: `Atesto ${ciclo.input.documentoAtestoSei || 'sem SEI'}`,
      referencia: null,
      empenho: ciclo.input.empenhoCanonicalKey ?? null,
      valor: ciclo.input.valorAtesto,
      etapa: {
        label: status.label,
        variant: status.variant,
        detalhe: ciclo.input.responsavelNome ? `Resp.: ${ciclo.input.responsavelNome}` : null
      },
      prazo: etapaAtual
        ? {
            texto: `${ETAPA_DO_CICLO[etapaAtual.etapa]} ${dataBR(etapaAtual.dataAlvo)}`,
            detalhe: etapaAtual.atrasado ? `atrasado ${diasUteis(atraso)}` : diasUteis(etapaAtual.diasUteisRestantes),
            atrasado: etapaAtual.atrasado,
            ordem: etapaAtual.dataAlvo
          }
        : { texto: '—', detalhe: null, atrasado: false, ordem: null },
      ano: ciclo.input.dataRecebimento?.slice(0, 4) ?? null,
      busca: [ciclo.input.documentoAtestoSei, ciclo.input.numeroProcessoPagamentoSei, ciclo.input.responsavelNome, ciclo.input.empenhoCanonicalKey]
        .filter(Boolean)
        .join(' ')
    };
  }

  const f = row.fatura;
  const documento = `${f.tipo === 'Nota Fiscal' || !f.tipo ? 'NF' : f.tipo} ${f.numero ?? f.idFatura}`;
  const base = {
    documento,
    referencia: f.referencia,
    empenho: f.empenhos,
    valor: f.valorLiquido,
    ano: f.emissao?.slice(0, 4) ?? null,
    busca: [f.numero, f.np, f.ordensBancarias, f.empenhos, f.referencia].filter(Boolean).join(' ')
  };
  const npCompartilhada = f.npContratos > 1 ? ` · paga também ${f.npContratos - 1} outro(s) contrato(s)` : '';
  const vencimento = f.vencimento
    ? { texto: `Vence em ${dataBR(f.vencimento)}`, detalhe: null, atrasado: false, ordem: f.vencimento }
    : { texto: `Emitida em ${dataBR(f.emissao)}`, detalhe: null, atrasado: false, ordem: f.emissao };

  switch (row.etapa) {
    case 'PAGA':
      return {
        ...base,
        etapa: { label: 'Paga', variant: 'success', detalhe: f.ordensBancarias ? `${f.ordensBancarias}${npCompartilhada}` : null },
        prazo: { texto: `OB em ${dataBR(f.obEmissao)}`, detalhe: null, atrasado: false, ordem: f.obEmissao }
      };
    case 'AGUARDANDO_OB': {
      const n = f.dataLiquidacao ? diasDesde(f.dataLiquidacao, hoje) : 0;
      return {
        ...base,
        etapa: { label: 'Liquidada', variant: 'info', detalhe: f.np ? `${f.np}${npCompartilhada}` : 'sem NP' },
        prazo: { texto: `Liquidada em ${dataBR(f.dataLiquidacao)}`, detalhe: `aguardando OB há ${dias(n)}`, atrasado: n > 5, ordem: f.dataLiquidacao }
      };
    }
    case 'ERRO_SIAFI':
      return { ...base, etapa: { label: 'Erro no SIAFI', variant: 'danger', detalhe: null }, prazo: vencimento };
    case 'CANCELADA':
      return { ...base, etapa: { label: 'Cancelada', variant: 'neutral', detalhe: null }, prazo: vencimento };
    default:
      return { ...base, etapa: { label: f.situacao || 'Em andamento', variant: 'warning', detalhe: null }, prazo: vencimento };
  }
}
