/**
 * Fornecedor das atas que o PNCP publica sem fornecedor (tabela atas_fornecedor_pncp, migration 107).
 *
 * O Contratos.gov.br publica a ata no PNCP no mesmo dia, sem dizer o fornecedor; o Compras.gov.br, que diz,
 * demora semanas. Quando a compra gerou mais de uma ata, a sincronização não sabe de quem são os itens e deixa
 * a ata sem itens. Aqui fica a pendência detectada pela sincronização (com os fornecedores que têm resultado na
 * compra), a indicação do coordenador e a conferência com o Compras.gov.br quando ele chega.
 *
 * Escrita: só o servidor (service role) detecta, confere e apaga; o coordenador indica e desfaz pelas RPCs.
 */
import { supabase, isSupabaseConfigured, ehServidor } from './supabaseClient';
import { normalizarIdentificadorFornecedor, type CandidatoFornecedorPncp, type PendenciaFornecedorPncp } from './api';
import type { ArpItemRecord } from '../types';

export type EstadoFornecedorPncp = 'PENDENTE' | 'INDICADO' | 'CONFERIDO' | 'DIVERGENTE';

export interface RegistroFornecedorPncp {
  numeroControlePncp: string;
  numeroAta: string;
  codigoUasg: string;
  numeroControlePncpCompra?: string;
  numeroCompra?: string;
  anoCompra?: string;
  atasNaCompra?: number;
  estado: EstadoFornecedorPncp;
  candidatos: CandidatoFornecedorPncp[];
  itensSemResultado: PendenciaFornecedorPncp['itensSemResultado'];
  fornecedorIdentificador?: string;
  fornecedorNome?: string;
  comoConfirmou?: string;
  indicadoPorNome?: string;
  indicadoEm?: string;
  fonteFornecedorIdentificador?: string;
  fonteFornecedorNome?: string;
  conferidoEm?: string;
  detectadoEm: string;
  atualizadoEm: string;
}

interface LinhaCandidato {
  identificador?: string;
  nome?: string;
  itens?: Array<{ numero_item?: number; descricao?: string; quantidade?: number; valor_unitario?: number; valor_total?: number }>;
}

interface LinhaRegistro {
  numero_controle_pncp: string;
  numero_ata: string;
  codigo_uasg: string;
  numero_controle_pncp_compra: string | null;
  numero_compra: string | null;
  ano_compra: string | null;
  atas_na_compra: number | null;
  estado: EstadoFornecedorPncp;
  candidatos: LinhaCandidato[] | null;
  itens_sem_resultado: Array<{ numero_item?: number; descricao?: string; quantidade?: number }> | null;
  fornecedor_identificador: string | null;
  fornecedor_nome: string | null;
  como_confirmou: string | null;
  indicado_por_nome: string | null;
  indicado_em: string | null;
  fonte_fornecedor_identificador: string | null;
  fonte_fornecedor_nome: string | null;
  conferido_em: string | null;
  detectado_em: string;
  atualizado_em: string;
}

const COLUNAS = 'numero_controle_pncp, numero_ata, codigo_uasg, numero_controle_pncp_compra, numero_compra, ano_compra, atas_na_compra, estado, candidatos, itens_sem_resultado, fornecedor_identificador, fornecedor_nome, como_confirmou, indicado_por_nome, indicado_em, fonte_fornecedor_identificador, fonte_fornecedor_nome, conferido_em, detectado_em, atualizado_em';

function candidatoDaLinha(c: LinhaCandidato): CandidatoFornecedorPncp {
  return {
    identificador: c.identificador || '',
    nome: c.nome || '',
    itens: (c.itens || []).map((i) => ({
      numeroItem: Number(i.numero_item) || 0,
      descricao: i.descricao || '',
      quantidade: Number(i.quantidade) || 0,
      valorUnitario: Number(i.valor_unitario) || 0,
      valorTotal: Number(i.valor_total) || 0
    }))
  };
}

export function registroDaLinha(r: LinhaRegistro): RegistroFornecedorPncp {
  return {
    numeroControlePncp: r.numero_controle_pncp,
    numeroAta: r.numero_ata,
    codigoUasg: r.codigo_uasg,
    numeroControlePncpCompra: r.numero_controle_pncp_compra || undefined,
    numeroCompra: r.numero_compra || undefined,
    anoCompra: r.ano_compra || undefined,
    atasNaCompra: r.atas_na_compra ?? undefined,
    estado: r.estado,
    candidatos: (r.candidatos || []).map(candidatoDaLinha),
    itensSemResultado: (r.itens_sem_resultado || []).map((i) => ({ numeroItem: Number(i.numero_item) || 0, descricao: i.descricao || '', quantidade: Number(i.quantidade) || 0 })),
    fornecedorIdentificador: r.fornecedor_identificador || undefined,
    fornecedorNome: r.fornecedor_nome || undefined,
    comoConfirmou: r.como_confirmou || undefined,
    indicadoPorNome: r.indicado_por_nome || undefined,
    indicadoEm: r.indicado_em || undefined,
    fonteFornecedorIdentificador: r.fonte_fornecedor_identificador || undefined,
    fonteFornecedorNome: r.fonte_fornecedor_nome || undefined,
    conferidoEm: r.conferido_em || undefined,
    detectadoEm: r.detectado_em,
    atualizadoEm: r.atualizado_em
  };
}

