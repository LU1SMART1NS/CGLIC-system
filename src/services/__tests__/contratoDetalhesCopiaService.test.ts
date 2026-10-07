import { describe, it, expect, vi } from 'vitest';
import { lerComCopia, lerDetalhesDoContrato, responsavelParaGravar } from '../contratoDetalhesCopiaService';

describe('responsavelParaGravar', () => {
  it('guarda só o nome, sem o CPF mascarado', () => {
    expect(responsavelParaGravar({ id: 1, usuario: '***.550.961-** - MARIA SILVA', funcao_id: 'Fiscal Técnico' }))
      .toEqual({ id: 1, usuario: 'MARIA SILVA', funcao_id: 'Fiscal Técnico' });
    expect(responsavelParaGravar({ id: 2, usuario: null })).toEqual({ id: 2, usuario: null });
  });
});

describe('lerDetalhesDoContrato', () => {
  it('lê os três com falharSeErro; lista vazia com sucesso é gravada', async () => {
    const fontes = {
      historico: vi.fn(async () => [{ id: 1 }]),
      responsaveis: vi.fn(async () => [{ id: 2, usuario: '***.111.111-** - ANA' }]),
      garantias: vi.fn(async () => [])
    };
    const r = await lerDetalhesDoContrato('200331-00010-2026', 999732, fontes as any);
    expect(fontes.historico).toHaveBeenCalledWith(999732, { falharSeErro: true });
    expect(r).toEqual({
      linha: { contract_key: '200331-00010-2026', contrato_id_gov: '999732', historico: [{ id: 1 }], responsaveis: [{ id: 2, usuario: 'ANA' }], garantias: [] },
      falhas: []
    });
  });

  it('a leitura que falha fica fora da linha (a cópia dela não muda) e é contada', async () => {
    const r = await lerDetalhesDoContrato('k', 1, {
      historico: vi.fn(async () => { throw new Error('503'); }),
      responsaveis: vi.fn(async () => []),
      garantias: vi.fn(async () => { throw new Error('503'); })
    } as any);
    expect(r.linha).toEqual({ contract_key: 'k', contrato_id_gov: '1', responsaveis: [] });
    expect(r.falhas).toEqual(['historico', 'garantias']);
  });
});

describe('lerComCopia', () => {
  it('ao vivo: não lê a cópia', async () => {
    const copia = vi.fn();
    expect(await lerComCopia(async () => [1], copia)).toEqual({ dados: [1], origem: 'API', copiadoEm: null });
    expect(copia).not.toHaveBeenCalled();
  });

  it('falha ao vivo com cópia: usa a cópia', async () => {
    const r = await lerComCopia(async () => { throw new Error('503'); }, async () => ({ dados: [2], copiadoEm: '2026-10-05T17:32:00Z' }));
    expect(r).toEqual({ dados: [2], origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
  });

  it('falha ao vivo sem cópia (ou falha ao ler a cópia): repassa o erro da consulta', async () => {
    await expect(lerComCopia(async () => { throw new Error('503'); }, async () => null)).rejects.toThrow('503');
    await expect(lerComCopia(async () => { throw new Error('503'); }, async () => { throw new Error('banco'); })).rejects.toThrow('503');
  });
});
