/**
 * Autores das emendas (emenda_autores, migration 155): deputados e senadores da legislatura atual, lidos no
 * servidor uma vez por semana (recurso 'autores_emendas', UASG 000000: vale para todas as carteiras).
 *
 * Câmara: /api/v2/deputados sem filtro = quem está no cargo hoje (513); com idLegislatura = todos que passaram
 * pela legislatura (648 em 23/10/2026, inclusive suplentes que assumiram e titulares que saíram).
 * Senado: /senador/lista/atual = os 81 no cargo; /senador/lista/legislatura/{n} = 245 nomes, com suplentes que
 * nunca assumiram. Só entram os que têm exercício no mandato (126 de 245 em 23/10/2026).
 *
 * Quem sai do cargo continua no cadastro (em_exercicio = falso), porque as indicações dele não somem.
 * Nada é apagado; falha de qualquer das fontes não grava aquela casa.
 */
import { supabase } from './supabaseClient';
import { executarComReserva, mensagemDeErro, UASG_TODAS, VALIDADE_PADRAO, type ResultadoSincronizacao } from './sincronizacaoFontesService';

export const RECURSO_AUTORES_EMENDAS = 'autores_emendas' as const;
export const FONTE_CAMARA = 'Câmara dos Deputados';
export const FONTE_SENADO = 'Senado Federal';

const URL_CAMARA = '/api-camara/api/v2/deputados';
const URL_SENADO_ATUAL = '/api-senado/dadosabertos/senador/lista/atual.json';
const urlSenadoLegislatura = (n: number) => `/api-senado/dadosabertos/senador/lista/legislatura/${n}.json`;
const POR_PAGINA = 100;
const MAX_PAGINAS = 20;

export interface AutorDaFonte {
  id: string;
  tipo: 'DEPUTADO' | 'SENADOR';
  codigo_fonte: string;
  nome: string;
  nome_civil: string | null;
  partido: string | null;
  uf: string | null;
  em_exercicio: boolean;
  legislatura: number;
  url_foto: string | null;
  email: string | null;
}

type Json = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const lista = <T>(v: T | T[] | undefined | null): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

async function lerJson(url: string, fetcher: typeof fetch): Promise<Json> {
  const resposta = await fetcher(url);
  if (!resposta.ok) throw new Error(`${url.startsWith('/api-camara') ? FONTE_CAMARA : FONTE_SENADO} respondeu ${resposta.status}.`);
  return (await resposta.json()) as Json;
}

async function deputadosDaPagina(base: string, fetcher: typeof fetch): Promise<Json[]> {
  const todos: Json[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const sep = base.includes('?') ? '&' : '?';
    const dados = await lerJson(`${base}${sep}itens=${POR_PAGINA}&pagina=${pagina}&ordem=ASC&ordenarPor=nome`, fetcher);
    const pagina_ = lista(dados.dados as Json[]);
    todos.push(...pagina_);
    if (pagina_.length < POR_PAGINA) break;
  }
  return todos;
}

/** Deputados da legislatura atual, marcando quem está no cargo hoje. */
export async function lerDeputados(fetcher: typeof fetch = fetch): Promise<{ legislatura: number; autores: AutorDaFonte[] }> {
  const noCargo = await deputadosDaPagina(URL_CAMARA, fetcher);
  const legislatura = Math.max(0, ...noCargo.map((d) => Number(d.idLegislatura) || 0));
  if (!legislatura) throw new Error(`${FONTE_CAMARA} não trouxe a legislatura atual.`);
  const idsNoCargo = new Set(noCargo.map((d) => String(d.id)));
  const daLegislatura = await deputadosDaPagina(`${URL_CAMARA}?idLegislatura=${legislatura}`, fetcher);
  const porId = new Map<string, Json>();
  for (const d of [...daLegislatura, ...noCargo]) porId.set(String(d.id), d);
  const autores: AutorDaFonte[] = [];
  for (const [id, d] of porId) {
    const nome = texto(d.nome);
    if (!nome || !/^\d+$/.test(id)) continue;
    autores.push({
      id: `C:${id}`,
      tipo: 'DEPUTADO',
      codigo_fonte: id,
      nome,
      nome_civil: null,
      partido: texto(d.siglaPartido),
      uf: texto(d.siglaUf)?.toUpperCase() ?? null,
      em_exercicio: idsNoCargo.has(id),
      legislatura,
      url_foto: texto(d.urlFoto),
      email: texto(d.email)
    });
  }
  return { legislatura, autores };
}

