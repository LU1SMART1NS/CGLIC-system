import { describe, it, expect, vi } from 'vitest';
import { criarHandler, segredosIguais, type DependenciasDoHandler } from '../handler';

const SEGREDO = 'segredo-do-agendamento-com-mais-de-trinta-caracteres';

function montar(extra: Partial<DependenciasDoHandler> = {}) {
  const executar = vi.fn(async (pedido: unknown) => ({ ok: true, pedido }));
  const deps: DependenciasDoHandler = {
    segredoDoAgendamento: () => SEGREDO,
    tokenEhDeAdmin: async (token) => token === 'token-admin',
    executar,
    ...extra
  };
  return { handler: criarHandler(deps), executar, deps };
}

function requisicao(corpo: unknown, cabecalhos: Record<string, string> = {}, metodo = 'POST') {
  return new Request('https://x.supabase.co/functions/v1/sincronizar-fontes', {
    method: metodo,
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: metodo === 'POST' ? JSON.stringify(corpo) : undefined
  });
}

const contratos = { recurso: 'contratos', uasg: '200331' };

describe('segredosIguais', () => {
  it('compara por igualdade total', () => {
    expect(segredosIguais('abc', 'abc')).toBe(true);
    expect(segredosIguais('abc', 'abd')).toBe(false);
    expect(segredosIguais('abc', 'abcd')).toBe(false);
  });
});

describe('autenticação', () => {
  it('sem credenciais: 401 e nada é executado', async () => {
    const { handler, executar } = montar();
    const r = await handler(requisicao(contratos));
    expect(r.status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it('segredo do agendamento errado: 401', async () => {
    const { handler, executar } = montar();
    expect((await handler(requisicao(contratos, { 'x-cron-secret': 'errado' }))).status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it('segredo não configurado no servidor: nenhum segredo vale', async () => {
    const { handler, executar } = montar({ segredoDoAgendamento: () => undefined });
    expect((await handler(requisicao(contratos, { 'x-cron-secret': 'qualquer' }))).status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it('segredo certo: executa', async () => {
    const { handler, executar } = montar();
    const r = await handler(requisicao(contratos, { 'x-cron-secret': SEGREDO }));
    expect(r.status).toBe(200);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('token de usuário que não é admin: 403', async () => {
    const { handler, executar } = montar();
    expect((await handler(requisicao(contratos, { authorization: 'Bearer token-gestor' }))).status).toBe(403);
    expect(executar).not.toHaveBeenCalled();
  });

  it('token do coordenador: executa', async () => {
    const { handler, executar } = montar();
    expect((await handler(requisicao(contratos, { authorization: 'Bearer token-admin' }))).status).toBe(200);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('falha ao verificar o usuário: 500, sem executar', async () => {
    const { handler, executar } = montar({ tokenEhDeAdmin: async () => { throw new Error('banco fora'); } });
    expect((await handler(requisicao(contratos, { authorization: 'Bearer x' }))).status).toBe(500);
    expect(executar).not.toHaveBeenCalled();
  });

  it('só aceita POST; OPTIONS responde o CORS', async () => {
    const { handler } = montar();
    expect((await handler(requisicao(null, {}, 'GET'))).status).toBe(405);
    const opcoes = await handler(requisicao(null, {}, 'OPTIONS'));
    expect(opcoes.status).toBe(200);
    expect(opcoes.headers.get('access-control-allow-headers')).toContain('x-cron-secret');
  });
});

describe('forçar a atualização', () => {
  it('o agendamento nunca força, mesmo pedindo', async () => {
    const { handler, executar } = montar();
    await handler(requisicao({ ...contratos, forcar: true }, { 'x-cron-secret': SEGREDO }));
    expect(executar.mock.calls[0][0]).toMatchObject({ forcar: false });
  });

  it('o coordenador força', async () => {
    const { handler, executar } = montar();
    await handler(requisicao({ ...contratos, forcar: true }, { authorization: 'Bearer token-admin' }));
    expect(executar.mock.calls[0][0]).toMatchObject({ forcar: true });
  });
});

describe('corpo da requisição', () => {
  it('JSON inválido: 400', async () => {
    const { handler } = montar();
    const req = new Request('https://x/f', { method: 'POST', headers: { 'x-cron-secret': SEGREDO }, body: '{não é json' });
    expect((await handler(req)).status).toBe(400);
  });

  it.each([
    [{ recurso: 'outro', uasg: '200331' }],
    [{ recurso: 'contratos' }],
    [{ recurso: 'atas', uasg: '999999' }],
    [null]
  ])('pedido inválido %j: 400, sem executar', async (corpo) => {
    const { handler, executar } = montar();
    expect((await handler(requisicao(corpo, { 'x-cron-secret': SEGREDO }))).status).toBe(400);
    expect(executar).not.toHaveBeenCalled();
  });

  it('saldos_itens não precisa de UASG', async () => {
    const { handler, executar } = montar();
    expect((await handler(requisicao({ recurso: 'saldos_itens' }, { 'x-cron-secret': SEGREDO }))).status).toBe(200);
    expect(executar.mock.calls[0][0]).toMatchObject({ recurso: 'saldos_itens' });
  });
});

describe('execução em segundo plano', () => {
  it('com suporte a segundo plano: responde 202 na hora e a execução continua', async () => {
    let termina!: () => void;
    const execucaoLenta = new Promise<unknown>((resolve) => { termina = () => resolve({ ok: true }); });
    const emSegundoPlano = vi.fn();
    const { handler } = montar({ executar: () => execucaoLenta, emSegundoPlano });
    const r = await handler(requisicao(contratos, { 'x-cron-secret': SEGREDO }));
    expect(r.status).toBe(202);
    expect(emSegundoPlano).toHaveBeenCalledTimes(1);
    termina();
    await execucaoLenta;
  });

  it('execução que falha em segundo plano não derruba o processo', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const emSegundoPlano = vi.fn((p: Promise<unknown>) => { p.catch(() => undefined); });
    const { handler } = montar({ executar: async () => { throw new Error('fonte fora'); }, emSegundoPlano });
    expect((await handler(requisicao(contratos, { 'x-cron-secret': SEGREDO }))).status).toBe(202);
    await new Promise((r) => setTimeout(r, 0));
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it('teste de acesso (dry) devolve o resultado na própria resposta, mesmo com segundo plano disponível', async () => {
    const emSegundoPlano = vi.fn();
    const { handler } = montar({ emSegundoPlano });
    const r = await handler(requisicao({ ...contratos, dry: true }, { authorization: 'Bearer token-admin' }));
    expect(r.status).toBe(200);
    expect(emSegundoPlano).not.toHaveBeenCalled();
    expect(await r.json()).toMatchObject({ origem: 'coordenador', ok: true });
  });

  it('sem segundo plano (testes e ambiente local): espera o resultado; falha vira 500', async () => {
    const { handler } = montar({ executar: async () => { throw new Error('fonte fora'); } });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await handler(requisicao(contratos, { 'x-cron-secret': SEGREDO }));
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ erro: 'fonte fora' });
    erro.mockRestore();
  });
});
