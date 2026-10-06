/**
 * Cliente do Supabase para a sincronização no servidor, com a chave de service role (sem RLS, sem usuário).
 *
 * No empacotamento da Edge Function este módulo SUBSTITUI src/services/supabaseClient.ts (o do navegador):
 * os serviços de sincronização do app importam `supabase` e `isSupabaseConfigured` de lá e passam a usar
 * este cliente sem nenhuma mudança (ver scripts/build-sincronizar-fontes.mjs).
 */
import { createClient } from '@supabase/supabase-js';
import { lerAmbiente } from './ambiente';

const url = lerAmbiente('SUPABASE_URL');
const chaveServico = lerAmbiente('SUPABASE_SERVICE_ROLE_KEY');

export const isSupabaseConfigured = Boolean(url && chaveServico);

export const supabase = isSupabaseConfigured
  ? createClient(url as string, chaveServico as string, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
