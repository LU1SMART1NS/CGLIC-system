import { describe, expect, it } from 'vitest';
import { consultarExecucaoDaEmenda, notaDaSenasp, valorDoPortal } from '../execucaoEmendasPortalSyncService';

describe('execução das emendas pelo Portal (migration 204)', () => {
  it('lê os valores no formato do Portal', () => {
    expect(valorDoPortal('1.234.567,89')).toBe(1234567.89);
    expect(valorDoPortal('0,00')).toBe(0);
    expect(valorDoPortal(12.5)).toBe(12.5);
    expect(valorDoPortal('')).toBeNull();
    expect(valorDoPortal(null)).toBeNull();
  });

  it('acha a emenda pelo código na resposta e pega empenhado, liquidado, pago e autor', async () => {
    const caminhos: string[] = [];
    const docs = [
      { fase: 'Empenho', codigoDocumento: '200330000012026NE000309' },
      { fase: 'Empenho', codigoDocumento: '200331000012026NE000012' },
      { fase: 'Empenho', codigoDocumento: '200334000012026NE001179' },
      { fase: 'Pagamento', codigoDocumento: '200330000012026OB000123' },
      { fase: 'Empenho', codigoDocumento: '200330000012026NE000309' }
    ];
    const consultar = async (c: string) => {
      caminhos.push(c);
      if (c.startsWith('/emendas/documentos/')) return c.endsWith('pagina=1') ? docs : [];
      return [{ codigoEmenda: '202643600002', nomeAutor: 'FULANO', valorEmpenhado: '669.610,84', valorLiquidado: '100,00', valorPago: '0,00' }];
    };
    const e = await consultarExecucaoDaEmenda('202643600002', consultar);
    expect(caminhos).toEqual(['/emendas?codigoEmenda=202643600002&pagina=1', '/emendas/documentos/202643600002?pagina=1']);
    // Só as notas de empenho da SENASP (200330 e 200331), sem repetir; a da 200334 e a OB ficam de fora.
    expect(e).toEqual({ codigo: '202643600002', encontrada: true, valor_empenhado: 669610.84, valor_liquidado: 100, valor_pago: 0, autor: 'FULANO', notas_senasp: ['200330:2026NE000309', '200331:2026NE000012'] });
  });

  it('sem a emenda na resposta (ainda sem execução no Portal): não encontrada, sem valores', async () => {
    const e = await consultarExecucaoDaEmenda('202699990001', async () => [{ codigoEmenda: '202611110001' }]);
    expect(e).toMatchObject({ encontrada: false, valor_empenhado: null });
  });

  it('nota da SENASP pelo código do documento', () => {
    expect(notaDaSenasp('200330000012026NE000309')).toBe('200330:2026NE000309');
    expect(notaDaSenasp('200334000012026NE001179')).toBeNull();
    expect(notaDaSenasp('200330000012026NS000001')).toBeNull();
  });
});
