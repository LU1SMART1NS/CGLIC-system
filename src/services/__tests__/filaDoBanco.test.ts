import { describe, it, expect, vi } from 'vitest';
import { criarFila, criarFetchComFila, ehLeitura, FUNCOES_DE_LEITURA, LEITURAS_SIMULTANEAS } from '../filaDoBanco';

const BASE = 'https://exemplo.supabase.co';
const adiada = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promessa, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const ok = (corpo: unknown = []) => new Response(JSON.stringify(corpo), { status: 200 });
const esgotou = () => new Response(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }), { status: 500 });

describe('fila', () => {
  it('roda até o máximo e libera a vaga quando uma termina (também quando falha), na ordem de chegada', async () => {
    const naFila = criarFila(2);
    const tarefas = [adiada<string>(), adiada<string>(), adiada<string>(), adiada<string>()];
    const iniciadas: number[] = [];
    const resultados = tarefas.map((t, i) => naFila(() => (iniciadas.push(i), t.promessa)));
    resultados[0].catch(() => {}); // a falha é conferida no fim; evita rejeição solta antes disso
    await tick();
    expect(iniciadas).toEqual([0, 1]);
    tarefas[1].resolve('b');
    await tick();
    expect(iniciadas).toEqual([0, 1, 2]);
    tarefas[0].reject(new Error('falhou'));
    await tick();
    expect(iniciadas).toEqual([0, 1, 2, 3]);
    tarefas[2].resolve('c');
    tarefas[3].resolve('d');
    await expect(resultados[0]).rejects.toThrow('falhou');
    expect(await Promise.all(resultados.slice(1))).toEqual(['b', 'c', 'd']);
  });

  it('erro lançado na hora também libera a vaga', async () => {
    const naFila = criarFila(1);
    await expect(naFila(() => { throw new Error('na hora'); })).rejects.toThrow('na hora');
    expect(await naFila(() => Promise.resolve('ok'))).toBe('ok');
  });
});

describe('o que é leitura', () => {
  it('GET e HEAD da API REST são leitura', () => {
    expect(ehLeitura(`${BASE}/rest/v1/contratos_oficiais?select=*`)).toBe(true);
    expect(ehLeitura(`${BASE}/rest/v1/contratos_oficiais?select=*`, { method: 'HEAD' })).toBe(true);
  });

  it('gravações, login, arquivos e funções do servidor ficam fora', () => {
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) expect(ehLeitura(`${BASE}/rest/v1/avisos_resolvidos`, { method })).toBe(false);
    expect(ehLeitura(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST' })).toBe(false);
    expect(ehLeitura(`${BASE}/auth/v1/user`)).toBe(false);
    expect(ehLeitura(`${BASE}/storage/v1/object/x`)).toBe(false);
    expect(ehLeitura(`${BASE}/functions/v1/sincronizar-fontes`, { method: 'POST' })).toBe(false);
  });

  it('função do banco: só as que só leem entram; as que gravam e as desconhecidas ficam fora', () => {
    expect(FUNCOES_DE_LEITURA.has('execucao_entregas_do_contrato')).toBe(true);
    expect(ehLeitura(`${BASE}/rest/v1/rpc/execucao_entregas_do_contrato`, { method: 'POST' })).toBe(true);
    expect(FUNCOES_DE_LEITURA.has('confirmar_execucao_contrato')).toBe(false);
    expect(ehLeitura(`${BASE}/rest/v1/rpc/confirmar_execucao_contrato`, { method: 'POST' })).toBe(false);
    expect(ehLeitura(`${BASE}/rest/v1/rpc/funcao_que_ainda_nao_existe`, { method: 'POST' })).toBe(false);
  });
});

describe('fetch do cliente do banco', () => {
  it('no site, no máximo 12 leituras de cada vez', () => {
    expect(LEITURAS_SIMULTANEAS).toBe(12);
  });

  it('leituras esperam a vez; gravação passa na frente', async () => {
    const pendentes: Array<ReturnType<typeof adiada<Response>>> = [];
    const base = vi.fn(() => {
      const d = adiada<Response>();
      pendentes.push(d);
      return d.promessa;
    }) as unknown as typeof fetch;
    const f = criarFetchComFila(base, 2, 0);
    const leituras = [1, 2, 3].map((i) => f(`${BASE}/rest/v1/t${i}`));
    const gravacao = f(`${BASE}/rest/v1/t9`, { method: 'POST', body: '{}' });
    await tick();
    expect(base).toHaveBeenCalledTimes(3); // 2 leituras + a gravação; a 3ª leitura espera
    pendentes[0].resolve(ok());
    await tick();
    await tick();
    expect(base).toHaveBeenCalledTimes(4);
    pendentes.slice(1).forEach((p) => p.resolve(ok()));
    await Promise.all([...leituras, gravacao]);
  });

  it('leitura que esgota o tempo é repetida uma vez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = vi.fn().mockResolvedValueOnce(esgotou()).mockResolvedValueOnce(ok([1]));
    const r = await criarFetchComFila(base as unknown as typeof fetch, 6, 0)(`${BASE}/rest/v1/v_contrato_execucao`);
    expect(await r.json()).toEqual([1]);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('só uma repetição; outros erros e gravações não repetem', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sempre = vi.fn(async () => esgotou());
    const r = await criarFetchComFila(sempre as unknown as typeof fetch, 6, 0)(`${BASE}/rest/v1/x`);
    expect(r.status).toBe(500);
    expect(sempre).toHaveBeenCalledTimes(2);

    const outroErro = vi.fn(async () => new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 500 }));
    await criarFetchComFila(outroErro as unknown as typeof fetch, 6, 0)(`${BASE}/rest/v1/x`);
    expect(outroErro).toHaveBeenCalledTimes(1);

    const gravacao = vi.fn(async () => esgotou());
    await criarFetchComFila(gravacao as unknown as typeof fetch, 6, 0)(`${BASE}/rest/v1/rpc/confirmar_execucao_contrato`, { method: 'POST', body: '{}' });
    expect(gravacao).toHaveBeenCalledTimes(1);
  });
});