/** Todos os registros (poucos: só atas publicadas sem fornecedor). Leitura para qualquer logado. */
export async function fetchRegistrosFornecedorPncp(): Promise<RegistroFornecedorPncp[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('atas_fornecedor_pncp').select(COLUNAS);
  if (error) throw error;
  return ((data || []) as unknown as LinhaRegistro[]).map(registroDaLinha);
}

/** Candidatos no formato da coluna (snake_case). */
function candidatosParaGravar(p: Pick<PendenciaFornecedorPncp, 'candidatos' | 'itensSemResultado'>) {
  return {
    candidatos: p.candidatos.map((c) => ({
      identificador: c.identificador,
      nome: c.nome,
      itens: c.itens.map((i) => ({ numero_item: i.numeroItem, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valorUnitario, valor_total: i.valorTotal }))
    })),
    itens_sem_resultado: p.itensSemResultado.map((i) => ({ numero_item: i.numeroItem, descricao: i.descricao, quantidade: i.quantidade }))
  };
}

/**
 * Grava as pendências detectadas nesta sincronização (só o servidor). Ata nova entra como PENDENTE; ata já
 * registrada só tem os candidatos e a contagem de atas atualizados, em qualquer estado: a indicação do
 * coordenador e a conferência nunca são sobrescritas aqui. Devolve quantas linhas gravou.
 */
export async function gravarPendenciasFornecedorPncp(pendencias: PendenciaFornecedorPncp[]): Promise<number> {
  if (!ehServidor || !isSupabaseConfigured || !supabase || pendencias.length === 0) return 0;
  const agora = new Date().toISOString();
  let gravadas = 0;
  for (const p of pendencias) {
    if (!p.numeroControlePncpAta) continue;
    const { data: existente, error: erroLeitura } = await supabase
      .from('atas_fornecedor_pncp')
      .select('numero_controle_pncp, estado')
      .eq('numero_controle_pncp', p.numeroControlePncpAta)
      .maybeSingle();
    if (erroLeitura) throw erroLeitura;
    const colunas = candidatosParaGravar(p);
    if (existente) {
      const { error } = await supabase
        .from('atas_fornecedor_pncp')
        .update({ ...colunas, atas_na_compra: p.atasNaCompra, numero_compra: p.numeroCompra || null, atualizado_em: agora })
        .eq('numero_controle_pncp', p.numeroControlePncpAta);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('atas_fornecedor_pncp').insert({
        numero_controle_pncp: p.numeroControlePncpAta,
        numero_ata: p.numeroAta,
        codigo_uasg: p.uasg,
        numero_controle_pncp_compra: p.numeroControlePncpCompra || null,
        numero_compra: p.numeroCompra || null,
        ano_compra: p.anoCompra || null,
        atas_na_compra: p.atasNaCompra,
        estado: 'PENDENTE',
        ...colunas,
        detectado_em: agora,
        atualizado_em: agora
      });
      if (error) throw error;
    }
    gravadas++;
  }
  return gravadas;
}

/** Fornecedor dos itens que a fonte oficial entregou (o primeiro com identificador; a ata tem um fornecedor só). */
export function fornecedorDosItens(itens: ArpItemRecord[]): { identificador: string; nome: string } | null {
  const item = itens.find((i) => normalizarIdentificadorFornecedor(i.niFornecedor));
  return item ? { identificador: normalizarIdentificadorFornecedor(item.niFornecedor), nome: item.nomeRazaoSocialFornecedor || '' } : null;
}

/**
 * O Compras.gov.br publicou a ata com os itens (só o servidor): a pendência sem indicação deixa de existir; a
 * indicação do coordenador é conferida com o fornecedor da fonte (CONFERIDO ou DIVERGENTE). Devolve o estado final
 * ('APAGADO' quando a pendência saiu) ou null se não havia registro.
 */
export async function conferirFornecedorPelaFonte(
  registro: RegistroFornecedorPncp,
  itensDaFonte: ArpItemRecord[]
): Promise<EstadoFornecedorPncp | 'APAGADO' | null> {
  if (!ehServidor || !isSupabaseConfigured || !supabase) return null;
  const fonte = fornecedorDosItens(itensDaFonte);
  if (!fonte) return null;
  if (registro.estado === 'PENDENTE') {
    const { error } = await supabase.from('atas_fornecedor_pncp').delete().eq('numero_controle_pncp', registro.numeroControlePncp);
    if (error) throw error;
    return 'APAGADO';
  }
  const estado: EstadoFornecedorPncp = normalizarIdentificadorFornecedor(registro.fornecedorIdentificador) === fonte.identificador ? 'CONFERIDO' : 'DIVERGENTE';
  const { error } = await supabase
    .from('atas_fornecedor_pncp')
    .update({
      estado,
      fonte_fornecedor_identificador: fonte.identificador,
      fonte_fornecedor_nome: fonte.nome || null,
      conferido_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    })
    .eq('numero_controle_pncp', registro.numeroControlePncp);
  if (error) throw error;
  return estado;
}

/** Indicações do coordenador (e já conferidas): número de controle da ata → identificador do fornecedor. */
export function indicacoesPorControle(registros: RegistroFornecedorPncp[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of registros) {
    if (r.estado !== 'PENDENTE' && r.fornecedorIdentificador) m.set(r.numeroControlePncp, r.fornecedorIdentificador);
  }
  return m;
}