function identificacao(p: Json): Json {
  return (p.IdentificacaoParlamentar as Json) ?? {};
}

/** Senadores com exercício na legislatura, marcando quem está no cargo hoje. */
export async function lerSenadores(legislatura: number, fetcher: typeof fetch = fetch): Promise<AutorDaFonte[]> {
  const atual = await lerJson(URL_SENADO_ATUAL, fetcher);
  const noCargo = lista(((atual.ListaParlamentarEmExercicio as Json)?.Parlamentares as Json)?.Parlamentar as Json[]);
  if (noCargo.length === 0) throw new Error(`${FONTE_SENADO} não trouxe os senadores em exercício.`);
  const daLeg = await lerJson(urlSenadoLegislatura(legislatura), fetcher);
  const todos = lista(((daLeg.ListaParlamentarLegislatura as Json)?.Parlamentares as Json)?.Parlamentar as Json[]);

  const autores = new Map<string, AutorDaFonte>();
  for (const p of todos) {
    const i = identificacao(p);
    const codigo = texto(i.CodigoParlamentar);
    const nome = texto(i.NomeParlamentar);
    const mandatos = lista((p.Mandatos as Json)?.Mandato as Json[]);
    if (!codigo || !nome || !mandatos.some((m) => m.Exercicios)) continue;
    autores.set(codigo, {
      id: `S:${codigo}`,
      tipo: 'SENADOR',
      codigo_fonte: codigo,
      nome,
      nome_civil: texto(i.NomeCompletoParlamentar),
      partido: null,
      uf: texto(mandatos[0]?.UfParlamentar)?.toUpperCase() ?? null,
      em_exercicio: false,
      legislatura,
      url_foto: null,
      email: null
    });
  }
  for (const p of noCargo) {
    const i = identificacao(p);
    const codigo = texto(i.CodigoParlamentar);
    const nome = texto(i.NomeParlamentar);
    if (!codigo || !nome) continue;
    autores.set(codigo, {
      ...(autores.get(codigo) ?? { id: `S:${codigo}`, tipo: 'SENADOR', codigo_fonte: codigo, legislatura }),
      nome,
      nome_civil: texto(i.NomeCompletoParlamentar),
      partido: texto(i.SiglaPartidoParlamentar),
      uf: texto(i.UfParlamentar)?.toUpperCase() ?? null,
      em_exercicio: true,
      url_foto: texto(i.UrlFotoParlamentar),
      email: texto(i.EmailParlamentar)
    } as AutorDaFonte);
  }
  return [...autores.values()];
}

async function gravar(autores: AutorDaFonte[]): Promise<number> {
  if (!supabase || autores.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_autores_emendas', { p_autores: autores });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Teste do servidor (dry): lê as duas casas sem gravar. */
export async function contarAutoresEmendas(fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const { legislatura, autores } = await lerDeputados(fetcher);
  const senadores = await lerSenadores(legislatura, fetcher);
  return {
    legislatura,
    deputados: autores.length,
    deputadosNoCargo: autores.filter((a) => a.em_exercicio).length,
    senadores: senadores.length,
    senadoresNoCargo: senadores.filter((a) => a.em_exercicio).length
  };
}

export async function sincronizarAutoresEmendas(opts: { forcar?: boolean; fetcher?: typeof fetch } = {}): Promise<ResultadoSincronizacao> {
  const fetcher = opts.fetcher ?? fetch;
  return executarComReserva(RECURSO_AUTORES_EMENDAS, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_PADRAO }, async () => {
    const fontesComFalha: string[] = [];
    let total = 0;
    let legislatura = 0;
    try {
      const deputados = await lerDeputados(fetcher);
      legislatura = deputados.legislatura;
      total += await gravar(deputados.autores);
    } catch (err) {
      console.warn('[autoresEmendas] Câmara:', mensagemDeErro(err));
      fontesComFalha.push(FONTE_CAMARA);
    }
    if (legislatura) {
      try {
        total += await gravar(await lerSenadores(legislatura, fetcher));
      } catch (err) {
        console.warn('[autoresEmendas] Senado:', mensagemDeErro(err));
        fontesComFalha.push(FONTE_SENADO);
      }
    } else {
      fontesComFalha.push(FONTE_SENADO);
    }
    if (fontesComFalha.length === 2) return { status: 'ERRO', erro: 'Câmara e Senado não responderam.' };
    return { status: fontesComFalha.length ? 'PARCIAL' : 'SUCESSO', total, fontesComFalha };
  });
}
