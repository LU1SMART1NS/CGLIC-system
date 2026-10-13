import { describe, it, expect, vi, afterAll } from 'vitest';
import type { ArpRecord, ContractDashboardRecord } from '../../types';
import { calculateAttentionSummary } from '../dashboardService';
import { buildAtaActionQueue } from '../ataActionQueueService';
import { buildContractActionQueue } from '../contractActionQueueService';
import { chaveAvisoVinculo } from '../avisosResolvidosService';
import {
  numeroDoContrato,
  partesDoItemKey,
  textoDoMotivoVinculo,
  trabalhoDoGestor,
  vinculoDaLinha,
  type VinculoAConferir
} from '../vinculosAConferirService';

/**
 * Caso de 13/10/2026: o contrato 00297/2026 (ITURRI) está vinculado pelo sistema ao item 3 da ata 00043/2026 e o
 * Daniel dividiu os 500 entre unidades. Se a fonte desmentir o vínculo, o cron não o apaga (migration 112): o aviso
 * vai para o gestor da ata e do contrato e o coordenador decide.
 */
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-10-13T12:00:00-03:00'));
afterAll(() => {
  vi.useRealTimers();
});

const ITEM = '00043/2026-200331-00003';
const CONTRATO = '200331-00297-2026';

const linha = (extra: Record<string, unknown> = {}) => ({
  item_key: ITEM,
  contract_key: CONTRATO,
  motivo: 'ITEM_SAIU_DO_CONTRATO',
  detectado_em: '2026-10-13T14:00:00+00:00',
  gestor_ata: 'Alan Jonne',
  gestor_contrato: 'Alan Jonne',
  quantidade_fonte: '500',
  quantidade_ajustada: null,
  ajuste_justificativa: null,
  ajustado_por_nome: null,
  dividido_por_nome: 'Daniel Espíndola',
  quantidade_dividida: '500',
  ...extra
});

const vinculo = (extra: Partial<VinculoAConferir> = {}): VinculoAConferir => ({ ...vinculoDaLinha(linha()), ...extra });

const arp = {
  numeroAtaRegistroPreco: '00043/2026',
  codigoUnidadeGerenciadora: '200331',
  dataVigenciaInicial: '2026-09-10',
  dataVigenciaFinal: '2027-09-10',
  objeto: 'EPI para incêndio'
} as ArpRecord;

describe('vínculo a conferir — leitura', () => {
  it('lê a linha da view com números e nomes', () => {
    expect(vinculo()).toMatchObject({
      itemKey: ITEM,
      contractKey: CONTRATO,
      numeroAta: '00043/2026',
      uasg: '200331',
      numeroItem: '00003',
      motivo: 'ITEM_SAIU_DO_CONTRATO',
      gestorAta: 'Alan Jonne',
      quantidadeFonte: 500,
      quantidadeAjustada: undefined,
      divididoPorNome: 'Daniel Espíndola',
      quantidadeDividida: 500
    });
  });

  it('separa a chave do item e formata o número do contrato', () => {
    expect(partesDoItemKey(ITEM)).toEqual({ numeroAta: '00043/2026', uasg: '200331', numeroItem: '00003' });
    expect(partesDoItemKey('lixo')).toEqual({ numeroAta: '', uasg: '', numeroItem: '' });
    expect(numeroDoContrato(CONTRATO)).toBe('00297/2026');
  });

  it('descreve o motivo em linguagem simples e cai numa frase genérica quando não conhece', () => {
    expect(textoDoMotivoVinculo('OUTRO_FORNECEDOR')).toContain('fornecedor');
    expect(textoDoMotivoVinculo('MOTIVO_NOVO')).toContain('já não confirmam');
  });

  it('diz o que o gestor fez, com quem e quanto', () => {
    expect(trabalhoDoGestor(vinculo())).toBe('500 divididos entre unidades por Daniel Espíndola');
    expect(trabalhoDoGestor(vinculo({ quantidadeAjustada: 80, ajustadoPorNome: 'Daniel', quantidadeDividida: 0, divididoPorNome: undefined }))).toBe('quantidade ajustada para 80 por Daniel');
    expect(trabalhoDoGestor(vinculo({ quantidadeAjustada: 80, ajustadoPorNome: 'Daniel' }))).toContain(' e 500 divididos');
  });

  it('a chave do aviso muda com o motivo e com a marca refeita, e usa o tipo SALDO', () => {
    const base = chaveAvisoVinculo('00043/2026', '200331', '00003', CONTRATO, 'ITEM_SAIU_DO_CONTRATO', '2026-10-13T14:00:00+00:00');
    expect(base).toMatch(/^SALDO::00043\/2026-200331::3::VINCULO-200331-00297-2026-ITEM_SAIU_DO_CONTRATO-\d+$/);
    expect(chaveAvisoVinculo('00043/2026', '200331', '3', CONTRATO, 'OUTRO_FORNECEDOR', '2026-10-13T14:00:00+00:00')).not.toBe(base);
    expect(chaveAvisoVinculo('00043/2026', '200331', '3', CONTRATO, 'ITEM_SAIU_DO_CONTRATO', '2026-10-20T14:00:00+00:00')).not.toBe(base);
    expect(base.length).toBeLessThan(300);
  });
});

