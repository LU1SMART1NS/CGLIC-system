/**
 * Cadastro das UASGs dos órgãos participantes (uasgs_cadastro, migration 111), em segundo plano e sob a
 * trava do banco (recurso 'cadastro_uasgs', UASG 000000: vale para todas as carteiras).
 *
 * O nome do órgão que vem com a ata chega cortado em 45 letras; o cadastro de UASGs do Compras.gov.br
 * (modulo-uasg/1_consultarUasg) traz o nome inteiro, a cidade e a UF. O banco escolhe as UASGs a ler
 * (uasgs_para_cadastrar: nunca lidas, lidas há mais de 30 dias, não achadas há mais de 7 dias). Uma UASG
 * por vez e dentro de um orçamento de tempo: o que não couber fica para a próxima execução (PARCIAL).
 * Falha de rede não grava nada: a UASG volta na próxima execução.
 */
import { supabase } from './supabaseClient';
import {
  executarComReserva,
  mensagemDeErro,
  UASG_TODAS,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';

export const RECURSO_CADASTRO_UASGS = 'cadastro_uasgs' as const;
export const FONTE_CADASTRO_UASGS = 'Cadastro de UASGs do Compras.gov.br';

/** Tempo máximo consultando a API numa execução (a Edge Function tem 150 s; a trava vale 10 minutos). */
export const ORCAMENTO_CADASTRO_UASGS_MS = 100_000;

const URL_CADASTRO = '/api-arp/modulo-uasg/1_consultarUasg';
/** Órgão da UASG: sigla (nomeMnemonicoOrgao) e esfera, base da sugestão do GTI (migration 139). */
const URL_ORGAO = '/api-arp/modulo-uasg/2_consultarOrgao';
const LOTE_GRAVACAO = 50;

/**
 * Ritmo das consultas. Na primeira execução no servidor (13/10/2026), 177 de 365 UASGs falharam lidas
 * em sequência sem pausa; o Compras.gov.br limita consultas seguidas (429, como no módulo ARP).
 */
const PAUSA_ENTRE_UASGS_MS = 400;
const TENTATIVAS = 3;
const ESPERA_POR_TENTATIVA_MS = 3_000;
/** Falhas seguidas (já com as novas tentativas) que encerram a execução: a fonte está fora ou bloqueando. */
const FALHAS_SEGUIDAS_PARA_PARAR = 5;

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Consulta com novas tentativas em 400, 429, erro 5xx ou falha de rede; outro erro da fonte lança na hora.
 * O 400 entra porque a consulta é sempre a mesma: em 13/10/2026 o cadastro devolveu 400 ao acaso sob carga
 * (UASG 200366: 400 e, em seguida, 200 seis vezes).
 */
async function consultar(url: string, fetcher: typeof fetch, esperar: (ms: number) => Promise<void>): Promise<Response> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (tentativa > 1) await esperar(ESPERA_POR_TENTATIVA_MS * (tentativa - 1));
    let resposta: Response;
    try {
      resposta = await fetcher(url);
    } catch (err) {
      ultimoErro = err;
      continue;
    }
    if (resposta.ok) return resposta;
    ultimoErro = new Error(`Cadastro de UASGs respondeu ${resposta.status}.`);
    if (resposta.status !== 400 && resposta.status !== 429 && resposta.status < 500) break;
  }
  throw ultimoErro;
}

export interface UasgDoCadastro {
  codigo_uasg: string;
  /** Ausente = o cadastro não achou a UASG. */
  nome?: string;
  municipio?: string | null;
  sigla_uf?: string | null;
  ativa?: boolean | null;
  /**
   * Órgão da UASG (migration 139). Com a chave presente, o órgão foi lido (null = a fonte não deu órgão);
   * sem a chave, não foi lido e a UASG volta para a fila na próxima execução.
   */
  codigo_orgao?: number | null;
  sigla_orgao?: string | null;
  esfera_orgao?: string | null;
}

export interface OrgaoDoCadastro {
  sigla: string | null;
  esfera: 'F' | 'E' | 'M' | null;
}

/**
 * Nome como a tela mostra: tudo em maiúsculas (o cadastro mistura "CAICó" e "SEGURANçA") e o "¢" que a
 * fonte às vezes manda no lugar do "Ç" ("EDUCA¢AO").
 */
export function normalizarNomeDoCadastro(nome: string): string {
  return nome.replace(/¢/g, 'Ç').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
}

