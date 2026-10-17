import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItensDaAtaTabela } from '../ItensDaAtaTabela';
import type { CarteiraItemRow } from '../../../utils/carteiraItens';
import type { ArpItemRecord } from '../../../types';

const item = (numeroItem: string, descricaoItem: string, valorUnitario: number) =>
  ({ numeroItem, codigoItem: 1, descricaoItem, valorUnitario }) as unknown as ArpItemRecord;
const linha = (p: Partial<CarteiraItemRow>) =>
  ({
    quantitativoSenasp: 120,
    consumoPct: 50,
    consumido: 60,
    alocado: 0,
    alocadoPorUnidade: {},
    nivelAlocacao: 'SEM',
    contratada: null,
    empenhado: 0,
    nivelEmpenho: 'SEM',
    ...p
  }) as unknown as CarteiraItemRow;

const montar = (linhas: Record<string, CarteiraItemRow | undefined>, mostrarEmpenho = true, pct: number | null = 50) =>
  renderToStaticMarkup(
    <ItensDaAtaTabela
      numeroAta="00044/2026"
      itens={[item('00002', 'AERONAVES TELEGUIADAS', 9671)]}
      linhaDoItem={(i) => linhas[i.numeroItem]}
      pctDoItem={() => pct}
      nomeDaUnidade={(c) => ({ dprf: 'DPRF', fn: 'Força Nacional', seopi: 'SEOPI', dpsp: 'DPSP' })[c] ?? c}
      mostrarEmpenho={mostrarEmpenho}
      onSelectItem={() => {}}
    />
  );

describe('Itens da ata na Carteira de Atas', () => {
  it('colunas de quantidade, saldo, alocação e empenho, com a descrição em frase normal', () => {
    const h = montar({ '00002': linha({}) });
    for (const c of ['Qtd. SENASP', 'Saldo SENASP', 'Alocação nas unidades', 'Empenho']) expect(h).toContain(c);
    expect(h).toContain('Aeronaves teleguiadas');
    expect(h).toContain('120');
    expect(h).toContain('restam');
    expect(h).toContain('50% consumido');
  });

  it('consumo acima da cota: mostra quanto passou', () => {
    const h = montar({ '00002': linha({ consumido: 143, consumoPct: 119 }) }, true, 119);
    expect(h).toContain('23 acima');
  });

  it('alocação: as três unidades com mais quantidade e "+N" para o resto', () => {
    const h = montar({
      '00002': linha({ alocado: 123, nivelAlocacao: 'TOTAL', alocadoPorUnidade: { dprf: 60, fn: 40, seopi: 20, dpsp: 3 } })
    });
    expect(h).toContain('Alocado');
    expect(h).toContain('123 de 120');
    expect(h).toContain('DPRF');
    expect(h).toContain('Força Nacional');
    expect(h).toContain('+1');
    expect(h).not.toMatch(/>DPSP </);
  });

  it('empenho: empenhado do contratado; gestor de saldo não vê a coluna', () => {
    const comContrato = linha({ contratada: 110, empenhado: 80, nivelEmpenho: 'PARCIAL' });
    expect(montar({ '00002': comContrato })).toContain('80 de 110 contratado');
    const semEmpenho = montar({ '00002': comContrato }, false);
    expect(semEmpenho).not.toContain('Empenho');
    expect(semEmpenho).not.toContain('contratado');
  });

  it('sem a linha do item (ainda carregando): traços, sem quebrar', () => {
    const h = montar({}, true, null);
    expect(h).toContain('—');
    expect(h).toContain('00002');
  });
});
