/**
 * Edge Function sincronizar-fontes: sincroniza contratos, atas e saldos dos itens com as fontes oficiais.
 * Chamada de hora em hora pelo agendamento do banco (migration 77) e pelo botão do coordenador.
 *
 * Este arquivo é o ponto de entrada do empacotamento (scripts/build-sincronizar-fontes.mjs), que gera
 * supabase/functions/sincronizar-fontes/index.js a partir dele e dos serviços de src/.
 */
import { instalarProxyDeFontes } from './proxyDeFontes';
import { criarHandler } from './handler';
import { executarPedido } from './executar';
import { supabase } from './supabaseServidor';
import { lerAmbiente } from './ambiente';

type RuntimeComEspera = { waitUntil?: (promessa: Promise<unknown>) => void };
type DenoComServe = { serve: (tratador: (req: Request) => Promise<Response>) => unknown };

instalarProxyDeFontes();

async function tokenEhDeAdmin(token: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: perfis, error: erroPerfis } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id);
  if (erroPerfis) throw erroPerfis;
  return (perfis ?? []).some((p: { role: string }) => p.role === 'admin');
}

const edgeRuntime = (globalThis as { EdgeRuntime?: RuntimeComEspera }).EdgeRuntime;

const tratador = criarHandler({
  segredoDoAgendamento: () => lerAmbiente('CRON_SECRET'),
  tokenEhDeAdmin,
  executar: (pedido) => executarPedido(pedido),
  emSegundoPlano: edgeRuntime?.waitUntil ? (promessa) => edgeRuntime.waitUntil!(promessa) : undefined
});

(globalThis as unknown as { Deno: DenoComServe }).Deno.serve(tratador);
