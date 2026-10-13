import { describe, it, expect, vi } from 'vitest';
import { lerUasgNoCadastro, localDaUasg, normalizarNomeDoCadastro } from '../cadastroUasgsSyncService';

const resposta = (resultado: unknown[], ok = true, status = 200) =>
  ({ ok, status, json: async () => ({ resultado }) }) as unknown as Response;

describe('cadastro de UASGs', () => {
  it('normaliza o nome: maiúsculas e ¢ trocado por Ç (casos reais de 13/10/2026)', () => {
    expect(normalizarNomeDoCadastro('INST.FED.DO R.G.DO NORTE/CAMPUS CAICó')).toBe('INST.FED.DO R.G.DO NORTE/CAMPUS CAICÓ');
    expect(normalizarNomeDoCadastro('ESCOLA DE EDUCA¢AO FISICA/UFMG')).toBe('ESCOLA DE EDUCAÇAO FISICA/UFMG');
  });

  it('cidade e UF: "BOA VISTA" + RR → Boa Vista/RR', () => {
    expect(localDaUasg({ municipio: 'BOA VISTA', siglaUf: 'RR' })).toBe('Boa Vista/RR');
    expect(localDaUasg({ municipio: 'RIO DE JANEIRO', siglaUf: 'RJ' })).toBe('Rio de Janeiro/RJ');
    expect(localDaUasg({ municipio: null, siglaUf: 'DF' })).toBe('DF');
    expect(localDaUasg({ municipio: null, siglaUf: null })).toBeNull();
  });

  it('lê a UASG ativa e traz nome, cidade e UF', async () => {
    const fetcher = vi.fn(async () => resposta([{ codigoUasg: '462492', nomeUasg: 'CORPO DE BOMBEIROS MILITAR DE RORAIMA/RR', nomeMunicipioIbge: 'BOA VISTA', siglaUf: 'RR', statusUasg: true }]));
    expect(await lerUasgNoCadastro('462492', fetcher as unknown as typeof fetch)).toEqual({
      codigo_uasg: '462492', nome: 'CORPO DE BOMBEIROS MILITAR DE RORAIMA/RR', municipio: 'BOA VISTA', sigla_uf: 'RR', ativa: true
    });
    expect(fetcher).toHaveBeenCalledWith('/api-arp/modulo-uasg/1_consultarUasg?pagina=1&codigoUasg=462492&statusUasg=true');
  });

  it('procura entre as inativas; sem resultado nas duas, não achada (sem nome)', async () => {
    const fetcher = vi.fn(async () => resposta([]));
    expect(await lerUasgNoCadastro('123456', fetcher as unknown as typeof fetch)).toEqual({ codigo_uasg: '123456' });
    expect(fetcher).toHaveBeenLastCalledWith('/api-arp/modulo-uasg/1_consultarUasg?pagina=1&codigoUasg=123456&statusUasg=false');
  });

  it('erro da fonte lança depois de 3 tentativas: não grava "não achada" por engano', async () => {
    const fetcher = vi.fn(async () => resposta([], false, 503));
    const esperar = vi.fn(async () => {});
    await expect(lerUasgNoCadastro('462492', fetcher as unknown as typeof fetch, esperar)).rejects.toThrow('503');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls).toEqual([[3000], [6000]]);
  });

  it('429 e falha de rede: espera e tenta de novo', async () => {
    const ok = resposta([{ codigoUasg: '462492', nomeUasg: 'CBM RR', siglaUf: 'RR' }]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([], false, 429))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok);
    const r = await lerUasgNoCadastro('462492', fetcher as unknown as typeof fetch, async () => {});
    expect(r.nome).toBe('CBM RR');
  });

  it('400 passageiro: tenta de novo (a consulta é sempre a mesma)', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([], false, 400))
      .mockResolvedValueOnce(resposta([{ codigoUasg: '200366', nomeUasg: 'DPF FOZ', siglaUf: 'PR' }]));
    expect((await lerUasgNoCadastro('200366', fetcher as unknown as typeof fetch, async () => {})).nome).toBe('DPF FOZ');
  });

  it('404 não insiste', async () => {
    const fetcher = vi.fn(async () => resposta([], false, 404));
    await expect(lerUasgNoCadastro('462492', fetcher as unknown as typeof fetch, async () => {})).rejects.toThrow('404');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
