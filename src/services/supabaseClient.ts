import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://bouutpmxexvwppcmmhdi.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_5nqKXMxqJnldoT4Wy5w-gg_T85JiyuT';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

const isTest = import.meta.env.MODE === 'test';

export const isSupabaseConfigured = !isTest && Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Types for Supabase Tables
export interface DbAllocation {
  id: string;
  item_key: string;
  unit_name: string;
  allocated_qty: number;
  empenhada_qty: number;
  created_at?: string;
}

export interface DbEmpenhoLink {
  id: string;
  item_key: string;
  empenho_numero: string;
  allocation_id: string;
  created_at?: string;
}

export interface DbAta {
  id: string;
  numero_ata: string;
  codigo_uasg: string;
  nome_uasg?: string;
  ano_compra?: string;
  numero_compra?: string;
  modalidade?: string;
  objeto?: string;
  valor_total?: number;
  data_vigencia_inicial?: string;
  data_vigencia_final?: string;
  status_ata?: string;
  numero_controle_pncp?: string;
  data_hora_atualizacao_api?: string;
  ultimo_sync_em?: string;
}

export interface DbProcessoSei {
  id: string;
  numero_processo_sei: string;
  descricao_objeto?: string;
  unidade_requisitante?: string;
  responsavel_nome?: string;
  status_processo?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbItemAta {
  id: string;
  ata_id: string;
  numero_item: string;
  codigo_pdm?: number;
  descricao_item?: string;
  fornecedor_cnpj_cpf?: string;
  fornecedor_razao_social?: string;
  quantidade_homologada?: number;
  valor_unitario?: number;
  valor_total?: number;
  maximo_adesao?: number;
  ultimo_sync_em?: string;
}

export interface DbAlocacaoInterna {
  id: string;
  item_id: string;
  processo_sei_id?: string;
  unidade_nome: string;
  quantidade_alocada: number;
  quantidade_empenhada: number;
  numero_empenho?: string;
  data_empenho?: string;
  observacoes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbEmpenhoManual {
  id: string;
  item_key: string;
  numero: string;
  ano: number;
  arp_id: string;
  item_id: string;
  uasg: string;
  quantidade: number;
  valor_unitario?: number | null;
  valor_total?: number | null;
  data?: string | null;
  fornecedor?: string | null;
  cnpj_fornecedor?: string | null;
  unidade_interna_id?: string | null;
  observacao?: string | null;
  origem: string;
  status: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface DbContratoManual {
  id: string;
  item_key: string;
  numero: string;
  ano: number;
  arp_id: string;
  item_id?: string | null;
  uasg: string;
  numero_controle_pncp?: string | null;
  link_pncp?: string | null;
  fornecedor?: string | null;
  cnpj_fornecedor?: string | null;
  objeto?: string | null;
  quantidade_contratada?: number | null;
  valor_total?: number | null;
  origem: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface DbContratoEmpenhoLink {
  id: string;
  item_key: string;
  contrato_id: string;
  empenho_id: string;
  quantidade_vinculada?: number | null;
  data_vinculo?: string;
  origem: string;
}

export interface DbEmpenhoManualQuantidade {
  item_key: string;
  emp_key: string;
  quantidade: number;
}


