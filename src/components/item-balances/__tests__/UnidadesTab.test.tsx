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

  it('mostra erro', () => {
    expect(html({ error: 'API fora' })).toContain('API fora');
  });

  it('sem órgãos e sem cópia: avisa, cita a base do saldo e não mostra régua com zero', () => {
    const out = html({ sortedUnidades: [], origem: 'SEM_DADOS', baseSemOrgaos: 30 });
    expect(out).toContain('unidades-sem-dados');
    expect(out).toContain('ainda não há cópia guardada');
    expect(out).toContain('quantitativo homologado do item (30 un)');
    expect(out).toContain('Nenhum órgão para mostrar');
    expect(out).not.toContain('unidades-summary');
    expect(out).not.toContain('unidades-copia');
  });

  it('cópia guardada: mostra a lista e a data da leitura', () => {
    const out = html({ origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
    expect(out).toContain('unidades-copia');
    expect(out).toContain('última cópia guardada, lida em 05/10/2026 às 14:32');
    expect(out).toContain('unidades-table');
    expect(out).toContain('690 de 801');
    expect(out).not.toContain('unidades-sem-dados');
  });

  it('lista ao vivo da API: sem aviso', () => {
    const out = html({ origem: 'API' });
    expect(out).not.toContain('unidades-copia');
    expect(out).not.toContain('unidades-sem-dados');
  });

  it('em carregamento mostra o texto no lugar dos números', () => {
    expect(html({ loading: true })).toContain('Buscando os órgãos participantes');
  });
});
