import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArpsDasFontes, fetchArpItems, limparCachesAtas } from '../api';
import { mensagemDeErro } from '../sincronizacaoFontesService';
import { resumirSincronizacao } from '../../hooks/useSituacaoSincronizacao';

// Atas sem número de controle: sem consulta de vigência. O PNCP (atas que só estão lá) responde vazio.
const pncpVazio = () => new Response(null, { status: 204 });
/** Compras.gov.br responde na ordem dada; o PNCP responde vazio. */
const comprasEmOrdem = (...respostas: Array<() => Response | Promise<never>>) => {
  let i = 0;
  return vi.fn().mockImplementation(async (url: string) => (url.startsWith('/api-pncp/') ? pncpVazio() : respostas[i++]()));
};
const params = {
  codigoUnidadeGerenciadora: '200330',
  dataVigenciaInicialMin: '2025-01-01',
  dataVigenciaInicialMax: '2025-12-31',
  numeroAtaRegistroPreco: ''
};

const respostaComUmaAta = () =>
  new Response(
    JSON.stringify({
      resultado: [{ numeroAtaRegistroPreco: '00001/2025', codigoUnidadeGerenciadora: '200330', dataVigenciaFinal: '2026-01-01' }],
      paginasRestantes: 0
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

describe('fetchArpsDasFontes — nova tentativa', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('conexão caiu uma vez: tenta de novo após 2 s e segue', async () => {
    const fetchMock = comprasEmOrdem(() => Promise.reject(new TypeError('Failed to fetch')), respostaComUmaAta);
    vi.stubGlobal('fetch', fetchMock);
    const promessa = fetchArpsDasFontes(params);
    await vi.advanceTimersByTimeAsync(2000);
    const atas = await promessa;
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api-arp/'))).toHaveLength(2);
    expect(atas).toHaveLength(1);
  });

  it('conexão caiu duas vezes: erro com mensagem que diz o que houve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const promessa = fetchArpsDasFontes(params);
    const verificacao = expect(promessa).rejects.toThrow('Sem conexão com o Compras.gov.br');
    await vi.advanceTimersByTimeAsync(2000);
    await verificacao;
  });

  it('fonte respondeu 503 uma vez: tenta de novo', async () => {
    const fetchMock = comprasEmOrdem(() => new Response('', { status: 503 }), respostaComUmaAta);
    vi.stubGlobal('fetch', fetchMock);
    const promessa = fetchArpsDasFontes(params);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await promessa).toHaveLength(1);
  });
});

describe('mensagem de falha da sincronização', () => {
  it('troca a mensagem crua do navegador por uma legível', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toMatch(/^Sem conexão com a fonte oficial/);
    expect(mensagemDeErro({ message: 'UNAUTHORIZED' })).toBe('UNAUTHORIZED');
  });

  it('o resumo traz a mensagem e a hora da última tentativa que falhou', () => {
    const r = resumirSincronizacao(
      [
        {
          recurso: 'atas', uasg: '200330', emAndamentoDesde: null, ultimaTentativaEm: '2026-10-06T15:31:28Z',
          ultimoSucessoEm: null, ultimoStatus: 'ERRO', fontesComFalha: [], totalRegistros: null, mensagem: 'Sem conexão'
        }
      ],
      ['200330', '200331']
    );
    expect(r.incompleta).toBe(true);
    expect(r.mensagemFalha).toBe('Sem conexão');
    expect(r.falhaEm).toBe('2026-10-06T15:31:28Z');
    expect(r.ultimoSucessoEm).toBeNull();
  });
});

describe('fetchArpItems — consultas compartilhadas e modo estrito', () => {
  const itensDoDia = () =>
    new Response(
      JSON.stringify({
        resultado: [
          { numeroAtaRegistroPreco: '00010/2099', numeroItem: '00001', niFornecedor: '11111111000111', dataHoraInclusao: 'a' },
          { numeroAtaRegistroPreco: '00011/2099', numeroItem: '00001', niFornecedor: '22222222000122', dataHoraInclusao: 'a' }
        ],
        paginasRestantes: 0
      }),
      { status: 200 }
    );

  beforeEach(() => {
    vi.useFakeTimers();
    limparCachesAtas();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('duas atas com a mesma data dividem uma só consulta ao Compras.gov.br', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => itensDoDia());
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([
      fetchArpItems('2099-01-02', '200331', '00010/2099'),
      fetchArpItems('2099-01-02', '200331', '00011/2099')
    ]);
    expect(a.resultado).toHaveLength(1);
    expect(b.resultado).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('modo estrito: fonte recusando (429) depois das novas tentativas vira erro, e não "ata sem itens"', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const promessa = fetchArpItems('2099-01-02', '200331', '00010/2099', undefined, { estrito: true });
    const verificacao = expect(promessa).rejects.toThrow('429');
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);
    await verificacao;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('nas telas (sem modo estrito), a recusa continua resultando em lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('', { status: 429 })));
    const promessa = fetchArpItems('2099-01-02', '200331', '00010/2099');
    await vi.advanceTimersByTimeAsync(60000);
    expect((await promessa).resultado).toEqual([]);
  });
});
