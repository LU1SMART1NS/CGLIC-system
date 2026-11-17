import { describe, it, expect, vi } from 'vitest';
import { criarFila, ehTempoEsgotado, repetirNoTempoEsgotado, LEITURAS_SIMULTANEAS_DO_PAINEL } from '../dashboardService';

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

describe('fila das leituras do painel', () => {
  it('o painel lê no máximo 4 fontes de cada vez', () => {
    expect(LEITURAS_SIMULTANEAS_DO_PAINEL).toBe(4);
  });

  it('roda até o máximo e libera a vaga quando uma termina, na ordem de chegada', async () => {
    const naFila = criarFila(2);
    const tarefas = [adiada<string>(), adiada<string>(), adiada<string>(), adiada<string>()];
    const iniciadas: number[] = [];
    const resultados = tarefas.map((t, i) => naFila(() => (iniciadas.push(i), t.promessa)));
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

describe('repetir no tempo esgotado', () => {
  it('reconhece o tempo esgotado pelo código ou pela mensagem embrulhada', () => {
    expect(ehTempoEsgotado({ code: '57014', message: 'x' })).toBe(true);
    expect(ehTempoEsgotado(new Error('Não foi possível ler o saldo dos itens: canceling statement due to statement timeout'))).toBe(true);
    expect(ehTempoEsgotado(new Error('permission denied'))).toBe(false);
  });

  it('lê de novo uma vez quando esgota o tempo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const buscar = vi.fn().mockRejectedValueOnce({ code: '57014', message: 'canceling statement due to statement timeout' }).mockResolvedValueOnce('ok');
    expect(await repetirNoTempoEsgotado(buscar, 0)).toBe('ok');
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('não repete mais de uma vez nem repete outros erros', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const esgota = vi.fn().mockRejectedValue(new Error('statement timeout'));
    await expect(repetirNoTempoEsgotado(esgota, 0)).rejects.toThrow('statement timeout');
    expect(esgota).toHaveBeenCalledTimes(2);
    const outro = vi.fn().mockRejectedValue(new Error('permission denied'));
    await expect(repetirNoTempoEsgotado(outro, 0)).rejects.toThrow('permission denied');
    expect(outro).toHaveBeenCalledTimes(1);
  });
});
