import { describe, it, expect, vi } from 'vitest';
import { completarComOrgao, lerOrgaoNoCadastro, lerUasgNoCadastro, localDaUasg, normalizarNomeDoCadastro } from '../cadastroUasgsSyncService';

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

describe('órgão da UASG (migration 139)', () => {
  const uasgEs = { codigo_uasg: '927117', nome: 'EES-CORPO DE BOMB MILITAR EST. ESPÍRITO SANTO', sigla_uf: 'ES', codigo_orgao: 85633 };
  const orgaoEs = { codigoOrgao: 85633, nomeMnemonicoOrgao: 'CBMES/ES', esfera: 'E' };

  it('a UASG traz o código do órgão quando o cadastro tem', async () => {
    const fetcher = vi.fn(async () => resposta([{ codigoUasg: '927117', nomeUasg: 'EES-CORPO DE BOMB', codigoOrgao: 85633, statusUasg: true }]));
    expect((await lerUasgNoCadastro('927117', fetcher as unknown as typeof fetch)).codigo_orgao).toBe(85633);
  });

  it('lê sigla e esfera do órgão (caso real de 15/10/2026)', async () => {
    const fetcher = vi.fn(async () => resposta([orgaoEs]));
    expect(await lerOrgaoNoCadastro(85633, fetcher as unknown as typeof fetch)).toEqual({ sigla: 'CBMES/ES', esfera: 'E' });
    expect(fetcher).toHaveBeenCalledWith('/api-arp/modulo-uasg/2_consultarOrgao?pagina=1&codigoOrgao=85633&statusOrgao=true');
  });

  it('órgão que não aparece nem entre os inativos: null', async () => {
    const fetcher = vi.fn(async () => resposta([]));
    expect(await lerOrgaoNoCadastro(1, fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('completa a UASG e lê cada órgão uma vez por execução', async () => {
    const fetcher = vi.fn(async () => resposta([orgaoEs]));
    const cache = new Map();
    const esperar = async () => {};
    const a = await completarComOrgao(uasgEs, cache, fetcher as unknown as typeof fetch, esperar);
    const b = await completarComOrgao({ ...uasgEs, codigo_uasg: '999999' }, cache, fetcher as unknown as typeof fetch, esperar);
    expect(a).toMatchObject({ codigo_orgao: 85633, sigla_orgao: 'CBMES/ES', esfera_orgao: 'E' });
    expect(b.sigla_orgao).toBe('CBMES/ES');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('UASG achada sem órgão na fonte: marca o órgão como lido (null)', async () => {
    const fetcher = vi.fn();
    const r = await completarComOrgao({ codigo_uasg: '123456', nome: 'X' }, new Map(), fetcher as unknown as typeof fetch, async () => {});
    expect(r).toEqual({ codigo_uasg: '123456', nome: 'X', codigo_orgao: null, sigla_orgao: null, esfera_orgao: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('UASG não achada fica como está', async () => {
    expect(await completarComOrgao({ codigo_uasg: '123456' }, new Map(), vi.fn() as unknown as typeof fetch)).toEqual({ codigo_uasg: '123456' });
  });

  it('falha ao ler o órgão: grava a UASG sem a chave do órgão (volta para a fila)', async () => {
    const fetcher = vi.fn(async () => resposta([], false, 503));
    const r = await completarComOrgao(uasgEs, new Map(), fetcher as unknown as typeof fetch, async () => {});
    expect(r.nome).toBe(uasgEs.nome);
    expect('codigo_orgao' in r).toBe(false);
  });
});
