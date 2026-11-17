import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';
import { lerRelatorioAtaContratos, type RelatorioAtaContratos } from './relatorioAtaContratosParser';
import type { UnidadeItemRecord } from '../types';

/**
 * Relatório da ata do Contratos.gov.br (migration 325): o gestor importa o PDF e as quantidades dos órgãos passam a
 * valer no lugar das do Compras.gov.br onde o relatório é mais novo que a última atualização do órgão na consulta 3.
 */

const MIGRATION_325_AUSENTE = 'A importação do relatório ainda não está no banco (migration 325).';

/** Uma linha do relatório já importado para o item. */
export interface OrgaoDoRelatorioImportado {
  uasg: string;
  nomeOrgao: string | null;
  tipoUnidade: string | null;
  quantidade: number;
  saldo: number | null;
  /** "2026-11-17T11:35:58" (hora de Brasília). */
  geradoEm: string;
  importadoEm: string;
  importadoPorNome: string | null;
}

export interface ResultadoDaImportacao {
  importados: { numeroItem: number; itemKey: string; mudancas: number }[];
  fora: { numeroItem: number; motivo: 'ITEM_FORA_DA_ATA' | 'RELATORIO_MAIS_ANTIGO'; jaImportado?: string }[];
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  return supabase;
}

function mensagem(error: any): string {
  if (rpcInexistente(error)) return MIGRATION_325_AUSENTE;
  return String(error?.message ?? error ?? '').replace(/^[A-Z_0-9]+:\s*/, '') || 'O banco recusou a operação.';
}

