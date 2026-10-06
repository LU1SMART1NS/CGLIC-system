/**
 * Tratamento da requisição HTTP da Edge Function sincronizar-fontes, sem depender do Deno (testável).
 *
 * Quem pode chamar:
 * - o agendamento do banco (pg_cron + pg_net), com o segredo no cabeçalho `x-cron-secret`: só sincroniza o
 *   que passou da validade, nunca força;
 * - o coordenador (perfil admin), com o token da sessão em `Authorization`: também pode forçar.
 * Qualquer outra chamada é recusada. A função não tem verificação de JWT do Supabase (verify_jwt = false)
 * porque o agendamento não tem token de usuário; a verificação é feita aqui.
 */
import { executarPedido, validarPedido, type PedidoDeSincronizacao } from './executar';

export interface DependenciasDoHandler {
  /** Segredo esperado do agendamento (variável de ambiente CRON_SECRET). */
  segredoDoAgendamento: () => string | undefined;
  /** O token pertence a um usuário com perfil admin (coordenador)? */
  tokenEhDeAdmin: (token: string) => Promise<boolean>;
  executar: (pedido: PedidoDeSincronizacao) => Promise<unknown>;
  /**
   * Mantém a execução viva depois de responder (EdgeRuntime.waitUntil). Sem isso, o handler espera o fim.
   * O agendamento do banco não espera resposta longa: responde-se 202 e a sincronização continua.
   */
  emSegundoPlano?: (promessa: Promise<unknown>) => void;
}

const CABECALHOS_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json' } });
}

/** Comparação que não vaza, pelo tempo, quantos caracteres batem. */
export function segredosIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export function criarHandler(deps: DependenciasDoHandler): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS_CORS });
    if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);

    // 1) Quem está chamando
    const segredoEsperado = deps.segredoDoAgendamento();
    const segredoRecebido = req.headers.get('x-cron-secret');
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let origem: 'agendamento' | 'coordenador';
    if (segredoRecebido) {
      if (!segredoEsperado || !segredosIguais(segredoRecebido, segredoEsperado)) return json({ erro: 'Segredo inválido.' }, 401);
      origem = 'agendamento';
    } else if (token) {
      let admin = false;
      try {
        admin = await deps.tokenEhDeAdmin(token);
      } catch (err) {
        console.error('[sincronizar-fontes] falha ao verificar o usuário:', err);
        return json({ erro: 'Não foi possível verificar o usuário.' }, 500);
      }
      if (!admin) return json({ erro: 'Acesso restrito ao coordenador.' }, 403);
      origem = 'coordenador';
    } else {
      return json({ erro: 'Não autenticado.' }, 401);
    }

    // 2) O que foi pedido
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return json({ erro: 'JSON inválido.' }, 400);
    }
    const validacao = validarPedido(corpo);
    if (!validacao.ok) return json({ erro: validacao.erro }, 400);
    // O agendamento nunca força: só o coordenador pula a validade.
    const pedido: PedidoDeSincronizacao = { ...validacao.pedido, forcar: origem === 'coordenador' && validacao.pedido.forcar };

    // 3) Executa
    const execucao = deps.executar(pedido).catch((err) => {
      console.error('[sincronizar-fontes] execução falhou:', pedido, err);
      throw err;
    });

    // Teste de acesso às fontes: o chamador quer o resultado.
    if (pedido.dry || !deps.emSegundoPlano) {
      try {
        return json({ origem, ...(await execucao as object) }, 200);
      } catch (err) {
        return json({ origem, erro: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    execucao.catch(() => undefined);
    deps.emSegundoPlano(execucao);
    return json({ aceito: true, origem, pedido }, 202);
  };
}

export { executarPedido };
