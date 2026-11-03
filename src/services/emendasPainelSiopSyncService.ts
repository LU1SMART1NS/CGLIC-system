/**
 * Emendas do Painel do Orçamento Federal do SIOP (migration 252): todas as emendas do painel, sem os filtros do Passo 1
 * e com os doze agrupadores do Passo 2 ligados (autor, tipo, partido, UF, nº, órgão, unidade orçamentária, ação,
 * localizador, GND, modalidade e natureza de despesa), com dotação inicial e atual, empenhado, liquidado e pago.
 * Antes a CAEP copiava o valor do SIOP à mão (emendas_siop, migrations 205 e 243); agora o servidor lê o painel uma vez
 * por dia.
 *
 * A leitura (siopPainelQlik.ts) só é gravada se vier inteira e bater com a linha Total do próprio painel. A gravação vai
 * em lotes (o painel inteiro não cabe numa chamada) com o mesmo id de leitura; no fim, concluir_leitura_siop_painel
 * remove dos anos lidos o que não veio nesta leitura. Se a execução cair no meio, as linhas antigas ficam e a próxima
 * leitura refaz tudo.
 */
import { supabase } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { lerEmendasDoPainel, type LeituraDoPainel, type LinhaDoPainelSiop } from './siopPainelQlik';

export const RECURSO_EMENDAS_SIOP_PAINEL = 'emendas_siop_painel' as const;
export const FONTE_EMENDAS_SIOP_PAINEL = 'Painel do Orçamento Federal (SIOP)';
/** O cron chama uma vez por dia; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_EMENDAS_SIOP_PAINEL = '20 hours';
/** Leitura do painel; o resto dos 150 s da Edge Function fica para gravar. */
export const ORCAMENTO_EMENDAS_SIOP_PAINEL_MS = 90_000;
/** Linhas por chamada de gravação. */
export const LOTE_DE_GRAVACAO = 1500;

type Leitor = typeof lerEmendasDoPainel;

export interface Gravador {
  gravar: (leitura: string, linhas: LinhaDoPainelSiop[], baseSiafi: string | null) => Promise<number>;
  concluir: (leitura: string, anos: number[]) => Promise<number>;
}

const GRAVADOR_DO_BANCO: Gravador = {
  async gravar(leitura, linhas, baseSiafi) {
    const { data, error } = await supabase!.rpc('gravar_emendas_siop_painel', { p_leitura: leitura, p_linhas: linhas, p_base_siafi: baseSiafi });
    if (error) throw mapPostgresErrorToAppError(error);
    return Number(data ?? 0);
  },
  async concluir(leitura, anos) {
    const { data, error } = await supabase!.rpc('concluir_leitura_siop_painel', { p_leitura: leitura, p_anos: anos });
    if (error) throw mapPostgresErrorToAppError(error);
    return Number(data ?? 0);
  }
};

/** Resumo da leitura para o teste de acesso (dry) e para a mensagem da sincronização. */
export function resumoDaLeitura(l: LeituraDoPainel): Record<string, unknown> {
  const emendas = new Set(l.linhas.map((x) => `${x.ano}${x.emenda}`));
  const anos = [...new Set(l.linhas.map((x) => x.ano))].sort();
  const orgaos = new Set(l.linhas.map((x) => x.orgao).filter(Boolean));
  return {
    linhasNoPainel: l.linhasNoPainel,
    linhasLidas: l.linhas.length,
    emendas: emendas.size,
    anos,
    orgaos: orgaos.size,
    cabecalhos: l.cabecalhos,
    agrupadoresLigados: l.agrupadoresLigados,
    agrupadoresNaoEncontrados: l.agrupadoresNaoEncontrados,
    baseSiafi: l.baseSiafi,
    totais: l.totais,
    divergencias: l.divergencias,
    chamadas: l.chamadas,
    amostra: l.linhas[0] ?? null
  };
}

/** Teste sem gravar: abre o painel, tira os filtros, liga os agrupadores e lê a primeira página. */
export async function testarEmendasDoPainelSiop(opts: { fetcher?: typeof fetch; ler?: Leitor } = {}): Promise<Record<string, unknown>> {
  const ler = opts.ler ?? lerEmendasDoPainel;
  return resumoDaLeitura(await ler({ fetcher: opts.fetcher, paginas: 1 }));
}

/** Grava a leitura em lotes e conclui (remove dos anos lidos o que não veio). */
export async function gravarLeitura(leitura: LeituraDoPainel, gravador: Gravador = GRAVADOR_DO_BANCO, id: string = globalThis.crypto.randomUUID()) {
  let gravadas = 0;
  for (let i = 0; i < leitura.linhas.length; i += LOTE_DE_GRAVACAO) {
    gravadas += await gravador.gravar(id, leitura.linhas.slice(i, i + LOTE_DE_GRAVACAO), leitura.baseSiafi);
  }
  const anos = [...new Set(leitura.linhas.map((l) => l.ano))].sort();
  const removidas = await gravador.concluir(id, anos);
  return { gravadas, removidas };
}

export async function sincronizarEmendasDoPainelSiop(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; fetcher?: typeof fetch; ler?: Leitor; gravador?: Gravador } = {}
): Promise<ResultadoSincronizacao> {
  const ler = opts.ler ?? lerEmendasDoPainel;
  return executarComReserva(RECURSO_EMENDAS_SIOP_PAINEL, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_EMENDAS_SIOP_PAINEL }, async () => {
    const leitura = await ler({ fetcher: opts.fetcher, orcamentoMs: opts.orcamentoMs ?? ORCAMENTO_EMENDAS_SIOP_PAINEL_MS, agora: opts.agora });
    if (!leitura.linhas.length) {
      return { status: 'ERRO', erro: 'O painel do SIOP não trouxe nenhuma emenda; nada foi gravado.' };
    }
    if (leitura.divergencias.length) {
      return {
        status: 'ERRO',
        erro: `A soma das ${leitura.linhas.length} linhas lidas não bate com o Total do painel (${leitura.divergencias.join(', ')}); nada foi gravado.`
      };
    }
    const { gravadas, removidas } = await gravarLeitura(leitura, opts.gravador);
    const emendas = new Set(leitura.linhas.map((x) => `${x.ano}${x.emenda}`)).size;
    const partes = [`${emendas} emenda(s) em ${gravadas} linha(s) do painel do SIOP`];
    if (leitura.baseSiafi) partes.push(`base SIAFI de ${leitura.baseSiafi.split('-').reverse().join('/')}`);
    if (removidas) partes.push(`${removidas} linha(s) que saíram do painel removida(s)`);
    if (leitura.agrupadoresNaoEncontrados.length) partes.push(`agrupadores não encontrados: ${leitura.agrupadoresNaoEncontrados.join(', ')}`);
    const mensagem = `${partes.join(', ')}.`;
    return leitura.agrupadoresNaoEncontrados.length
      ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [FONTE_EMENDAS_SIOP_PAINEL], mensagem }
      : { status: 'SUCESSO', total: gravadas, fontesComFalha: [], mensagem };
  });
}
