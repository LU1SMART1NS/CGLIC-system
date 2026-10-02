import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdesoesTab } from '../AdesoesTab';

const item = { numeroItem: '00001', maximoAdesao: 9726, quantidadeHomologadaItem: 4863, valorUnitario: 1528.8 } as any;

const baseProps = {
  adesoesLoading: false,
  adesoesError: null as string | null,
  adesoes: [
    { unidade: '373083', orgaoAdesao: 'INCRA-SEDE/DF', tipo: 'NÃO PARTICIPANTE (CARONA)', quantidadeRegistrada: 100, quantidadeEmpenhada: 30, saldoEmpenho: 70, dataHoraInclusao: '2026-03-10T10:00:00' }
  ] as any[],
  item,
  totalAdesaoRegistrada: 100,
  totalAdesaoEmpenhada: 30,
  totalAdesaoSaldo: 70,
  adesaoConsumidaPercent: 30
};

const html = (over: Partial<typeof baseProps> = {}) => renderToStaticMarkup(<AdesoesTab {...baseProps} {...over} />);

describe('AdesoesTab', () => {
  it('resume as adesões em uma linha, sem cartões nem faixa explicativa', () => {
    const out = html();
    expect(out).toContain('adesoes-summary');
    expect(out).toContain('Autorizado');
    expect(out).toContain('100 de 9.726');
    expect(out).toContain('Empenhado');
    expect(out).toContain('Saldo concedido');
    expect(out).not.toContain('kpi-card');
    expect(out).not.toContain('Art. 86 da Lei 14.133/21 ');
  });

  it('o limite legal fica como subtítulo curto do cabeçalho', () => {
    const out = html();
    expect(out).toContain('Adesões e caronas');
    expect(out).toContain('Art. 86 da Lei 14.133/2021');
  });

  it('lista os órgãos aderentes na tabela', () => {
    const out = html();
    expect(out).toContain('INCRA-SEDE/DF');
    expect(out).toContain('UASG: 373083');
  });

  it('sem adesões mostra o estado vazio com o motivo da API, se houver', () => {
    expect(html({ adesoes: [] })).toContain('Nenhuma carona externa registrada');
    expect(html({ adesoes: [], adesoesError: 'API indisponível' })).toContain('API indisponível');
  });

  it('mostra o carregamento no lugar da tabela', () => {
    expect(html({ adesoesLoading: true })).toContain('Consultando adesões de carona');
  });
});
