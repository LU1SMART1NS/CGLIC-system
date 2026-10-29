/**
 * Leitura das atas a montar e gravação do rascunho do gestor (migration 238). O navegador só lê o que o servidor
 * gravou (atasAMontarSyncService) e grava o rascunho pela RPC salvar_rascunho_ata_a_montar (gestor e coordenador).
 */
import { supabase } from './supabaseClient';
import { mensagemDeErro } from './sincronizacaoFontesService';
import type { ItemDaCompra, LeituraDaMinuta } from './atasAMontarSyncService';
import type { RascunhoDaAta } from '../utils/ataAMontarQuadros';

export type EstadoDaMinutaNaTela = 'PENDENTE' | 'LIDA' | 'A_CONFERIR' | 'SEM_MINUTA' | 'ERRO';

/** Uma linha da lista: fornecedor vencedor ainda sem ata (v_atas_a_montar). */
export interface AtaAMontar {
  numeroControleCompra: string;
  anoCompra: number;
  sequencialCompra: number;
  numeroCompra: string | null;
  processo: string | null;
  objeto: string | null;
  fornecedorNi: string;
  fornecedorNome: string;
  itens: number;
  valorTotal: number;
  homologadoEm: string | null;
  minutaEstado: EstadoDaMinutaNaTela;
  itensAConferir: number;
  rascunhoAtualizadoEm: string | null;
  rascunhoAtualizadoPorNome: string | null;
}

export interface CompraAMontar {
  numeroControleCompra: string;
  codigoUasg: string;
  anoCompra: number;
  sequencialCompra: number;
  numeroCompra: string | null;
  processo: string | null;
  objeto: string | null;
  itens: ItemDaCompra[];
  itensLidosEm: string | null;
  minutaEstado: EstadoDaMinutaNaTela;
  minuta: LeituraDaMinuta | null;
  minutaLidaEm: string | null;
}

export interface RascunhoSalvo {
  dados: RascunhoDaAta;
  atualizadoEm: string;
  atualizadoPorNome: string | null;
}

/** "00394494000136-1-000797/2026" → ano e sequencial (endereço da tela). */
export function partesDoControle(controle: string): { ano: number; sequencial: number } | null {
  const m = /^\d{14}-1-(\d{6})\/(\d{4})$/.exec(controle);
  return m ? { ano: Number(m[2]), sequencial: Number(m[1]) } : null;
}
export const controleDaCompra = (ano: number | string, sequencial: number | string) => `00394494000136-1-${String(sequencial).padStart(6, '0')}/${ano}`;

const banco = () => {
  if (!supabase) throw new Error('Banco indisponível.');
  return supabase;
};

export async function fetchAtasAMontar(): Promise<AtaAMontar[]> {
  const { data, error } = await banco().from('v_atas_a_montar').select('*');
  if (error) throw new Error(mensagemDeErro(error));
  return (data ?? []).map((r: Record<string, any>) => {
    const p = partesDoControle(String(r.numero_controle_compra)) ?? { ano: Number(r.ano_compra), sequencial: 0 };
    return {
      numeroControleCompra: String(r.numero_controle_compra),
      anoCompra: p.ano,
      sequencialCompra: p.sequencial,
      numeroCompra: r.numero_compra ?? null,
      processo: r.processo ?? null,
      objeto: r.objeto ?? null,
      fornecedorNi: String(r.fornecedor_ni),
      fornecedorNome: String(r.fornecedor_nome ?? ''),
      itens: Number(r.itens ?? 0),
      valorTotal: Number(r.valor_total ?? 0),
      homologadoEm: r.homologado_em ?? null,
      minutaEstado: r.minuta_estado as EstadoDaMinutaNaTela,
      itensAConferir: Number(r.itens_a_conferir ?? 0),
      rascunhoAtualizadoEm: r.rascunho_atualizado_em ?? null,
      rascunhoAtualizadoPorNome: r.rascunho_atualizado_por_nome ?? null
    };
  });
}

export async function fetchCompraAMontar(controle: string): Promise<CompraAMontar | null> {
  const { data, error } = await banco().from('atas_a_montar_compras').select('*').eq('numero_controle_compra', controle).maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  if (!data) return null;
  const r = data as Record<string, any>;
  return {
    numeroControleCompra: r.numero_controle_compra,
    codigoUasg: r.codigo_uasg,
    anoCompra: Number(r.ano_compra),
    sequencialCompra: Number(r.sequencial_compra),
    numeroCompra: r.numero_compra ?? null,
    processo: r.processo ?? null,
    objeto: r.objeto ?? null,
    itens: Array.isArray(r.itens) ? (r.itens as ItemDaCompra[]) : [],
    itensLidosEm: r.itens_lidos_em ?? null,
    minutaEstado: r.minuta_estado as EstadoDaMinutaNaTela,
    // Falha de leitura grava {erro}: sem itens lidos.
    minuta: r.minuta && typeof r.minuta === 'object' && 'itens' in r.minuta ? (r.minuta as LeituraDaMinuta) : null,
    minutaLidaEm: r.minuta_lida_em ?? null
  };
}

export async function fetchRascunhoDaAta(controle: string, fornecedorNi: string): Promise<RascunhoSalvo | null> {
  const { data, error } = await banco()
    .from('atas_a_montar_rascunhos')
    .select('dados, atualizado_em, atualizado_por_nome')
    .eq('numero_controle_compra', controle)
    .eq('fornecedor_ni', fornecedorNi)
    .maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  if (!data) return null;
  return { dados: (data.dados ?? {}) as RascunhoDaAta, atualizadoEm: data.atualizado_em, atualizadoPorNome: data.atualizado_por_nome ?? null };
}

export async function salvarRascunhoDaAta(controle: string, fornecedorNi: string, dados: RascunhoDaAta): Promise<string> {
  const { data, error } = await banco().rpc('salvar_rascunho_ata_a_montar', { p_compra: controle, p_fornecedor_ni: fornecedorNi, p_dados: dados });
  if (error) throw new Error(mensagemDeErro(error).replace(/^INVALID_PAYLOAD:\s*|^UNAUTHORIZED:\s*/, ''));
  return String((data as { atualizado_em?: string } | null)?.atualizado_em ?? new Date().toISOString());
}

/** Divisão planejada na montagem da ata, por item da ata publicada (v_divisao_da_ata_montada, migration 239). */
export interface DivisaoDaAtaMontada {
  itemKey: string;
  unidades: Array<{ unidade: string; quantidade: number }>;
  montadaPorNome: string | null;
  montadaEm: string;
}

export async function fetchDivisoesDasAtasMontadas(): Promise<Map<string, DivisaoDaAtaMontada>> {
  const { data, error } = await banco().from('v_divisao_da_ata_montada').select('item_key, unidades, montada_por_nome, montada_em');
  if (error) {
    // Migration 239 ainda não aplicada: sem sugestões.
    if (error.code === '42P01' || error.code === 'PGRST205') return new Map();
    throw new Error(mensagemDeErro(error));
  }
  return new Map(
    (data ?? []).map((r: Record<string, any>) => [
      String(r.item_key),
      {
        itemKey: String(r.item_key),
        unidades: (Array.isArray(r.unidades) ? r.unidades : []).map((u: Record<string, unknown>) => ({ unidade: String(u.unidade), quantidade: Number(u.quantidade) })),
        montadaPorNome: r.montada_por_nome ?? null,
        montadaEm: r.montada_em
      }
    ])
  );
}
