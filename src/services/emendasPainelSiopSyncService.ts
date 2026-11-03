/**
 * Emendas do Painel do Orçamento Federal do SIOP (migration 252): dotação inicial, dotação atual, empenhado, liquidado e
 * pago de cada emenda do MJSP, por ação e modalidade, como a CAEP vê no painel (Emendas Parlamentares). Antes a CAEP
 * copiava o valor do SIOP à mão (emendas_siop, migrations 205 e 243); agora o servidor lê o painel uma vez por dia.
 *
 * A leitura (siopPainelQlik.ts) só vale se vier inteira e bater com a linha Total do próprio painel: o banco troca a foto
 * dos anos lidos de uma vez (gravar_emendas_siop_painel), e uma leitura pela metade apagaria linhas boas.
 * Só o servidor lê o painel (sem CORS para o navegador); a tela lê a tabela siop_painel_emendas.
 */
import { supabase } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { lerEmendasDoPainel, type LeituraDoPainel, type LinhaDoPainelSiop } from './siopPainelQlik';

export const RECURSO_EMENDAS_SIOP_PAINEL = 'emendas_siop_painel' as const;
export const FONTE_EMENDAS_SIOP_PAINEL = 'Painel do Orçamento Federal (SIOP)';
/** O cron chama uma vez por dia; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_EMENDAS_SIOP_PAINEL = '20 hours';
/** ~16 chamadas ao painel; sobra folga para gravar antes dos 150 s da Edge Function. */
export const ORCAMENTO_EMENDAS_SIOP_PAINEL_MS = 100_000;

type Leitor = typeof lerEmendasDoPainel;

async function gravar(linhas: LinhaDoPainelSiop[], baseSiafi: string | null): Promise<{ gravadas: number; removidas: number }> {
  const { data, error } = await supabase!.rpc('gravar_emendas_siop_painel', { p_linhas: linhas, p_base_siafi: baseSiafi });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as { gravadas?: number; removidas?: number };
  return { gravadas: Number(r.gravadas ?? 0), removidas: Number(r.removidas ?? 0) };
}

/** Resumo da leitura para o teste de acesso (dry) e para a mensagem da sincronização. */
export function resumoDaLeitura(l: LeituraDoPainel): Record<string, unknown> {
  const emendas = new Set(l.linhas.map((x) => `${x.ano}${x.emenda}`));
  return {
    linhasNoPainel: l.linhasNoPainel,
    linhasLidas: l.linhas.length,
    emendas: emendas.size,
    baseSiafi: l.baseSiafi,
    totais: l.totais,
    divergencias: l.divergencias,
    chamadas: l.chamadas,
    amostra: l.linhas[0] ?? null
  };
}

/** Teste sem gravar: abre o painel e lê as duas primeiras páginas (as somas ainda não fecham com o Total). */
export async function testarEmendasDoPainelSiop(opts: { fetcher?: typeof fetch; ler?: Leitor } = {}): Promise<Record<string, unknown>> {
  const ler = opts.ler ?? lerEmendasDoPainel;
  return resumoDaLeitura(await ler({ fetcher: opts.fetcher, paginas: 2 }));
}

export async function sincronizarEmendasDoPainelSiop(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; fetcher?: typeof fetch; ler?: Leitor } = {}
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
    const { gravadas, removidas } = await gravar(leitura.linhas, leitura.baseSiafi);
    const emendas = new Set(leitura.linhas.map((x) => `${x.ano}${x.emenda}`)).size;
    const partes = [`${emendas} emenda(s) em ${gravadas} linha(s) do painel do SIOP`];
    if (leitura.baseSiafi) partes.push(`base SIAFI de ${leitura.baseSiafi.split('-').reverse().join('/')}`);
    if (removidas) partes.push(`${removidas} linha(s) que saíram do painel removida(s)`);
    return { status: 'SUCESSO', total: gravadas, fontesComFalha: [], mensagem: `${partes.join(', ')}.` };
  });
}