/** Lê uma UASG no cadastro: ativa primeiro, depois inativa. Lança em falha de rede ou resposta com erro. */
export async function lerUasgNoCadastro(
  codigo: string,
  fetcher: typeof fetch = fetch,
  esperar: (ms: number) => Promise<void> = dormir
): Promise<UasgDoCadastro> {
  for (const status of ['true', 'false']) {
    const resposta = await consultar(`${URL_CADASTRO}?pagina=1&codigoUasg=${codigo}&statusUasg=${status}`, fetcher, esperar);
    const dados = (await resposta.json()) as { resultado?: Array<Record<string, unknown>> };
    const r = (dados.resultado ?? []).find((x) => String(x.codigoUasg ?? '') === codigo);
    const nome = typeof r?.nomeUasg === 'string' ? normalizarNomeDoCadastro(r.nomeUasg) : '';
    if (r && nome) {
      return {
        codigo_uasg: codigo,
        nome,
        municipio: typeof r.nomeMunicipioIbge === 'string' ? r.nomeMunicipioIbge.trim() || null : null,
        sigla_uf: typeof r.siglaUf === 'string' ? r.siglaUf.trim().toUpperCase() || null : null,
        ativa: typeof r.statusUasg === 'boolean' ? r.statusUasg : null,
        ...(typeof r.codigoOrgao === 'number' && r.codigoOrgao > 0 ? { codigo_orgao: r.codigoOrgao } : {})
      };
    }
  }
  return { codigo_uasg: codigo };
}

/** Lê o órgão no cadastro: ativo primeiro, depois inativo. Sem resultado nos dois: null. Lança em falha. */
export async function lerOrgaoNoCadastro(
  codigoOrgao: number,
  fetcher: typeof fetch = fetch,
  esperar: (ms: number) => Promise<void> = dormir
): Promise<OrgaoDoCadastro | null> {
  for (const status of ['true', 'false']) {
    const resposta = await consultar(`${URL_ORGAO}?pagina=1&codigoOrgao=${codigoOrgao}&statusOrgao=${status}`, fetcher, esperar);
    const dados = (await resposta.json()) as { resultado?: Array<Record<string, unknown>> };
    const r = (dados.resultado ?? []).find((x) => Number(x.codigoOrgao) === codigoOrgao);
    if (r) {
      const sigla = typeof r.nomeMnemonicoOrgao === 'string' ? r.nomeMnemonicoOrgao.replace(/\s+/g, ' ').trim() : '';
      const esfera = typeof r.esfera === 'string' ? r.esfera.trim().toUpperCase() : '';
      return { sigla: sigla || null, esfera: esfera === 'F' || esfera === 'E' || esfera === 'M' ? esfera : null };
    }
  }
  return null;
}

/**
 * Completa a UASG achada com a sigla e a esfera do órgão. O mesmo órgão é lido uma vez por execução.
 * Falha na leitura do órgão não derruba a UASG: ela é gravada sem o órgão e volta para a fila.
 */
export async function completarComOrgao(
  uasg: UasgDoCadastro,
  cache: Map<number, OrgaoDoCadastro | null>,
  fetcher: typeof fetch = fetch,
  esperar: (ms: number) => Promise<void> = dormir
): Promise<UasgDoCadastro> {
  if (!uasg.nome) return uasg;
  const codigo = uasg.codigo_orgao;
  if (codigo == null) return { ...uasg, codigo_orgao: null, sigla_orgao: null, esfera_orgao: null };
  try {
    if (!cache.has(codigo)) {
      await esperar(PAUSA_ENTRE_UASGS_MS);
      cache.set(codigo, await lerOrgaoNoCadastro(codigo, fetcher, esperar));
    }
    const orgao = cache.get(codigo) ?? null;
    return { ...uasg, sigla_orgao: orgao?.sigla ?? null, esfera_orgao: orgao?.esfera ?? null };
  } catch (err) {
    console.warn(`[cadastroUasgs] órgão ${codigo} da UASG ${uasg.codigo_uasg} não pôde ser lido:`, mensagemDeErro(err));
    const semOrgao = { ...uasg };
    delete semOrgao.codigo_orgao;
    return semOrgao;
  }
}

async function uasgsParaCadastrar(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('uasgs_para_cadastrar', { p_limite: 2000 });
  if (error) throw error;
  return ((data ?? []) as Array<{ codigo_uasg: string }>).map((r) => String(r.codigo_uasg));
}

