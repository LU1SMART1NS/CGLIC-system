/**
 * Grupos (GTI) das UASGs e fatias das atas (migration 139). Leitura por todos os logados; só o coordenador
 * confirma o grupo, pela RPC definir_grupos_uasgs.
 */
import { supabase } from './supabaseClient';
import {
  ehGrupoConfirmavel,
  montarFatiasGti,
  montarFatiasItensGti,
  type FatiasDaAta,
  type GrupoConfirmavel,
  type LinhaFatiaGti,
  type LinhaFatiaItemGti
} from '../config/gruposGti';

/** Migration 139 ainda não aplicada: as telas seguem sem GTI, sem erro. */
const semMigration = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202';

export async function fetchFatiasGti(): Promise<Map<string, FatiasDaAta>> {
  if (!supabase) return new Map();
  const linhas: LinhaFatiaGti[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('v_ata_gti_fatias')
      .select('numero_ata, uasg_gerenciadora, grupo, quantidade, orgaos')
      .order('numero_ata')
      .order('uasg_gerenciadora')
      .order('grupo')
      .range(de, de + 999);
    if (error) {
      if (semMigration(error.code)) return new Map();
      throw new Error(error.message);
    }
    linhas.push(...((data ?? []) as LinhaFatiaGti[]));
    if (!data || data.length < 1000) break;
  }
  return montarFatiasGti(linhas);
}

/** Fatias por item (chave "{numeroAta}-{uasg}-{00001}"). */
export async function fetchFatiasItensGti(): Promise<Map<string, FatiasDaAta>> {
  if (!supabase) return new Map();
  const linhas: LinhaFatiaItemGti[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('v_item_gti_fatias')
      .select('item_key, grupo, quantidade, orgaos')
      .order('item_key')
      .order('grupo')
      .range(de, de + 999);
    if (error) {
      if (semMigration(error.code)) return new Map();
      throw new Error(error.message);
    }
    linhas.push(...((data ?? []) as LinhaFatiaItemGti[]));
    if (!data || data.length < 1000) break;
  }
  return montarFatiasItensGti(linhas);
}

export interface UasgParticipanteGti {
  uasg: string;
  nome: string | null;
  nomeNaAta: string | null;
  siglaUf: string | null;
  municipio: string | null;
  siglaOrgao: string | null;
  esferaOrgao: string | null;
  /** Em quantas atas a UASG participa (0: grupo confirmado de UASG que saiu dos itens). */
  atas: number;
  grupo: GrupoConfirmavel | null;
  confirmadoPorNome: string | null;
  confirmadoEm: string | null;
}

export async function fetchUasgsParticipantesGti(): Promise<UasgParticipanteGti[] | null> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('v_uasgs_participantes_gti')
    .select('codigo_uasg, nome, nome_na_ata, sigla_uf, municipio, sigla_orgao, esfera_orgao, atas, grupo, confirmado_por_nome, confirmado_em')
    .order('sigla_uf', { ascending: true, nullsFirst: false })
    .order('nome');
  if (error) {
    // null: a tela avisa que a migration ainda não foi aplicada.
    if (semMigration(error.code)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    uasg: String(r.codigo_uasg),
    nome: r.nome ?? null,
    nomeNaAta: r.nome_na_ata ?? null,
    siglaUf: r.sigla_uf ?? null,
    municipio: r.municipio ?? null,
    siglaOrgao: r.sigla_orgao ?? null,
    esferaOrgao: r.esfera_orgao ?? null,
    atas: Number(r.atas) || 0,
    grupo: ehGrupoConfirmavel(r.grupo) ? r.grupo : null,
    confirmadoPorNome: r.confirmado_por_nome ?? null,
    confirmadoEm: r.confirmado_em ?? null
  }));
}

/** Grupo confirmado das UASGs pedidas (as sem grupo ficam fora do mapa). */
export async function fetchGruposDasUasgs(uasgs: string[]): Promise<Map<string, GrupoConfirmavel>> {
  const mapa = new Map<string, GrupoConfirmavel>();
  const codigos = [...new Set(uasgs.filter((u) => /^\d{6}$/.test(u)))].sort();
  if (!supabase || codigos.length === 0) return mapa;
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase.from('uasgs_grupo_gti').select('codigo_uasg, grupo').in('codigo_uasg', codigos.slice(i, i + 200));
    if (error) {
      if (semMigration(error.code)) return mapa;
      throw new Error(error.message);
    }
    for (const r of data ?? []) if (ehGrupoConfirmavel(r.grupo)) mapa.set(String(r.codigo_uasg), r.grupo);
  }
  return mapa;
}

/** Confirma (ou, com grupo null, tira) o grupo das UASGs. Devolve quantas mudaram. */
export async function definirGruposUasgs(itens: Array<{ uasg: string; grupo: GrupoConfirmavel | null }>): Promise<number> {
  if (!supabase) throw new Error('Banco de dados indisponível.');
  let total = 0;
  for (let i = 0; i < itens.length; i += 500) {
    const { data, error } = await supabase.rpc('definir_grupos_uasgs', {
      p_itens: itens.slice(i, i + 500).map((x) => ({ codigo_uasg: x.uasg, grupo: x.grupo }))
    });
    if (error) {
      if (error.code === '42501') throw new Error('Só o coordenador define o grupo das UASGs.');
      throw new Error(error.message);
    }
    total += typeof data === 'number' ? data : 0;
  }
  return total;
}
