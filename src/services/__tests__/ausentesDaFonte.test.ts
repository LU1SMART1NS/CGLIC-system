import { describe, it, expect, vi, afterAll } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import { calculateAttentionSummary } from '../dashboardService';
import { buildContractActionQueue } from '../contractActionQueueService';
import { chaveAvisoFonte } from '../avisosResolvidosService';
import { ausenteDaLinha, rotuloAusente, trabalhoNaFonte, type AusenteDaFonte } from '../ausentesDaFonteService';

/**
 * Caso de 09/10/2026: o Contratos.gov.br deixou de listar uma nota do contrato 00145/2025. Com a migration 113, se a
 * nota tiver trabalho da equipe, a sincronização não a apaga: fica a conferir e o coordenador decide.
 */
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-10-13T12:00:00-03:00'));
afterAll(() => {
  vi.useRealTimers();
});

const K = '200331-00145-2025';
const contrato = {
  id: K,
  numero: '00145',
  ano: 2025,
  numeroFormatado: '00145/2025',
  uasg: '200331',
  objeto: 'EPI',
  fornecedorNome: 'FORNECEDOR X',
  valorGlobal: 1000,
  dataVigenciaInicio: '2025-10-01',
  dataVigenciaFim: '2027-10-01',
  statusVigencia: 'Vigente'
} as ContractDashboardRecord;

const nota = (extra: Partial<AusenteDaFonte> = {}): AusenteDaFonte => ({
  ...ausenteDaLinha({
    tipo: 'NOTA',
    chave: 'ce-1',
    contract_key: K,
    numero: '2025NE000123',
    valor: '567513.93',
    detectado_em: '2026-10-09T15:00:00+00:00',
    gestor_contrato: 'Alan Jonne',
    distribuido_por_nome: 'Daniel',
    quantidades_informadas: 2,
    unidades: 'DFNSP',
    ciclos: null
  }),
  ...extra
});
const fatura = (): AusenteDaFonte =>
  ausenteDaLinha({
    tipo: 'FATURA',
    chave: '987',
    contract_key: K,
    numero: '45',
    valor: 1200,
    detectado_em: '2026-10-09T15:00:00+00:00',
    gestor_contrato: null,
    distribuido_por_nome: null,
    quantidades_informadas: 0,
    unidades: null,
    ciclos: '09/2026 ENVIADO_CGOFI'
  });

describe('nota ou fatura a conferir — leitura', () => {
  it('lê a linha da view', () => {
    expect(nota()).toMatchObject({ tipo: 'NOTA', chave: 'ce-1', contractKey: K, numero: '2025NE000123', valor: 567513.93, quantidadesInformadas: 2, unidades: 'DFNSP' });
    expect(fatura()).toMatchObject({ tipo: 'FATURA', chave: '987', valor: 1200, ciclos: '09/2026 ENVIADO_CGOFI', gestorContrato: undefined });
  });

  it('descreve o trabalho que está na nota ou na fatura', () => {
    expect(trabalhoNaFonte(nota())).toBe('distribuição entre os itens feita por Daniel, quantidade informada em 2 itens, unidade interna escolhida (DFNSP)');
    expect(trabalhoNaFonte(nota({ distribuidoPorNome: undefined, quantidadesInformadas: 1, unidades: undefined }))).toBe('quantidade informada em 1 item');
    expect(trabalhoNaFonte(fatura())).toBe('está no ciclo de pagamento 09/2026 ENVIADO_CGOFI');
    expect(rotuloAusente(nota())).toBe('nota 2025NE000123');
    expect(rotuloAusente(fatura())).toBe('fatura 45');
  });

  it('a chave do aviso usa o tipo FONTE e muda quando a marca é refeita', () => {
    const c = chaveAvisoFonte(K, 'NOTA', 'ce-1', '2026-10-09T15:00:00+00:00');
    expect(c).toMatch(/^FONTE::200331-00145-2025::NOTA-ce-1-\d+$/);
    expect(chaveAvisoFonte(K, 'NOTA', 'ce-1', '2026-10-20T15:00:00+00:00')).not.toBe(c);
  });
});

describe('Visão Geral — nota ou fatura a conferir', () => {
  it('só contratos em tela entram, urgentes, com a nota ou a fatura para a decisão', () => {
    const outro = nota({ contractKey: '200331-00001-2026', chave: 'ce-9' });
    const resumo = calculateAttentionSummary({ contracts: [contrato], ausentesDaFonte: [nota(), fatura(), outro], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    const itens = resumo.items.filter((i) => i.category === 'FONTE_A_CONFERIR');
    expect(itens.map((i) => i.id).sort()).toEqual(['ATT-FONTE-FATURA-987', 'ATT-FONTE-NOTA-ce-1']);
    const n = itens.find((i) => i.id === 'ATT-FONTE-NOTA-ce-1')!;
    expect(n).toMatchObject({ severity: 'URGENTE', contractKey: K, numeroContrato: '00145/2025', ausenteDaFonte: { tipo: 'NOTA', chave: 'ce-1' }, badgeLabel: 'a conferir' });
    expect(n.title).toBe('Nota 2025NE000123 saiu do contrato na fonte');
    expect(n.description).toContain('o coordenador decide');
    expect(n.avisoChave).toMatch(/^FONTE::/);
    const f = itens.find((i) => i.id === 'ATT-FONTE-FATURA-987')!;
    expect(f.description).toContain('está no ciclo de pagamento 09/2026 ENVIADO_CGOFI');
  });

  it('o ✓ tira o aviso da lista e o leva para os resolvidos', () => {
    const n = nota();
    const chave = chaveAvisoFonte(K, 'NOTA', n.chave, n.detectadoEm);
    const resumo = calculateAttentionSummary({ contracts: [contrato], ausentesDaFonte: [n], avisosResolvidos: new Set([chave]), currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(resumo.items.filter((i) => i.category === 'FONTE_A_CONFERIR')).toEqual([]);
    expect(resumo.resolvidos?.map((i) => i.category)).toContain('FONTE_A_CONFERIR');
  });
});

describe('Contrato 360 — nota ou fatura a conferir', () => {
  it('entra na fila com o mesmo id da Visão Geral (o link ?item= destaca a linha) e o ✓ a dispensa', () => {
    const fila = buildContractActionQueue({ contract: contrato, contractKey: K, plan: null, ausentesDaFonte: [nota(), fatura()], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    const fontes = fila.items.filter((i) => i.kind === 'FONTE');
    expect(fontes.map((i) => i.id).sort()).toEqual(['ATT-FONTE-FATURA-987', 'ATT-FONTE-NOTA-ce-1']);
    expect(fontes.find((i) => i.id === 'ATT-FONTE-NOTA-ce-1')!.ausenteDaFonte).toEqual({ tipo: 'NOTA', chave: 'ce-1' });

    const chave = fontes.find((i) => i.id === 'ATT-FONTE-NOTA-ce-1')!.avisoChave!;
    const dispensada = buildContractActionQueue({ contract: contrato, contractKey: K, plan: null, ausentesDaFonte: [nota()], avisosResolvidos: new Set([chave]), currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(dispensada.items.filter((i) => i.kind === 'FONTE')).toEqual([]);
    expect(dispensada.dispensados.map((i) => i.kind)).toEqual(['FONTE']);
  });
});
