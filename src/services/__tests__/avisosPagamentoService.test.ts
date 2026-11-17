import { describe, it, expect } from 'vitest';
import { calcularAvisosPagamento, type FaturaParaAviso } from '../avisosPagamentoService';
import type { ExpectativaPagamento } from '../expectativaPagamentoService';
import type { EntregaParaPagamento } from '../entregasParaPagamentoService';

const marca = (contractKey: string, tipo: ExpectativaPagamento['tipo'] = 'MENSAL'): [string, ExpectativaPagamento] => [
  contractKey,
  { contractKey, tipo, valorMensal: null, observacao: null, atualizadoPorNome: null, atualizadoEm: '' }
];
const entrega = (o: Partial<EntregaParaPagamento>): EntregaParaPagamento => ({ contractKey: 'A', situacao: 'ENTREGUE', data: '2026-09-15', itens: 3, valor: 1000, semPreco: 0, ...o });
const fatura = (o: Partial<FaturaParaAviso>): FaturaParaAviso => ({ contractKey: 'A', emissao: '2026-10-02', referencia: '09/2026', cancelada: false, ...o });
const base = {
  marcas: new Map<string, ExpectativaPagamento>(),
  entregas: [] as EntregaParaPagamento[],
  faturas: [] as FaturaParaAviso[],
  ciclos: [],
  contratosVigentes: new Set(['A', 'B'])
};

describe('aviso da previsão mensal', () => {
  const previsao = { mes: '2026-11', prazo: '2026-10-30', enviada: false };
  it('fora da janela de aviso: nada', () => {
    expect(calcularAvisosPagamento({ ...base, previsao, hoje: new Date(2026, 9, 7) })).toHaveLength(0);
  });
  it('dentro da janela: atenção; no dia do prazo: urgente; enviada: nada', () => {
    const [a] = calcularAvisosPagamento({ ...base, previsao, hoje: new Date(2026, 9, 26) });
    expect(a.tipo).toBe('PREVISAO_NAO_ENVIADA');
    expect(a.severity).toBe('ATENCAO');
    expect(a.targetUrl).toBe('/pagamentos/previsao');
    expect(calcularAvisosPagamento({ ...base, previsao, hoje: new Date(2026, 9, 30) })[0].severity).toBe('URGENTE');
    expect(calcularAvisosPagamento({ ...base, previsao: { ...previsao, enviada: true }, hoje: new Date(2026, 9, 30) })).toHaveLength(0);
  });
  it('prazo passado: crítico', () => {
    const [a] = calcularAvisosPagamento({ ...base, previsao: { mes: '2026-10', prazo: '2026-09-30', enviada: false }, hoje: new Date(2026, 9, 2) });
    expect(a.severity).toBe('CRITICA');
    expect(a.badgeLabel).toMatch(/atrasada/);
  });
});

describe('nota mensal que não chegou', () => {
  const marcas = new Map([marca('A'), marca('B', 'EVENTUAL')]);
  it('até o dia combinado: nada', () => {
    expect(calcularAvisosPagamento({ ...base, marcas, hoje: new Date(2026, 9, 10) })).toHaveLength(0);
  });
  it('depois do dia, mensal sem fatura nem ciclo: aviso (só para o mensal)', () => {
    const avisos = calcularAvisosPagamento({ ...base, marcas, hoje: new Date(2026, 9, 15) });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'NOTA_MENSAL_NAO_CHEGOU', contractKey: 'A', badgeLabel: 'Nota de setembro não chegou' });
  });
  it('fatura da competência, fatura emitida no mês ou ciclo recebido no mês: chegou', () => {
    const hoje = new Date(2026, 9, 15);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, faturas: [fatura({ emissao: '2026-09-28' })] })).toHaveLength(0);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, faturas: [fatura({ referencia: null })] })).toHaveLength(0);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, ciclos: [{ contractKey: 'A', dataRecebimento: '2026-10-05', status: 'RECEBIDO' }] })).toHaveLength(0);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, ciclos: [{ contractKey: 'A', competencia: '2026-09', status: 'RECEBIDO' }] })).toHaveLength(0);
  });
  it('nota antiga, fatura cancelada, ciclo cancelado ou contrato encerrado: não conta', () => {
    const hoje = new Date(2026, 9, 15);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, faturas: [fatura({ emissao: '2026-09-02', referencia: '08/2026' })] })).toHaveLength(1);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, faturas: [fatura({ cancelada: true })] })).toHaveLength(1);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, ciclos: [{ contractKey: 'A', dataRecebimento: '2026-10-05', status: 'CANCELADO' }] })).toHaveLength(1);
    expect(calcularAvisosPagamento({ ...base, marcas, hoje, contratosVigentes: new Set(['B']) })).toHaveLength(0);
  });
});

describe('item entregue pela Fiscalização sem nota (regras pagamento.notaAposEntrega*)', () => {
  it('até 10 dias da entrega: nada; depois: aviso; depois de 30: urgente', () => {
    const entregas = [entrega({ data: '2026-10-01' })];
    expect(calcularAvisosPagamento({ ...base, entregas, hoje: new Date(2026, 9, 11) })).toHaveLength(0);
    const [a] = calcularAvisosPagamento({ ...base, entregas, hoje: new Date(2026, 9, 14) });
    expect(a).toMatchObject({ tipo: 'ENTREGA_SEM_NOTA', contractKey: 'A', severity: 'ATENCAO', title: 'Nota não chegou: 3 itens entregues em 01/10', badgeLabel: 'Entrega de 01/10 sem nota' });
    expect(calcularAvisosPagamento({ ...base, entregas, hoje: new Date(2026, 10, 5) })[0].severity).toBe('URGENTE');
  });
  it('nota emitida depois da entrega, ou item ainda a entregar: nada', () => {
    const hoje = new Date(2026, 9, 20);
    expect(calcularAvisosPagamento({ ...base, entregas: [entrega({ data: '2026-10-01' })], faturas: [fatura({ emissao: '2026-10-05', referencia: null })], hoje })).toHaveLength(0);
    expect(calcularAvisosPagamento({ ...base, entregas: [entrega({ data: '2026-10-01', situacao: 'A_ENTREGAR' })], hoje })).toHaveLength(0);
  });
});
