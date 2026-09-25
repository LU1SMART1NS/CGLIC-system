import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { mapPerfilToDbRole } from "../_shared/roleMapping.ts";
import { resolveInviteRedirect } from "../_shared/inviteOrigin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        JSON.stringify({ error: "Acesso negado. Apenas gestores e administradores podem convidar usuários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { email, nome, perfil, action = "invite", origin, scope } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "E-mail institucional inválido ou ausente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Allow-list explícita de origens autorizadas a receber o redirect do convite.
    // O cliente informa sua própria origem (window.location.origin, sempre confiável);
    // aqui apenas validamos contra a lista — nunca aceitamos uma origem arbitrária
    // e nunca caímos silenciosamente em um fallback (ex.: localhost em produção).
    const redirectResolution = resolveInviteRedirect(origin);

    if (!redirectResolution.ok) {
      return new Response(
        JSON.stringify({ error: redirectResolution.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNome = (nome || cleanEmail.split("@")[0]).trim();
    // Fase 0.1: não substituir perfil ausente por "gestor". Um perfil vazio
    // permanece vazio e resultará em dbRole = null (fail-closed) abaixo.
    const cleanPerfil = typeof perfil === "string" ? perfil.trim() : "";

    // Mapeamento RBAC explícito (Fase 0.1): perfil sem mapeamento -> null.
    // NUNCA usar um valor padrão de role aqui.
    const dbRole = mapPerfilToDbRole(cleanPerfil);

    if (dbRole === "admin" && !isCallerAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem convidar outros administradores." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redirectTo = redirectResolution.redirectTo;

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        data: {
          nome: cleanNome,
          perfil: cleanPerfil
        },
        redirectTo
      }
    );

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const invitedUserId = inviteData.user.id;

    // Vincula ao RBAC oficial existente. Fail-closed (Fase 0.1): se o
    // perfil não tem mapeamento explícito, NENHUMA role é concedida — o
    // convite é concluído normalmente, mas o usuário fica sem autoridade
    // de escrita até que um administrador defina o mapeamento.
    if (dbRole !== null) {
      // A coluna legada `role` só aceita 'admin'/'gestor'/'leitor' (CHECK).
      // Roles novas (ex.: 'gestor_saldos') usam 'leitor' como placeholder
      // legado seguro, com o id real em `role_id` — mesma lógica de
      // manage-user/index.ts (ver comentário lá para a justificativa
      // completa de por que nunca usar 'gestor'/'admin' como placeholder).
      const LEGACY_CHECK_ROLES = new Set(["admin", "gestor", "leitor"]);
      const legacyRole = LEGACY_CHECK_ROLES.has(dbRole) ? dbRole : "leitor";

      await supabaseAdmin
        .from("user_roles")
        .upsert(
          {
            user_id: invitedUserId,
            role: legacyRole,
            role_id: dbRole
          },
          { onConflict: "user_id,role" }
        );

      // Fase 3A: atribuição opcional de escopo no próprio convite (mesma
      // semântica de substituição de manage-user/index.ts).
      if (scope && typeof scope === "object") {
        const { domain, scopeType, scopeValue } = scope as Record<string, unknown>;
        if (
          typeof domain === "string" && domain.trim() &&
          typeof scopeType === "string" && scopeType.trim() &&
          typeof scopeValue === "string" && scopeValue.trim()
        ) {
          await supabaseAdmin
            .from("user_scope_assignments")
            .insert({
              user_id: invitedUserId,
              domain: domain.trim(),
              scope_type: scopeType.trim(),
              scope_value: scopeValue.trim()
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        roleGranted: dbRole !== null,
        ...(dbRole === null ? { warning: "PERFIL_SEM_MAPEAMENTO_RBAC" } : {}),
        message: action === "reinvite" ? "Convite reenviado com sucesso." : "Servidor convidado com sucesso.",
        user: {
          id: invitedUserId,
          email: cleanEmail,
          nome: cleanNome,
          perfil: cleanPerfil,
          status: "pendente",
          ativo: true,
          createdAt: new Date().toISOString()
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno ao processar convite." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
