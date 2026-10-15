import { describe, it, expect, vi, afterAll } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import { calculateAttentionSummary } from '../dashboardService';
import { chaveAvisoEmpenhoAcima } from '../avisosResolvidosService';
import { empenhadoAcimaDaLinha, textoDaOrigem } from '../empenhadoAcimaService';

/**
 * Item 6 do diagnóstico de multiusuários (14/10/2026): empenhado acima do contratado só avisa. A pendência vai para a
 * aba Pagamentos da Visão Geral e conta só a quantidade real das notas (informada ou da nota no SIAFI).
 */
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-10-14T12:00:00-03:00'));
afterAll(() => {
  vi.useRealTimers();
});

const K = '200331-00016-2024';
const contrato = {
  id: K,
  numero: '00016',
  ano: 2024,
  numeroFormatado: '00016/2024',
  uasg: '200331',
  objeto: 'Serviços',
  fornecedorNome: 'FORNECEDOR Y',
  valorGlobal: 1000,
  dataVigenciaInicio: '2024-10-01',
  dataVigenciaFim: '2027-10-01',
  statusVigencia: 'Vigente'
} as ContractDashboardRecord;

const linha = empenhadoAcimaDaLinha({
  contract_key: K,
  numero_item: 8,
  descricao: 'Manutenção',
  quantidade_contratada: '330.0000',
  quantidade_empenhada: '913.0000',
  quantidade_acima: '583.0000',
  notas: 2,
  ultima_nota: '2025NE000498',
  ultima_origem: 'SIAFI'
});

describe('empenhado acima do contratado', () => {
  it('lê a linha da view com números', () => {
    expect(linha).toMatchObject({ contractKey: K, numeroItem: 8, quantidadeContratada: 330, quantidadeEmpenhada: 913, quantidadeAcima: 583, notas: 2 });
    expect(textoDaOrigem('GESTOR')).toBe('informada pelo gestor');
    expect(textoDaOrigem('SIAFI')).toBe('vinculada pela nota no SIAFI');
  });

  it('vira pendência de atenção, sem prazo, que abre a aba Financeiro na última nota', () => {
    const { items } = calculateAttentionSummary({ contracts: [contrato], empenhadoAcima: [linha] });
    const item = items.find((i) => i.category === 'EMPENHO_ACIMA');
    expect(item).toMatchObject({
      id: `ATT-ACIMA-${K}-8`,
      severity: 'ATENCAO',
      contractKey: K,
      numeroContrato: '00016/2024',
      badgeLabel: '583 acima',
      avisoChave: chaveAvisoEmpenhoAcima(K, 8, 913),
      targetUrl: `/contratos/${encodeURIComponent(K)}?aba=financeiro&abrir=2025NE000498`
    });
    expect(item?.description).toBe('Item 8: 913 empenhados para 330 contratados (583 acima) · última nota: 2025NE000498, vinculada pela nota no SIAFI');
  });

  it('contrato fora da carteira em tela não aparece', () => {
    const { items } = calculateAttentionSummary({ contracts: [], empenhadoAcima: [linha] });
    expect(items.some((i) => i.category === 'EMPENHO_ACIMA')).toBe(false);
  });

  it('a chave do ✓ Resolvido muda quando o excesso muda (o aviso volta)', () => {
    expect(chaveAvisoEmpenhoAcima(K, 8, 913)).toBe(`FONTE::${K}::ACIMA-8-913`);
    expect(chaveAvisoEmpenhoAcima(K, 8, 920)).not.toBe(chaveAvisoEmpenhoAcima(K, 8, 913));
  });

  it('item de serviço diz o período de 12 meses do excesso (migration 137)', () => {
    const servico = empenhadoAcimaDaLinha({
      contract_key: K,
      numero_item: 1,
      descricao: 'Transporte fluvial',
      quantidade_contratada: '23.0000',
      quantidade_empenhada: '25.0000',
      quantidade_acima: '2.0000',
      notas: 2,
      ultima_nota: '2026NE000323',
      ultima_origem: 'SIAFI',
      periodo_inicio: '2025-10-01',
      periodo_fim: '2026-09-30'
    });
    expect(servico).toMatchObject({ periodoInicio: '2025-10-01', periodoFim: '2026-09-30' });
    expect(linha).toMatchObject({ periodoInicio: null, periodoFim: null });
    const { items } = calculateAttentionSummary({ contracts: [contrato], empenhadoAcima: [servico] });
    expect(items.find((i) => i.category === 'EMPENHO_ACIMA')?.description).toBe(
      'Item 1: 25 empenhados de 01/10/2025 a 30/09/2026 para 23 contratados (2 acima) · última nota: 2026NE000323, vinculada pela nota no SIAFI'
    );
  });

  it('quantidade contratada quebrada: o aviso é em valor (migration 138)', () => {
    const quebrada = empenhadoAcimaDaLinha({
      contract_key: K,
      numero_item: 37,
      descricao: 'Aparelho',
      quantidade_contratada: '0.9508',
      quantidade_empenhada: '1.0000',
      quantidade_acima: '0.0492',
      notas: 2,
      ultima_nota: '2026NE000900',
      ultima_origem: 'SIAFI',
      pelo_valor: true,
      valor_contratado: '235.0000',
      valor_empenhado: '250.0000',
      valor_acima: '15.0000'
    });
    expect(quebrada).toMatchObject({ peloValor: true, valorContratado: 235, valorEmpenhado: 250, valorAcima: 15 });
    expect(linha).toMatchObject({ peloValor: false });
    const { items } = calculateAttentionSummary({ contracts: [contrato], empenhadoAcima: [quebrada] });
    const item = items.find((i) => i.category === 'EMPENHO_ACIMA');
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(item?.description).toBe(
      `Item 37: ${brl(250)} empenhados para ${brl(235)} contratados (${brl(15)} acima; quantidade no contrato quebrada, 0,9508, comparado pelo valor) · última nota: 2026NE000900, vinculada pela nota no SIAFI`
    );
    expect(item?.badgeLabel).toBe(`${brl(15)} acima`);
    expect(item?.avisoChave).toBe(chaveAvisoEmpenhoAcima(K, 37, 250));
  });
});