describe('Visão Geral — vínculo a conferir', () => {
  it('só a ata em tela entra; urgente, destino na aba Contratos do item, resolvível pelo ✓', () => {
    const fora = vinculo({ itemKey: '00099/2026-200331-00001', numeroAta: '00099/2026', numeroItem: '00001' });
    const resumo = calculateAttentionSummary({ arps: [arp], vinculosAConferir: [vinculo(), fora], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    const itens = resumo.items.filter((i) => i.category === 'VINCULO_A_CONFERIR');
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      id: `ATT-VINCULO-${ITEM}-${CONTRATO}`,
      severity: 'URGENTE',
      numeroAta: '00043/2026',
      contractKey: CONTRATO,
      numeroContrato: '00297/2026',
      arpKey: '00043/2026-200331',
      targetUrl: '/atas/detalhe/00043%2F2026-200331/itens/3?aba=contratos',
      badgeLabel: 'a conferir'
    });
    expect(itens[0].description).toContain('Ata 00043/2026');
    expect(itens[0].description).toContain('o coordenador decide');
    expect(itens[0].avisoChave).toMatch(/^SALDO::00043\/2026-200331::3::VINCULO-/);
  });

  it('o ✓ do gestor tira o aviso da lista e o leva para os resolvidos', () => {
    const v = vinculo();
    const chave = chaveAvisoVinculo(v.numeroAta, v.uasg, v.numeroItem, v.contractKey, v.motivo, v.detectadoEm);
    const resumo = calculateAttentionSummary({ arps: [arp], vinculosAConferir: [v], avisosResolvidos: new Set([chave]), currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(resumo.items.filter((i) => i.category === 'VINCULO_A_CONFERIR')).toEqual([]);
    expect(resumo.resolvidos?.map((i) => i.category)).toContain('VINCULO_A_CONFERIR');
  });

  it('sem vínculos a conferir, nada muda', () => {
    const resumo = calculateAttentionSummary({ arps: [arp], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(resumo.items.filter((i) => i.category === 'VINCULO_A_CONFERIR')).toEqual([]);
  });
});

describe('Ata 360 — vínculo a conferir', () => {
  it('entra na fila só nesta ata, em urgente, e o ✓ o leva para os dispensados', () => {
    const outraAta = vinculo({ itemKey: '00099/2026-200331-00001', numeroAta: '00099/2026', numeroItem: '00001' });
    const fila = buildAtaActionQueue({ arp, vinculosAConferir: [vinculo(), outraAta], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    const item = fila.items.find((i) => i.kind === 'VINCULO')!;
    expect(fila.items.filter((i) => i.kind === 'VINCULO')).toHaveLength(1);
    expect(item).toMatchObject({ severity: 'URGENTE', numeroItem: '3', badgeLabel: 'a conferir' });
    expect(item.title).toContain('contrato 00297/2026');
    expect(fila.counts.URGENTE).toBe(1);

    const resolvido = buildAtaActionQueue({ arp, vinculosAConferir: [vinculo()], avisosResolvidos: new Set([item.avisoChave!]), currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(resolvido.items.filter((i) => i.kind === 'VINCULO')).toEqual([]);
    expect(resolvido.dispensados.map((i) => i.kind)).toEqual(['VINCULO']);
  });
});

describe('Contrato 360 — vínculo a conferir', () => {
  const contrato = {
    id: CONTRATO,
    numero: '00297',
    ano: 2026,
    uasg: '200331',
    objeto: 'EPI',
    fornecedorNome: 'ITURRI S.A.',
    valorGlobal: 1000,
    dataVigenciaInicio: '2026-10-07',
    dataVigenciaFim: '2027-10-07',
    statusVigencia: 'Vigente'
  } as ContractDashboardRecord;

  it('entra na fila só neste contrato, com o caminho para o item, e o ✓ o dispensa', () => {
    const outroContrato = vinculo({ contractKey: '200331-00001-2026' });
    const fila = buildContractActionQueue({ contract: contrato, contractKey: CONTRATO, plan: null, vinculosAConferir: [vinculo(), outroContrato], currentDate: new Date('2026-10-13T12:00:00-03:00') });
    const item = fila.items.find((i) => i.kind === 'VINCULO')!;
    expect(fila.items.filter((i) => i.kind === 'VINCULO')).toHaveLength(1);
    expect(item).toMatchObject({ severity: 'URGENTE', badgeLabel: 'a conferir', targetUrl: '/atas/detalhe/00043%2F2026-200331/itens/3?aba=contratos' });
    expect(item.title).toContain('ata 00043/2026');

    const dispensado = buildContractActionQueue({ contract: contrato, contractKey: CONTRATO, plan: null, vinculosAConferir: [vinculo()], avisosResolvidos: new Set([item.avisoChave!]), currentDate: new Date('2026-10-13T12:00:00-03:00') });
    expect(dispensado.items.filter((i) => i.kind === 'VINCULO')).toEqual([]);
    expect(dispensado.dispensados.map((i) => i.kind)).toEqual(['VINCULO']);
  });
});
