import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnidadesTab } from '../UnidadesTab';

const unidades = [
  { codigoUnidade: '200331', nomeUnidade: 'SENASP', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 801, saldoRemanejamentoEmpenho: 801 },
  { codigoUnidade: '200109', nomeUnidade: 'POLICIA RODOVIARIA FEDERAL', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 70, saldoRemanejamentoEmpenho: 70 }
] as any[];

const html = (over: Partial<Parameters<typeof UnidadesTab>[0]> = {}) =>
  renderToStaticMarkup(<UnidadesTab loading={false} error={null} sortedUnidades={unidades} ugUasg="200331" contratadoUG={690} {...over} />);

describe('UnidadesTab', () => {
  it('usa o mesmo resumo e tabela das outras abas', () => {
    const out = html();
    expect(out).toContain('unidades-summary');
    expect(out).toContain('690 de 801');
    expect(out).toContain('Ata completa');
    expect(out).toContain('871 registrados');
    expect(out).toContain('unidades-table');
    expect(out).toContain('Órgãos participantes');
  });

  it('marca gerenciadora e participante e mostra a fonte do consumo', () => {
    const out = html();
    expect(out).toContain('Gerenciadora');
    expect(out).toContain('Participante');
    expect(out).toContain('contratos vinculados');
    expect(out).toContain('Compras.gov');
  });

  it('mostra erro e estado vazio', () => {
    expect(html({ error: 'API fora' })).toContain('API fora');
    expect(html({ sortedUnidades: [] })).toContain('Nenhum órgão encontrado');
  });

  it('em carregamento mostra o texto no lugar dos números', () => {
    expect(html({ loading: true })).toContain('Buscando os órgãos participantes');
  });
});