async function gravar(lote: UasgDoCadastro[]): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_cadastro_uasgs', { p_uasgs: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Quantas UASGs estão na fila de leitura (modo de teste do servidor; não grava nada). */
export async function contarCadastroUasgsPendentes(): Promise<{ pendentes: number; amostra: UasgDoCadastro | null }> {
  const fila = await uasgsParaCadastrar();
  return { pendentes: fila.length, amostra: fila[0] ? await completarComOrgao(await lerUasgNoCadastro(fila[0]), new Map()) : null };
}

export async function sincronizarCadastroUasgs(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; esperar?: (ms: number) => Promise<void> } = {}
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const esperar = opts.esperar ?? dormir;
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_CADASTRO_UASGS_MS;

  return executarComReserva(
    RECURSO_CADASTRO_UASGS,
    UASG_TODAS,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      const inicio = agora();
      const fila = await uasgsParaCadastrar();

      let gravadas = 0;
      let naoAchadas = 0;
      let falhas = 0;
      let pendentes = 0;
      let seguidas = 0;
      let primeiroErro: string | null = null;
      let lote: UasgDoCadastro[] = [];
      const orgaos = new Map<number, OrgaoDoCadastro | null>();

      for (let i = 0; i < fila.length; i++) {
        if (agora() - inicio > orcamento) {
          pendentes = fila.length - i;
          break;
        }
        if (i > 0) await esperar(PAUSA_ENTRE_UASGS_MS);
        try {
          const uasg = await completarComOrgao(await lerUasgNoCadastro(fila[i], fetch, esperar), orgaos, fetch, esperar);
          if (!uasg.nome) naoAchadas++;
          lote.push(uasg);
          seguidas = 0;
        } catch (err) {
          falhas++;
          seguidas++;
          primeiroErro ??= mensagemDeErro(err);
          console.warn(`[cadastroUasgs] UASG ${fila[i]} não pôde ser lida:`, mensagemDeErro(err));
          if (seguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
            pendentes = fila.length - i - 1;
            break;
          }
        }
        if (lote.length >= LOTE_GRAVACAO) {
          gravadas += await gravar(lote);
          lote = [];
        }
      }
      gravadas += await gravar(lote);

      const problemas: string[] = [];
      if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'UASG não pôde ser lida' : 'UASGs não puderam ser lidas'} (${primeiroErro})`);
      if (naoAchadas > 0) problemas.push(`o cadastro não achou ${naoAchadas} ${naoAchadas === 1 ? 'UASG' : 'UASGs'}`);
      if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'UASG ficou' : 'UASGs ficaram'} para a próxima execução`);
      return problemas.length > 0
        ? { status: 'PARCIAL', total: gravadas, fontesComFalha: falhas > 0 || naoAchadas > 0 ? [FONTE_CADASTRO_UASGS] : [], mensagem: `${problemas.join(' e ')}.` }
        : { status: 'SUCESSO', total: gravadas, fontesComFalha: [] };
    }
  );
}

// ------------------------------------------------------------------------------
// Leitura (telas)
// ------------------------------------------------------------------------------

export interface CadastroUasg {
  uasg: string;
  nome: string;
  municipio: string | null;
  siglaUf: string | null;
}

/** Cadastro das UASGs pedidas; as que ainda não foram achadas ficam de fora do mapa. */
export async function fetchCadastroUasgs(uasgs: string[]): Promise<Map<string, CadastroUasg>> {
  const mapa = new Map<string, CadastroUasg>();
  const codigos = [...new Set(uasgs.filter((u) => /^\d{6}$/.test(u)))].sort();
  if (!supabase || codigos.length === 0) return mapa;
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase
      .from('uasgs_cadastro')
      .select('codigo_uasg, nome, municipio, sigla_uf')
      .in('codigo_uasg', codigos.slice(i, i + 200))
      .eq('encontrada', true);
    if (error) {
      // Migration 111 ainda não aplicada: a tela segue com o nome da ata.
      if (error.code === '42P01' || error.code === 'PGRST205') return mapa;
      throw new Error(error.message);
    }
    for (const r of data ?? []) {
      mapa.set(String(r.codigo_uasg), { uasg: String(r.codigo_uasg), nome: r.nome, municipio: r.municipio ?? null, siglaUf: r.sigla_uf ?? null });
    }
  }
  return mapa;
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);

/** "BOA VISTA" + "RR" → "Boa Vista/RR". */
export function localDaUasg(c: Pick<CadastroUasg, 'municipio' | 'siglaUf'>): string | null {
  const cidade = (c.municipio ?? '')
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
  if (cidade && c.siglaUf) return `${cidade}/${c.siglaUf}`;
  return cidade || c.siglaUf || null;
}
