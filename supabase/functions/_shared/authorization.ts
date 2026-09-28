import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

/**
 * Verifica has_permission(p_permission_key) para o USUÁRIO CHAMADOR de uma
 * Edge Function, reusando o motor de autorização do RBAC
 * (20260925000024_rbac_authorization_engine.sql) em vez de lógica hardcoded.
 *
 * has_permission() resolve internamente via auth.uid() do lado do Postgres —
 * só é preenchido quando a chamada chega autenticada com o JWT do próprio
 * usuário via PostgREST. O client de service role usado pelas Edge Functions
 * (supabaseAdmin) não carrega esse contexto (auth.uid() seria NULL), por isso
 * a checagem precisa de um SEGUNDO client, autenticado com o Authorization
 * header original do chamador — nunca a service role key.
 */
export async function callerHasPermission(
  authHeader: string,
  permissionKey: string
): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const supabaseAsCaller = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data, error } = await supabaseAsCaller.rpc("has_permission", {
    p_permission_key: permissionKey
  });

  if (error) {
    return false;
  }

  return data === true;
}
