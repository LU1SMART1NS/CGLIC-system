import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

export type DbRole = 'admin' | 'gestor' | 'leitor';

const PERFIL_TO_DB_ROLE: Readonly<Record<string, DbRole>> = Object.freeze({
  coordenador: 'admin',
  gestor: 'gestor',
  consulta: 'leitor',
});

export function mapPerfilToDbRole(perfil: unknown): DbRole | null {
  if (typeof perfil !== 'string') return null;
  const key = perfil.trim();
  if (!key) return null;
  return PERFIL_TO_DB_ROLE[key] ?? null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ~100 anos: usado como "permanente" pois o Supabase Auth não expõe um ban sem prazo.
const PERMANENT_BAN_DURATION = "876000h";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta (SUPABASE_SERVICE_ROLE_KEY ausente)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado. Cabeçalho Authorization ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user: callerUser }, error: callerError } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar permissão administrativa do chamador no public.user_roles
    const { data: callerRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id);

    if (roleError) {
      return new Response(
        JSON.stringify({ error: "Falha ao verificar autorização do chamador." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roles = callerRoles?.map((r: { role: string }) => r.role) || [];
    const isCallerAdmin = roles.includes("admin");
    const isCallerGestor = roles.includes("gestor");

    if (!isCallerAdmin && !isCallerGestor) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas gestores e administradores podem gerenciar servidores." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!userId || typeof userId !== "string") {
      return new Response(
        JSON.stringify({ error: "Identificador do servidor (userId) ausente ou inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update-role" || action === "update-user") {
      const { perfil, nome, email } = body;

      // Atualiza metadados no Supabase Auth (nome, email) se fornecidos
      const userUpdatePayload: Record<string, unknown> = {};
      if (typeof nome === "string" && nome.trim()) {
        userUpdatePayload.user_metadata = { nome: nome.trim() };
      }
      if (typeof email === "string" && email.trim() && email.includes("@")) {
        userUpdatePayload.email = email.trim().toLowerCase();
      }

      if (Object.keys(userUpdatePayload).length > 0) {
        const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, userUpdatePayload);
        if (metaError) {
          const isNotFound = metaError.message?.toLowerCase().includes("not found") || (metaError as any).status === 404;
          if (!isNotFound) {
            return new Response(
              JSON.stringify({ error: metaError.message || "Falha ao atualizar dados do servidor no Supabase Auth." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      if (perfil !== undefined) {
        // Mapeamento RBAC explícito (Fase 0.1): perfil sem mapeamento -> null.
        // NUNCA usar um valor padrão de role aqui — ausência de mapeamento
        // significa ausência de autoridade, não "gestor".
        const dbRole = mapPerfilToDbRole(perfil);

        if (dbRole === "admin" && !isCallerAdmin) {
          return new Response(
            JSON.stringify({ error: "Apenas administradores podem atribuir o perfil de administrador." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (dbRole === null) {
          // Fail-closed: revoga qualquer role de banco existente. O usuário
          // continua existindo e mantém o perfil de UI, mas fica sem
          // autoridade de escrita em public.user_roles até que um
          // administrador defina um mapeamento explícito para este perfil.
          const { error: revokeError } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId);

          if (revokeError) {
            return new Response(
              JSON.stringify({ error: revokeError.message || "Falha ao revogar papéis do servidor." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              roleGranted: false,
              warning: "PERFIL_SEM_MAPEAMENTO_RBAC",
              message:
                "Perfil salvo, porém nenhuma role de banco foi atribuída: este perfil não possui mapeamento RBAC explícito. O usuário não terá permissões de escrita até que um administrador defina um mapeamento válido."
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: upsertError } = await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: userId, role: dbRole },
            { onConflict: "user_id,role" }
          );

        if (upsertError) {
          const isFkError = upsertError.message?.toLowerCase().includes("foreign key") || upsertError.code === "23503";
          if (!isFkError) {
            return new Response(
              JSON.stringify({ error: upsertError.message || "Falha ao atualizar o perfil do servidor." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Remove vínculos de papéis antigos que não correspondem mais ao perfil atual
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .neq("role", dbRole);
      }

      return new Response(
        JSON.stringify({ success: true, roleGranted: true, message: "Dados e perfil atualizados com sucesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete-user") {
      // 1. Obter dados cadastrais e de acesso do usuário no Supabase Auth
      const { data: targetUserData, error: getTargetError } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (getTargetError || !targetUserData?.user) {
        // Se o usuário não existir mais no Auth, limpa user_roles de forma idempotente
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        return new Response(
          JSON.stringify({ success: true, message: "Registro inexistente ou já removido." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const targetUser = targetUserData.user;

      // 2. Trava de Segurança Pública: impede exclusão de quem já efetuou login ou ativou a conta
      if (targetUser.last_sign_in_at !== null && targetUser.last_sign_in_at !== undefined) {
        return new Response(
          JSON.stringify({
            error: "Não é permitido excluir um servidor que já acessou o sistema. Para revogar o acesso preservando o histórico de auditoria e conformidade pública, utilize a opção 'Desativar'."
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Verificação de permissões do chamador
      const targetIsAdmin = (
        await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin")
      ).data?.length;

      if (targetIsAdmin && !isCallerAdmin) {
        return new Response(
          JSON.stringify({ error: "Apenas administradores podem excluir o convite de outro administrador." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4. Revoga roles e exclui o convite não consumado no Supabase Auth
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) {
        const isNotFound = deleteError.message?.toLowerCase().includes("not found") || (deleteError as any).status === 404;
        if (!isNotFound) {
          return new Response(
            JSON.stringify({ error: deleteError.message || "Falha ao cancelar o convite no Supabase Auth." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Convite pendente cancelado e removido com sucesso."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "deactivate" || action === "reactivate") {
      const targetIsAdmin = (
        await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin")
      ).data?.length;

      if (targetIsAdmin && !isCallerAdmin) {
        return new Response(
          JSON.stringify({ error: "Apenas administradores podem desativar ou reativar outro administrador." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: action === "deactivate" ? PERMANENT_BAN_DURATION : "none"
      });

      if (banError) {
        return new Response(
          JSON.stringify({ error: banError.message || "Falha ao atualizar o status de acesso do servidor." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: action === "deactivate" ? "Acesso desativado com sucesso." : "Acesso reativado com sucesso."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno ao gerenciar servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
