/**
 * Contrato com escopo cumprido (extinção ordinária, art. 140 da Lei 14.133/2021), migration 314. O banco
 * (v_contrato_execucao) SUGERE pelos fatos das fontes e o gestor CONFIRMA com o documento SEI do recebimento
 * definitivo. Confirmado, o contrato sai de Vigentes e dos avisos de prorrogação; volta sozinho se chegar fatura,
 * nota de empenho ou aditivo novos.
 *
 * Aqui ficam só a leitura dos fatos para a tela (a conferência item a item da janela) e as pendências de fechamento.
 * Quem decide o estado é o banco.
 */
export type EstadoDaExecucao = 'EXECUTADO' | 'SUGERIDO' | null;

export interface ExecucaoDoContrato {
  contractKey: string;
  /** Valor global do contrato (com aditivos). */
  valorGlobal: number;
  /** Faturas pagas ou apropriadas no SIAFI, sem as canceladas. */
  faturado: number;
  /** Faturas ainda em aberto (pendente, aguardando SIAFI, apropriação em andamento, Siafi Erro). */
  faturasAbertas: number;
  /** Empenhado nas notas do contrato e ainda não faturado. */
  saldoEmpenho: number;
  /** Fiscalização da SFC/CGLIC: FINALIZADA, EM_CURSO ou SEM (contrato fora da Fiscalização). */
  fiscalizacao: 'FINALIZADA' | 'EM_CURSO' | 'SEM';
  estado: EstadoDaExecucao;
  /** Havia decisão gravada, mas chegou fato novo (fatura, nota ou aditivo) e ela deixou de valer. */
  decisaoSuperada: boolean;
  /** Confirmação do gestor (só no estado EXECUTADO). */
  confirmado?: { em: string; por: string; sei: string; dataRecebimento: string };
}

/** Margem para arredondamento: faturado entre 99% e 101% do valor global; saldo de empenho até 1% não conta. */
export const MARGEM_EXECUTADO = 0.01;

export interface ConferenciaDaExecucao {
  id: 'FATURADO' | 'FATURAS_ABERTAS' | 'FISCALIZACAO' | 'SALDO_EMPENHO';
  rotulo: string;
  detalhe: string;
  /** ok = cumprido; aviso = não impede a confirmação, vira pendência de fechamento; bloqueia = sem sugestão. */
  resultado: 'ok' | 'aviso' | 'bloqueia';
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O que o banco conferiu nas fontes, item a item, para a janela de confirmação. */
export function conferirExecucao(e: ExecucaoDoContrato): ConferenciaDaExecucao[] {
  const pct = e.valorGlobal > 0 ? (e.faturado / e.valorGlobal) * 100 : 0;
  const faturadoOk = e.valorGlobal > 0 && Math.abs(e.faturado - e.valorGlobal) <= e.valorGlobal * MARGEM_EXECUTADO;
  const semSaldo = e.saldoEmpenho <= e.valorGlobal * MARGEM_EXECUTADO;
  return [
    {
      id: 'FATURADO',
      rotulo: 'Faturas pagas',
      detalhe: `${brl(e.faturado)} de ${brl(e.valorGlobal)} (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`,
      resultado: faturadoOk ? 'ok' : 'bloqueia'
    },
    {
      id: 'FATURAS_ABERTAS',
      rotulo: 'Faturas em aberto',
      detalhe: e.faturasAbertas === 0 ? 'Nenhuma' : `${e.faturasAbertas} ainda sem pagamento`,
      resultado: e.faturasAbertas === 0 ? 'ok' : 'bloqueia'
    },
    {
      id: 'FISCALIZACAO',
      rotulo: 'Fiscalização',
      detalhe: e.fiscalizacao === 'FINALIZADA' ? 'Finalizada' : e.fiscalizacao === 'EM_CURSO' ? 'Ainda em curso' : 'Contrato fora da Fiscalização',
      resultado: e.fiscalizacao === 'EM_CURSO' ? 'bloqueia' : 'ok'
    },
    {
      id: 'SALDO_EMPENHO',
      rotulo: 'Saldo de empenho',
      detalhe: semSaldo ? 'Sem saldo' : `${brl(e.saldoEmpenho)} empenhado e não usado: anular`,
      resultado: semSaldo ? 'ok' : 'aviso'
    }
  ];
}

/** O que ainda falta para fechar o contrato executado (anular o saldo de empenho). */
export function pendenciasDoFechamento(e?: ExecucaoDoContrato): ConferenciaDaExecucao[] {
  return e ? conferirExecucao(e).filter((c) => c.resultado === 'aviso') : [];
}

export const estadoDaExecucao = (e?: ExecucaoDoContrato): EstadoDaExecucao => e?.estado ?? null;