/** Texto do PDF, página a página (mesma extração do servidor). A biblioteca só carrega ao escolher o arquivo. */
export async function textoDoPdf(arquivo: Blob): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const documento = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
  try {
    let texto = '';
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const conteudo = await pagina.getTextContent();
      texto += conteudo.items.map((i: any) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join('') + '\n';
      pagina.cleanup();
    }
    return texto;
  } finally {
    // Os tipos do unpdf 2.2.1 não trazem o destroy do pdf.js, que existe no objeto.
    await (documento as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

export async function lerRelatorioDoPdf(arquivo: Blob): Promise<RelatorioAtaContratos> {
  return lerRelatorioAtaContratos(await textoDoPdf(arquivo));
}

export async function importarRelatorioAta(r: RelatorioAtaContratos): Promise<ResultadoDaImportacao> {
  const { data, error } = await requireSupabase().rpc('importar_relatorio_ata', {
    p_numero_ata: r.numeroAta,
    p_uasg: r.uasg,
    p_gerado_em: r.geradoEm,
    p_itens: r.itens.map((i) => ({
      numero_item: i.numeroItem,
      unidades: i.unidades.map((u) => ({ uasg: u.uasg, nome: u.nome, tipo: u.tipo, quantidade: u.quantidade, saldo: u.saldo }))
    }))
  });
  if (error) throw new Error(mensagem(error));
  const d = (data ?? {}) as any;
  return {
    importados: (d.importados ?? []).map((i: any) => ({ numeroItem: Number(i.numero_item), itemKey: String(i.item_key), mudancas: Number(i.mudancas) || 0 })),
    fora: (d.fora ?? []).map((f: any) => ({ numeroItem: Number(f.numero_item), motivo: f.motivo, jaImportado: f.ja_importado ?? undefined }))
  };
}

/** Relatório já importado para o item (vazio se nunca foi importado ou a migration ainda não chegou). */
export async function lerRelatorioDoItem(itemKey: string): Promise<OrgaoDoRelatorioImportado[]> {
  const { data, error } = await requireSupabase()
    .from('itens_ata_relatorio_unidades')
    .select('uasg, nome_orgao, tipo_unidade, quantidade, saldo, gerado_em, importado_em, importado_por_nome')
    .eq('item_key', itemKey);
  if (error) {
    if (rpcInexistente(error) || /itens_ata_relatorio_unidades/.test(String(error.message))) return [];
    throw new Error(mensagem(error));
  }
  return (data ?? []).map((r: any) => ({
    uasg: String(r.uasg),
    nomeOrgao: r.nome_orgao ?? null,
    tipoUnidade: r.tipo_unidade ?? null,
    quantidade: Number(r.quantidade) || 0,
    saldo: r.saldo === null || r.saldo === undefined ? null : Number(r.saldo),
    geradoEm: String(r.gerado_em),
    importadoEm: String(r.importado_em),
    importadoPorNome: r.importado_por_nome ?? null
  }));
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const semFuso = (v: string) => v.slice(0, 19);

/**
 * Mesma regra do banco (registrado_efetivo): o órgão vale pelo relatório quando ele é mais novo que a última
 * atualização do órgão no Compras.gov.br; órgão que só está no relatório entra na lista. Marca as linhas trocadas.
 */
export function aplicarRelatorio(
  unidades: UnidadeItemRecord[],
  relatorio: OrgaoDoRelatorioImportado[]
): { unidades: (UnidadeItemRecord & { doRelatorio?: boolean })[]; trocados: number } {
  if (relatorio.length === 0) return { unidades, trocados: 0 };
  const porUasg = new Map(relatorio.map((r) => [r.uasg, r]));
  const vistos = new Set<string>();
  let trocados = 0;
  const ativas = unidades.filter((u) => !u.dataHoraExclusao);
  const ultimaAtualizacao = new Map<string, string>();
  for (const u of ativas) {
    const uasg = digitos(u.codigoUnidade);
    const atual = ultimaAtualizacao.get(uasg);
    if (u.dataHoraAtualizacao && (!atual || semFuso(u.dataHoraAtualizacao) > atual)) ultimaAtualizacao.set(uasg, semFuso(u.dataHoraAtualizacao));
  }
  const saida: (UnidadeItemRecord & { doRelatorio?: boolean })[] = [];
  for (const u of unidades) {
    const uasg = digitos(u.codigoUnidade);
    const r = porUasg.get(uasg);
    const atualizacao = ultimaAtualizacao.get(uasg);
    if (u.dataHoraExclusao || !r || (atualizacao && atualizacao >= semFuso(r.geradoEm))) {
      saida.push(u);
      continue;
    }
    // Várias linhas do mesmo órgão (fornecedores diferentes): o relatório dá o total do órgão, na primeira.
    if (vistos.has(uasg)) continue;
    vistos.add(uasg);
    if (Number(u.quantidadeRegistrada) !== r.quantidade) trocados++;
    saida.push({
      ...u,
      quantidadeRegistrada: r.quantidade,
      saldoRemanejamentoEmpenho: r.saldo ?? u.saldoRemanejamentoEmpenho,
      dataHoraAtualizacao: r.geradoEm,
      doRelatorio: true
    });
  }
  const modelo = unidades[0];
  for (const r of relatorio) {
    if (ultimaAtualizacao.has(r.uasg) || vistos.has(r.uasg)) continue;
    trocados++;
    saida.push({
      numeroAta: modelo?.numeroAta ?? '',
      unidadeGerenciadora: modelo?.unidadeGerenciadora ?? '',
      numeroItem: modelo?.numeroItem ?? '',
      codigoPdm: modelo?.codigoPdm ?? '',
      descricaoItem: modelo?.descricaoItem ?? '',
      fornecedor: modelo?.fornecedor ?? '',
      quantidadeRegistrada: r.quantidade,
      saldoAdesoes: modelo?.saldoAdesoes ?? 0,
      saldoRemanejamentoEmpenho: r.saldo ?? r.quantidade,
      qtdLimiteAdesao: modelo?.qtdLimiteAdesao ?? 0,
      qtdLimiteInformadoCompra: modelo?.qtdLimiteInformadoCompra ?? 0,
      aceitaAdesao: modelo?.aceitaAdesao ?? false,
      dataHoraInclusao: r.geradoEm,
      dataHoraAtualizacao: r.geradoEm,
      dataHoraExclusao: null,
      codigoUnidade: r.uasg,
      nomeUnidade: r.nomeOrgao ?? `UASG ${r.uasg}`,
      tipoUnidade: (r.tipoUnidade ?? 'PARTICIPANTE').toUpperCase(),
      doRelatorio: true
    });
  }
  return { unidades: saida, trocados };
}

/** Registrado de cada órgão, por item, como está no banco agora (para a janela comparar com o relatório). */
export interface RegistradoNoBanco { quantidade: number; nome: string | null }

export async function lerRegistradoDosItens(itemKeys: string[]): Promise<Map<string, Map<string, RegistradoNoBanco>>> {
  const saida = new Map<string, Map<string, RegistradoNoBanco>>();
  if (itemKeys.length === 0) return saida;
  const { data, error } = await requireSupabase()
    .from('itens_ata_unidades_copia')
    .select('item_key, registrado')
    .in('item_key', itemKeys);
  if (error) throw new Error(mensagem(error));
  for (const linha of data ?? []) {
    const porUasg = new Map<string, RegistradoNoBanco>();
    for (const r of (Array.isArray((linha as any).registrado) ? (linha as any).registrado : []) as any[]) {
      porUasg.set(String(r.uasg), { quantidade: Number(r.quantidade) || 0, nome: r.nome_orgao ?? null });
    }
    saida.set(String((linha as any).item_key), porUasg);
  }
  return saida;
}

export interface LinhaDaComparacao {
  uasg: string;
  nome: string;
  /** Registrado no sistema agora; nulo = o órgão não está na lista. */
  agora: number | null;
  /** Nulo = o relatório não traz o órgão (fica como está). */
  relatorio: number | null;
  saldo: number | null;
  muda: boolean;
}

/** Sistema agora × relatório, órgão a órgão, de um item. */
export function compararItem(
  doRelatorio: { uasg: string; nome: string; quantidade: number; saldo: number }[],
  agora: Map<string, RegistradoNoBanco> | undefined,
  nomeConhecido: (uasg: string) => string | null
): LinhaDaComparacao[] {
  const atual = agora ?? new Map<string, RegistradoNoBanco>();
  const linhas: LinhaDaComparacao[] = doRelatorio.map((u) => {
    const a = atual.get(u.uasg);
    return { uasg: u.uasg, nome: nomeConhecido(u.uasg) ?? a?.nome ?? u.nome, agora: a ? a.quantidade : null, relatorio: u.quantidade, saldo: u.saldo, muda: !a || a.quantidade !== u.quantidade };
  });
  for (const [uasg, a] of atual) {
    if (!doRelatorio.some((u) => u.uasg === uasg)) linhas.push({ uasg, nome: nomeConhecido(uasg) ?? a.nome ?? `UASG ${uasg}`, agora: a.quantidade, relatorio: null, saldo: null, muda: false });
  }
  return linhas;
}
