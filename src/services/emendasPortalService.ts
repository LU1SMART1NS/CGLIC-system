/**
 * Medição da API de emendas do Portal da Transparência (só leitura, recurso 'emendas_portal' em modo de teste).
 *
 * Pergunta: o que o portal entrega para a CAEP não digitar à toa na conferência com o SIOP? A ideia é confirmar
 * sozinho o nº da emenda e o autor e, depois do empenho, achar a nota de empenho da emenda (/emendas/documentos).
 * Nada é gravado: a medição devolve contagens e amostras para decidir o que entra no sistema.
 *
 * O portal exige a chave (cabeçalho chave-api-dados), que fica só no servidor (PORTAL_TRANSPARENCIA_CHAVE), e
 * limita a 90 consultas por minuto: uma a cada 0,7 s.
 */
const BASE = '/api-transparencia/api-de-dados';
const PAUSA_MS = 700;
const TAMANHO_DA_PAGINA = 15;
/** Função orçamentária 06 = Segurança Pública. */
export const FUNCAO_SEGURANCA_PUBLICA = '06';
/** UGs da SENASP (CGLIC) nos documentos do SIAFI. */
const UGS_SENASP = ['200330', '200331'];

type Json = Record<string, unknown>;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface OpcoesDaMedicao {
  chave: string | undefined;
  anos?: number[];
  maxPaginasPorAno?: number;
  maxEmendasComDocumentos?: number;
  orcamentoMs?: number;
  fetcher?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
}

/** Lê as emendas de Segurança Pública dos anos pedidos e os documentos de algumas delas. Não grava nada. */
export async function medirEmendasDoPortal(opts: OpcoesDaMedicao): Promise<Record<string, unknown>> {
  if (!opts.chave) return { erro: 'Falta a chave do Portal da Transparência no servidor (PORTAL_TRANSPARENCIA_CHAVE).' };
  const fetcher = opts.fetcher ?? fetch;
  const esperar = opts.esperar ?? dormir;
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const orcamento = opts.orcamentoMs ?? 100_000;
  let consultas = 0;

  const consultar = async (caminho: string): Promise<unknown> => {
    if (consultas > 0) await esperar(PAUSA_MS);
    consultas++;
    const r = await fetcher(`${BASE}${caminho}`, { headers: { 'chave-api-dados': opts.chave!, accept: 'application/json' } });
    if (!r.ok) throw new Error(`Portal respondeu ${r.status} em ${caminho.split('?')[0]}.`);
    return r.json();
  };

  const resultado: Record<string, unknown> = {};
  const comEmpenho: Json[] = [];
  for (const ano of opts.anos ?? [2026, 2025]) {
    const emendas: Json[] = [];
    let paginasLidas = 0;
    let completo = false;
    for (let pagina = 1; pagina <= (opts.maxPaginasPorAno ?? 25); pagina++) {
      if (agora() - inicio > orcamento * 0.6) break;
      const lote = (await consultar(`/emendas?ano=${ano}&codigoFuncao=${FUNCAO_SEGURANCA_PUBLICA}&pagina=${pagina}`)) as Json[];
      paginasLidas++;
      emendas.push(...(Array.isArray(lote) ? lote : []));
      if (!Array.isArray(lote) || lote.length < TAMANHO_DA_PAGINA) {
        completo = true;
        break;
      }
    }
    const porTipo: Record<string, number> = {};
    for (const e of emendas) porTipo[String(e.tipoEmenda ?? '—')] = (porTipo[String(e.tipoEmenda ?? '—')] ?? 0) + 1;
    const num = (v: unknown) => Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')) || 0;
    const empenhadas = emendas.filter((e) => num(e.valorEmpenhado) > 0);
    comEmpenho.push(...empenhadas.map((e) => ({ ...e, ano })));
    resultado[`ano${ano}`] = {
      paginasLidas,
      listaCompleta: completo,
      emendas: emendas.length,
      porTipo,
      comValorEmpenhado: empenhadas.length,
      autoresDistintos: new Set(emendas.map((e) => e.nomeAutor ?? e.autor)).size,
      amostra: emendas.slice(0, 3)
    };
  }

  // Documentos (empenhos) de algumas emendas empenhadas: a nota da SENASP aparece? Com que código?
  const documentos: Json[] = [];
  for (const e of comEmpenho.slice(0, opts.maxEmendasComDocumentos ?? 8)) {
    if (agora() - inicio > orcamento * 0.85) break;
    const docs = (await consultar(`/emendas/documentos/${encodeURIComponent(String(e.codigoEmenda))}?pagina=1`)) as Json[];
    const lista = Array.isArray(docs) ? docs : [];
    documentos.push({
      codigoEmenda: e.codigoEmenda,
      autor: e.nomeAutor ?? e.autor,
      localidade: e.localidadeDoGasto,
      valorEmpenhado: e.valorEmpenhado,
      documentos: lista.length,
      daSenasp: lista.filter((d) => UGS_SENASP.some((ug) => String(d.codigoDocumento ?? '').startsWith(ug))).length,
      amostra: lista.slice(0, 3)
    });
  }
  resultado.documentos = documentos;

  // Busca por um código de emenda: dá para confirmar o nº digitado pela CAEP?
  const exemplo = comEmpenho[0] as Json | undefined;
  if (exemplo && agora() - inicio < orcamento * 0.95) {
    const porCodigo = (await consultar(`/emendas?codigoEmenda=${encodeURIComponent(String(exemplo.codigoEmenda))}&ano=${exemplo.ano}&pagina=1`)) as Json[];
    resultado.buscaPorCodigo = { codigo: exemplo.codigoEmenda, achadas: Array.isArray(porCodigo) ? porCodigo.length : 0 };
  }
  resultado.consultas = consultas;
  resultado.duracaoMs = agora() - inicio;
  return resultado;
}
