import { describe, it, expect, vi } from 'vitest';
import {
  mesesAntes,
  entraNoLote,
  selecionarContratos,
  ordenarParaSincronizar,
  processarFila,
  mensagemDaCarteira,
  RECONSULTA_HORAS
} from '../empenhosCarteiraService';
import type { ContractDashboardRecord } from '../../types';

const c = (id: string, fim?: string, over: Partial<ContractDashboardRecord> = {}): ContractDashboardRecord =>
  ({ id, uasg: id.slice(0, 6), numero: id.slice(7), ano: id.slice(-4), dataVigenciaFim: fim, ...over }) as any;
const ctx = (comEmpenhoAPagar: string[] = []) => ({ hoje: '2026-10-06', comEmpenhoAPagar: new Set(comEmpenhoAPagar) });

describe('critério de inclusão', () => {
  it('mesesAntes', () => {
    expect(mesesAntes('2026-10-06', 24)).toBe('2024-10-06');
  });

  it('vigente, sem data de fim e vencido há até 24 meses entram', () => {
    expect(entraNoLote(c('200331-00296-2026', '2027-10-02'), ctx())).toBe(true);
    expect(entraNoLote(c('200331-00001-2026', undefined), ctx())).toBe(true);
    expect(entraNoLote(c('200331-00135-2025', '2025-01-31'), ctx())).toBe(true);
    expect(entraNoLote(c('200331-00099-2022', '2024-10-06'), ctx())).toBe(true);
  });

  it('vencido há mais de 24 meses só entra com empenho ainda não pago', () => {
    expect(entraNoLote(c('200331-00021-2017', '2022-12-01'), ctx())).toBe(false);
    expect(entraNoLote(c('200331-00021-2017', '2022-12-01'), ctx(['200331-00021-2017']))).toBe(true);
  });

  it('selecionarContratos tira repetidos e os que não entram', () => {
    const r = selecionarContratos([[c('200331-00021-2017', '2022-12-01'), c('200331-00296-2026', '2027-10-02')], [c('200331-00296-2026', '2027-10-02')]], ctx());
    expect(r.map((x) => x.id)).toEqual(['200331-00296-2026']);
  });
});

describe('ordem da execução', () => {
  const agora = new Date('2026-10-06T12:00:00Z').getTime();
  const horasAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();

  it('nunca consultados primeiro, depois do mais antigo; tira os consultados há menos de 20 h', () => {
    const lista = [c('200331-00001-2026'), c('200331-00002-2026'), c('200331-00003-2026'), c('200331-00004-2026')];
    const tentativas = new Map([
      ['200331-00001-2026', horasAtras(30)],
      ['200331-00002-2026', horasAtras(RECONSULTA_HORAS - 1)],
      ['200331-00004-2026', horasAtras(100)]
    ]);
    expect(ordenarParaSincronizar(lista, tentativas, { agora }).map((x) => x.id)).toEqual([
      '200331-00003-2026',
      '200331-00004-2026',
      '200331-00001-2026'
    ]);
  });

  it('forçar inclui os consultados há pouco', () => {
    const lista = [c('200331-00002-2026')];
    expect(ordenarParaSincronizar(lista, new Map([['200331-00002-2026', horasAtras(1)]]), { agora, forcar: true })).toHaveLength(1);
  });
});

describe('processarFila', () => {
  const resultado = (status: string, extra: any = {}) => ({
    status,
    empenhos_persistidos: 2,
    vinculos_contrato_removidos: 0,
    erros: status === 'ERRO' ? [{ origem: 'CONTRATOSNET', erro: 'Contratos.gov.br não respondeu em 30 s.' }] : [],
    pendencias: [],
    resumo_sync: { erros: [] },
    ...extra
  });

  it('conta cada situação e para quando o orçamento de tempo acaba', async () => {
    let t = 0;
    const fila = ['a', 'b', 'c', 'd', 'e'].map((x) => c(`200331-0000${x.charCodeAt(0) - 96}-2026`));
    const status = ['SUCESSO', 'SEM_DADOS', 'ERRO', 'SUCESSO_PARCIAL', 'SUCESSO'];
    let i = 0;
    const sincronizar = vi.fn(async (contrato: ContractDashboardRecord) => {
      t += 40; // cada contrato leva 40 ms
      return { target: { tipo: 'CONTRATO', contractKey: contrato.id } as any, result: resultado(status[i++]) as any };
    });
    const r = await processarFila(fila, { sincronizar, orcamentoMs: 120, concorrencia: 1, agora: () => t });
    expect(r).toMatchObject({ processados: 4, adiados: 1, atualizados: 1, semEmpenhos: 1, comErro: 1, parciais: 1, empenhosGravados: 8 });
    expect(r.erros[0]).toEqual({ contractKey: '200331-00003-2026', erro: 'Contratos.gov.br não respondeu em 30 s.' });
  });

  it('sem orçamento processa a fila toda, em paralelo', async () => {
    const fila = Array.from({ length: 7 }, (_, k) => c(`200331-0001${k}-2026`));
    const sincronizar = vi.fn(async (contrato: ContractDashboardRecord) => ({ target: { contractKey: contrato.id } as any, result: resultado('SUCESSO') as any }));
    const r = await processarFila(fila, { sincronizar, concorrencia: 3 });
    expect(r.processados).toBe(7);
    expect(r.adiados).toBe(0);
    expect(sincronizar).toHaveBeenCalledTimes(7);
  });
});

describe('mensagemDaCarteira', () => {
  it('resume o resultado e diz o que ficou para a próxima', () => {
    expect(
      mensagemDaCarteira({ elegiveis: 515, naFila: 300, processados: 250, atualizados: 200, semEmpenhos: 45, parciais: 1, comErro: 4, adiados: 50, empenhosGravados: 900, vinculosRemovidos: 2, erros: [] })
    ).toBe(
      '250 de 300 contrato(s) consultado(s) (515 na carteira de empenhos), 200 atualizado(s), 45 sem empenho na fonte, 1 parcial(is), 4 com falha, 2 vínculo(s) removido(s), o tempo da execução acabou e 50 contrato(s) ficam para a próxima.'
    );
  });
});
