import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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
    const { email, nome, perfil, action = "invite" } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "E-mail institucional inválido ou ausente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNome = (nome || cleanEmail.split("@")[0]).trim();
    const cleanPerfil = perfil || "gestor";

    // Mapeamento RBAC: coordenador -> admin, gestor -> gestor, consulta -> leitor
    let dbRole = "gestor";
    if (cleanPerfil === "coordenador") dbRole = "admin";
    else if (cleanPerfil === "consulta") dbRole = "leitor";

    if (dbRole === "admin" && !isCallerAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem convidar outros administradores." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appOrigin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:5173";
    const cleanOrigin = appOrigin.replace(/\/$/, "");
    const redirectTo = `${cleanOrigin}/definir-senha`;

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

    // Vincula ao RBAC oficial existente
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: invitedUserId,
          role: dbRole
        },
        { onConflict: "user_id,role" }
      );

    return new Response(
      JSON.stringify({
        success: true,
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
