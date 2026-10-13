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

  it('erro da fonte lança: não grava "não achada" por engano', async () => {
    const fetcher = vi.fn(async () => resposta([], false, 503));
    await expect(lerUasgNoCadastro('462492', fetcher as unknown as typeof fetch)).rejects.toThrow('503');
  });
});
