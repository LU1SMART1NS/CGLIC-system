import { describe, it, expect } from 'vitest';
import { buildFilaSemAta, sugerirAtas, type FilaAta, type FilaContrato } from '../contratosSemAta';
import type { ContractDashboardRecord } from '../../../../types';

// idCompra do contrato = UASG + modalidade + número da compra + ano (formato do Compras.gov.br)
const contrato = (contractKey: string, extra: Partial<FilaContrato> = {}): FilaContrato => ({
  contractKey,
  numero: contractKey,
  fornecedorCnpj: '11.111.111/0001-11',
  idCompra: '20033105900252025',
  faixa: 'REGULAR',
  dias: 100,
  contract: { id: contractKey } as ContractDashboardRecord,
  ...extra
});
const ata = (numeroAta: string, extra: Partial<FilaAta> = {}): FilaAta => ({
  numeroAta,
  uasg: '200331',
  numeroCompra: '90025',
  anoCompra: '2025',
  cnpjs: ['11111111000111'],
  temItens: true,
  ...extra
});

describe('sugerirAtas', () => {
  it('UNICA quando uma ata tem a mesma compra e o mesmo fornecedor', () => {
    const r = sugerirAtas(contrato('c1'), [ata('00001/2025'), ata('00002/2025', { numeroCompra: '90099' })]);
    expect(r.situacao).toBe('UNICA');
    expect(r.sugestoes[0]).toMatchObject({ numeroAta: '00001/2025', motivo: 'COMPRA_E_FORNECEDOR' });
    expect(r.sugestoes[1]).toMatchObject({ numeroAta: '00002/2025', motivo: 'FORNECEDOR' });
  });

  it('VARIAS quando mais de uma ata casa nos dois critérios', () => {
    expect(sugerirAtas(contrato('c1'), [ata('00001/2025'), ata('00002/2025')]).situacao).toBe('VARIAS');
  });

  it('PARCIAL com só a mesma compra ou só o mesmo fornecedor; NENHUMA sem pista', () => {
    expect(sugerirAtas(contrato('c1'), [ata('00001/2025', { cnpjs: ['99999999000199'] })]).situacao).toBe('PARCIAL');
    expect(sugerirAtas(contrato('c1', { idCompra: '', fornecedorCnpj: '22.222.222/0001-22' }), [ata('00001/2025')]).situacao).toBe('NENHUMA');
  });
});

describe('buildFilaSemAta', () => {
  it('deixa de fora vinculados e encerrados; confirmados "sem ata" vão para a lista própria', () => {
    const fila = buildFilaSemAta({
      contratos: [
        contrato('vinculado'),
        contrato('expirado', { faixa: 'EXPIRADO' }),
        contrato('confirmado', { idCompra: '' , fornecedorCnpj: '' }),
        contrato('sem-pista', { idCompra: '', fornecedorCnpj: '', dias: 5 }),
        contrato('unica', { dias: 300 })
      ],
      atas: [ata('00001/2025')],
      vinculados: new Set(['vinculado']),
      confirmadosSemAta: new Set(['confirmado'])
    });
    expect(fila.pendentes.map((i) => i.contractKey)).toEqual(['unica', 'sem-pista']); // mais fáceis primeiro
    expect(fila.confirmados.map((i) => i.contractKey)).toEqual(['confirmado']);
    expect(fila.contagem).toEqual({ UNICA: 1, VARIAS: 0, PARCIAL: 0, NENHUMA: 1 });
  });
});
