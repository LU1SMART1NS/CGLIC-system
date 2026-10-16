import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motivoDoEndereco, motivoNoFiltro } from '../gestaoInstrumentosRowHelpers';
import { GestaoInstrumentosCompactFilters } from '../GestaoInstrumentosCompactFilters';
import { chaveDoMotivo, motivoDoLembrete, motivoDoReajuste } from '../../../utils/motivoDetalhe';

describe('Motivo detalhado (lembrete e reajuste)', () => {
  it('lembrete: o motivo é a regra, com chave sem o prazo entre parênteses', () => {
    expect(motivoDoLembrete('Início da Análise de Prorrogação (180d)')).toEqual({
      chave: 'inicio-da-analise-de-prorrogacao',
      label: 'Início da Análise de Prorrogação (180d)'
    });
    expect(motivoDoLembrete('')).toBeUndefined();
  });

  it('reajuste: o motivo é a situação da data-base', () => {
    expect(motivoDoReajuste('VENCIDA')).toEqual({ chave: 'VENCIDA', label: 'Data-base vencida' });
    expect(motivoDoReajuste('URGENTE')?.label).toBe('Data-base em até 30 dias');
    expect(motivoDoReajuste('PROXIMA')?.label).toBe('Data-base em mais de 30 dias');
    expect(motivoDoReajuste(undefined)).toBeUndefined();
  });

  it('chave no filtro: categoria, ou categoria.chave quando há detalhe', () => {
    expect(chaveDoMotivo({ category: 'ATA_CRITICA' })).toBe('ATA_CRITICA');
    expect(chaveDoMotivo({ category: 'REAJUSTE_RADAR', motivoDetalhe: { chave: 'HOJE', label: 'Data-base hoje' } })).toBe('REAJUSTE_RADAR.HOJE');
  });
});

describe('Motivo no filtro conforme a aba', () => {
  const reajuste = { category: 'REAJUSTE_RADAR' as const, motivoDetalhe: { chave: 'VENCIDA', label: 'Data-base vencida' } };

  it('aba de uma categoria só usa o detalhe; as outras, a categoria', () => {
    expect(motivoNoFiltro(reajuste, true)).toEqual({ value: 'REAJUSTE_RADAR.VENCIDA', label: 'Data-base vencida' });
    expect(motivoNoFiltro(reajuste, false).value).toBe('REAJUSTE_RADAR');
    expect(motivoNoFiltro({ category: 'ATA_CRITICA' }, true).value).toBe('ATA_CRITICA');
  });

  it('endereço: aceita categoria conhecida, com ou sem detalhe; o resto vira TODAS', () => {
    expect(motivoDoEndereco('ATA_CRITICA')).toBe('ATA_CRITICA');
    expect(motivoDoEndereco('LEMBRETE.inicio-da-analise-de-prorrogacao')).toBe('LEMBRETE.inicio-da-analise-de-prorrogacao');
    expect(motivoDoEndereco('NAO_EXISTE.x')).toBe('TODAS');
    expect(motivoDoEndereco('LEMBRETE.<script>')).toBe('TODAS');
    expect(motivoDoEndereco(null)).toBe('TODAS');
  });
});

describe('Filtro "Motivo" aparece em todas as abas', () => {
  const props = {
    filters: { severidade: 'TODAS' as const, motivo: 'TODAS', busca: '' },
    onChangeFilter: vi.fn(),
    onResetFilters: vi.fn(),
    totalFiltered: 1,
    totalItems: 1
  };

  it('com um motivo só na aba', () => {
    const html = renderToStaticMarkup(
      <GestaoInstrumentosCompactFilters {...props} motivoOptions={[{ value: 'LEMBRETE.x', label: 'Regra X', count: 1 }]} />
    );
    expect(html).toContain('instrumentos-filter-motivo');
  });

  it('com a aba vazia', () => {
    const html = renderToStaticMarkup(<GestaoInstrumentosCompactFilters {...props} motivoOptions={[]} />);
    expect(html).toContain('instrumentos-filter-motivo');
  });
});
