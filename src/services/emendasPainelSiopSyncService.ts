/**
 * Emendas registradas sozinhas pelo Painel do Orçamento Federal do SIOP (migration 252, protótipo aprovado em
 * 03/11/2026). Antes a CAEP digitava cada emenda no "Registrar emenda do SIOP"; agora o servidor lê o painel uma vez por
 * dia (só o órgão 30000 - MJSP) e o banco registra as emendas novas de compra direta, com nº, ano, parlamentar, valor e
 * GND.
 *
 * A leitura (siopPainelQlik.ts) só é gravada se vier inteira, só do MJSP e conferida com a linha Total do painel. Vão ao
 * banco as linhas a partir de 2026, numa chamada só: gravar_emendas_siop_painel troca a foto desses anos, aprende os
 * códigos dos autores e registra as emendas na mesma transação. Só o servidor lê o painel (sem CORS para o navegador).
 */
import { supabase } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { lerEmendasDoPainel, type LeituraDoPainel, type LinhaDoPainelSiop } from './siopPainelQlik';

export const RECURSO_EMENDAS_SIOP_PAINEL = 'emendas_siop_painel' as const;
export const FONTE_EMENDAS_SIOP_PAINEL = 'Painel do Orçamento Federal (SIOP)';
/** O cron chama uma vez por dia; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_EMENDAS_SIOP_PAINEL = '20 hours';
/** Leitura do painel (~5 s em 03/11/2026); o resto dos 150 s da Edge Function fica para gravar. */
export const ORCAMENTO_EMENDAS_SIOP_PAINEL_MS = 90_000;
/** Primeiro ano gravado e registrado (D1). */
export const ANO_INICIAL_DO_PAINEL = 2026;

type Leitor = typeof lerEmendasDoPainel;

/** O que o banco devolve da gravação. */
export interface ResultadoDaGravacao {
  gravadas: number;
  removidas: number;
  codigos: number;
  registradas: number;
  atualizadas: number;
  semParlamentar: Array<{ ano: number; numero: string; autor: string | null; uf: string | null }>;
}

export type Gravador = (linhas: Omit<LinhaDoPainelSiop, 'dimensoes'>[], baseSiafi: string | null, anos: number[]) => Promise<ResultadoDaGravacao>;

const GRAVADOR_DO_BANCO: Gravador = async (linhas, baseSiafi, anos) => {
  const { data, error } = await supabase!.rpc('gravar_emendas_siop_painel', { p_linhas: linhas, p_base_siafi: baseSiafi, p_anos: anos });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as Record<string, any>;
  return {
    gravadas: Number(r.gravadas ?? 0),
    removidas: Number(r.removidas ?? 0),
    codigos: Number(r.codigos ?? 0),
    registradas: Number(r.registradas ?? 0),
    atualizadas: Number(r.atualizadas ?? 0),
    semParlamentar: Array.isArray(r.sem_parlamentar) ? r.sem_parlamentar : []
  };
};

/** Linhas que vão ao banco: a partir de 2026, sem as colunas como vieram (o banco guarda os campos). */
export function linhasParaGravar(leitura: LeituraDoPainel): Omit<LinhaDoPainelSiop, 'dimensoes'>[] {
  return leitura.linhas.filter((l) => l.ano >= ANO_INICIAL_DO_PAINEL).map(({ dimensoes: _d, ...l }) => l);
}

/** Resumo da leitura para o teste de acesso (dry) e para a mensagem da sincronização. */
export function resumoDaLeitura(l: LeituraDoPainel): Record<string, unknown> {
  const emendas = new Set(l.linhas.map((x) => `${x.ano}${x.emenda}`));
  const anos = [...new Set(l.linhas.map((x) => x.ano))].sort();
  return {
    linhasNoPainel: l.linhasNoPainel,
    linhasLidas: l.linhas.length,
    linhasParaGravar: linhasParaGravar(l).length,
    emendas: emendas.size,
    anos,
    cabecalhos: l.cabecalhos,
    agrupadoresLigados: l.agrupadoresLigados,
    baseSiafi: l.baseSiafi,
    totais: l.totais,
    divergencias: l.divergencias,
    chamadas: l.chamadas,
    amostra: l.linhas[0] ?? null
  };
}

/** Teste sem gravar: abre o painel, filtra o MJSP, liga os agrupadores e lê a primeira página. */
export async function testarEmendasDoPainelSiop(opts: { fetcher?: typeof fetch; ler?: Leitor } = {}): Promise<Record<string, unknown>> {
  const ler = opts.ler ?? lerEmendasDoPainel;
  return resumoDaLeitura(await ler({ fetcher: opts.fetcher, paginas: 1 }));
}

export async function sincronizarEmendasDoPainelSiop(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; fetcher?: typeof fetch; ler?: Leitor; gravador?: Gravador } = {}
): Promise<ResultadoSincronizacao> {
  const ler = opts.ler ?? lerEmendasDoPainel;
  const gravar = opts.gravador ?? GRAVADOR_DO_BANCO;
  return executarComReserva(RECURSO_EMENDAS_SIOP_PAINEL, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_EMENDAS_SIOP_PAINEL }, async () => {
    const leitura = await ler({ fetcher: opts.fetcher, orcamentoMs: opts.orcamentoMs ?? ORCAMENTO_EMENDAS_SIOP_PAINEL_MS, agora: opts.agora });
    if (leitura.divergencias.length) {
      return {
        status: 'ERRO',
        erro: `A soma das ${leitura.linhas.length} linhas lidas não bate com o Total do painel (${leitura.divergencias.join(', ')}); nada foi gravado.`
      };
    }
    const linhas = linhasParaGravar(leitura);
    if (!linhas.length) {
      return { status: 'ERRO', erro: `O painel do SIOP não trouxe nenhuma emenda do MJSP a partir de ${ANO_INICIAL_DO_PAINEL}; nada foi gravado.` };
    }
    const anos = [...new Set(linhas.map((l) => l.ano))].sort();
    const r = await gravar(linhas, leitura.baseSiafi, anos);
    const partes = [`${r.gravadas} linha(s) do painel do SIOP`];
    if (leitura.baseSiafi) partes.push(`base SIAFI de ${leitura.baseSiafi.split('-').reverse().join('/')}`);
    if (r.registradas) partes.push(`${r.registradas} emenda(s) nova(s) registrada(s)`);
    if (r.atualizadas) partes.push(`${r.atualizadas} emenda(s) sem pedido com valor ou GND novo`);
    if (r.removidas) partes.push(`${r.removidas} linha(s) que saíram do painel removida(s)`);
    if (r.semParlamentar.length) {
      partes.push(`${r.semParlamentar.length} emenda(s) sem parlamentar no cadastro: ${r.semParlamentar.map((s) => `${s.numero}/${s.ano}`).join(', ')}`);
    }
    return { status: 'SUCESSO', total: r.gravadas, fontesComFalha: [], mensagem: `${partes.join(', ')}.` };
  });
}
