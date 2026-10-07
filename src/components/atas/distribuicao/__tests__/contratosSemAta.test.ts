import { describe, it, expect } from 'vitest';
import { agruparVinculos, buildPendenciasDistribuicao, contratosParaConferirParcial, sugerirAtas, type FilaAta, type FilaContrato } from '../contratosSemAta';
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
  faixa: 'REGULAR',
  dias: 200,
  itens: 1,
  ...extra
});
const SEM_PISTA = { idCompra: '', fornecedorCnpj: '22.222.222/0001-22' };

describe('sugerirAtas', () => {
  it('UNICA quando uma ata tem a mesma compra e o mesmo fornecedor', () => {
    const r = sugerirAtas(contrato('c1'), [ata('00001/2025'), ata('00002/2025', { numeroCompra: '90099' })]);
    expect(r.situacao).toBe('UNICA');
    expect(r.sugestoes[0]).toMatchObject({ numeroAta: '00001/2025', motivo: 'COMPRA_E_FORNECEDOR' });
    expect(r.sugestoes[1]).toMatchObject({ numeroAta: '00002/2025', motivo: 'FORNECEDOR' });
  });

  it('fornecedor estrangeiro (sem CNPJ) casa com a ata pelo nome e a compra', () => {
    const estrangeiro = contrato('c1', { fornecedorCnpj: 'EXAXONEN1', fornecedorNome: 'AXON  INTERPRISE' });
    const daAta = ata('00001/2025', { cnpjs: ['ESTRANG0000348'], fornecedorNomes: ['Axon Enterprise, Inc.'] });
    const r = sugerirAtas(estrangeiro, [daAta]);
    expect(r.situacao).toBe('UNICA');
    expect(r.sugestoes[0]).toMatchObject({ numeroAta: '00001/2025', motivo: 'COMPRA_E_FORNECEDOR' });
  });

  it('estrangeiro de outra empresa na mesma compra segue como só compra', () => {
    const estrangeiro = contrato('c1', { fornecedorCnpj: 'EXCESKAZB', fornecedorNome: 'CESKÁ ZBROJOVKA A.S.' });
    const daAta = ata('00001/2025', { cnpjs: ['ESTRANG0000348'], fornecedorNomes: ['Axon Enterprise, Inc.'] });
    expect(sugerirAtas(estrangeiro, [daAta])).toMatchObject({ situacao: 'PARCIAL', sugestoes: [{ motivo: 'COMPRA' }] });
  });

  it('VARIAS, PARCIAL e NENHUMA', () => {
    expect(sugerirAtas(contrato('c1'), [ata('00001/2025'), ata('00002/2025')]).situacao).toBe('VARIAS');
    expect(sugerirAtas(contrato('c1'), [ata('00001/2025', { cnpjs: ['99999999000199'] })]).situacao).toBe('PARCIAL');
    expect(sugerirAtas(contrato('c1', SEM_PISTA), [ata('00001/2025')]).situacao).toBe('NENHUMA');
  });
});

describe('buildPendenciasDistribuicao', () => {
  const base = () =>
    buildPendenciasDistribuicao({
      contratos: [
        contrato('vinculado'),
        contrato('expirado', { faixa: 'EXPIRADO' }),
        contrato('provavel-ana', { idCompra: '20033105900332025', fornecedorCnpj: '33.333.333/0001-33' }),
        contrato('provavel-sem-gestor'),
        contrato('com-gestor-sem-pista', { ...SEM_PISTA, gestorNome: 'Bruno' }),
        contrato('sem-pista', { ...SEM_PISTA, dias: 5 }),
        contrato('marcado', SEM_PISTA)
      ],
      atas: [
        ata('00001/2025'), // sem gestor, compra 90025, fornecedor 111
        ata('00003/2025', { numeroCompra: '90033', cnpjs: ['33333333000133'], gestorNome: 'Ana' }),
        ata('00009/2020', { faixa: 'EXPIRADO', numeroCompra: '90099', cnpjs: ['99999999000199'] }) // encerrada, nada a distribuir
      ],
      vinculosDoContrato: new Map([['vinculado', [{ numeroAta: '00001/2025', uasg: '200331', itens: [1] }]]]),
      naoPertencemAAta: new Set(['marcado'])
    });

  it('lista atas sem gestor com vinculados e prováveis; ignora encerrada sem contrato', () => {
    const { atasSemGestor } = base();
    expect(atasSemGestor.map((a) => a.numeroAta)).toEqual(['00001/2025']);
    expect(atasSemGestor[0]).toMatchObject({ vinculados: ['vinculado'], provaveis: ['provavel-sem-gestor'] });
  });

  it('A vincular: todo contrato com ata provável forte (tenha ou não gestor); só os sem pista forte e sem gestor precisam de decisão', () => {
    const p = base();
    expect(p.aVincular.map((i) => i.contractKey)).toEqual(['provavel-ana', 'provavel-sem-gestor']); // mesmo prazo: pelo número
    expect(p.precisamDecisao.map((i) => i.contractKey)).toEqual(['sem-pista']); // o que já tem gestor e não tem ata provável está resolvido
    expect(p.naoPertencem.map((i) => i.contractKey)).toEqual(['marcado']);
  });

  it('contrato que já tem gestor continua em "A vincular" quando tem ata provável; uma ata provável vem antes de várias', () => {
    const p = buildPendenciasDistribuicao({
      contratos: [
        contrato('varias', { dias: 1 }),
        contrato('com-gestor', { idCompra: '20033105900332025', fornecedorCnpj: '33.333.333/0001-33', gestorNome: 'Bruno', dias: 50 })
      ],
      atas: [
        ata('00001/2025'),
        ata('00002/2025'), // as duas casam com "varias" (compra e fornecedor iguais)
        ata('00003/2025', { numeroCompra: '90033', cnpjs: ['33333333000133'], gestorNome: 'Ana' })
      ],
      vinculosDoContrato: new Map(),
      naoPertencemAAta: new Set()
    });
    expect(p.aVincular.map((i) => [i.contractKey, i.situacao])).toEqual([
      ['com-gestor', 'UNICA'],
      ['varias', 'VARIAS']
    ]);
  });

  it('conta contratos a vincular por gestor da ata provável', () => {
    const p = base();
    expect(p.aVincularPorGestor.get('Ana')).toEqual([{ contractKey: 'provavel-ana', numero: 'provavel-ana', numeroAta: '00003/2025', uasg: '200331' }]);
    expect(p.totalAVincular).toBe(1);
  });
  it('ata descartada para o contrato deixa de ser sugerida: sobrando outra, segue em A vincular; sem outra, vai para decisão; aparece em descartados', () => {
    const p = buildPendenciasDistribuicao({
      contratos: [contrato('duas'), contrato('uma')],
      atas: [ata('00001/2025'), ata('00002/2025')], // as duas casam com os dois contratos
      vinculosDoContrato: new Map(),
      naoPertencemAAta: new Set(),
      descartes: new Set(['duas|00001/2025-200331', 'uma|00001/2025-200331', 'uma|00002/2025-200331'])
    });
    const duas = p.aVincular.find((i) => i.contractKey === 'duas');
    expect(duas?.situacao).toBe('UNICA');
    expect(duas?.sugestoes.map((s) => s.numeroAta)).toEqual(['00002/2025']);
    expect(p.aVincular.map((i) => i.contractKey)).toEqual(['duas']);
    expect(p.precisamDecisao.map((i) => i.contractKey)).toEqual(['uma']);
    expect(p.descartados.map((d) => [d.contractKey, d.ataKey])).toEqual([
      ['duas', '00001/2025-200331'],
      ['uma', '00001/2025-200331'],
      ['uma', '00002/2025-200331']
    ]);
  });

  it('vínculo parcial: o contrato vinculado com item ainda fora das atas volta para "A vincular" com a ata que tem esse item', () => {
    const c = contrato('c33', { gestorNome: 'Daniel' });
    const atas = [ata('00053/2025', { numerosItens: [10] }), ata('00025/2025', { numerosItens: [11], gestorNome: 'Ana' }), ata('00007/2025', { numerosItens: [3] })];
    const vinculosDoContrato = new Map([['c33', [{ numeroAta: '00053/2025', uasg: '200331', itens: [10], gestorNome: 'Daniel' }]]]);
    const p = buildPendenciasDistribuicao({ contratos: [c], atas, vinculosDoContrato, itensDoContrato: new Map([['c33', [10, 11]]]), naoPertencemAAta: new Set() });
    expect(p.aVincular).toHaveLength(1);
    expect(p.aVincular[0]).toMatchObject({ contractKey: 'c33', situacao: 'UNICA', itensFaltando: [11] });
    expect(p.aVincular[0].sugestoes.map((s) => s.numeroAta)).toEqual(['00025/2025']);
    expect(p.aVincularPorGestor.get('Ana')?.map((x) => x.numeroAta)).toEqual(['00025/2025']);

    // Todos os itens já vinculados, ou sem os itens do contrato no banco: sai da fila, como sempre.
    const completo = buildPendenciasDistribuicao({ contratos: [c], atas, vinculosDoContrato, itensDoContrato: new Map([['c33', [10]]]), naoPertencemAAta: new Set() });
    expect(completo.aVincular).toEqual([]);
    const semItens = buildPendenciasDistribuicao({ contratos: [c], atas, vinculosDoContrato, naoPertencemAAta: new Set() });
    expect(semItens.aVincular).toEqual([]);
    // A ata com o item que falta foi descartada: sai da fila.
    const descartada = buildPendenciasDistribuicao({
      contratos: [c],
      atas,
      vinculosDoContrato,
      itensDoContrato: new Map([['c33', [10, 11]]]),
      naoPertencemAAta: new Set(),
      descartes: new Set(['c33|00025/2025-200331'])
    });
    expect(descartada.aVincular).toEqual([]);
  });

  it('só confere os itens dos contratos vinculados que têm outra ata provável', () => {
    const vinculosDoContrato = new Map([
      ['c33', [{ numeroAta: '00053/2025', uasg: '200331', itens: [10] }]],
      ['sozinho', [{ numeroAta: '00053/2025', uasg: '200331', itens: [1] }]]
    ]);
    expect(
      contratosParaConferirParcial({
        contratos: [contrato('c33'), contrato('sozinho', SEM_PISTA), contrato('sem-vinculo')],
        atas: [ata('00053/2025'), ata('00025/2025')],
        vinculosDoContrato
      })
    ).toEqual(['c33']);
  });

  it('agrupa os vínculos por contrato e ata, com os itens e o gestor da ata', () => {
    const m = agruparVinculos(
      [
        { ataKey: '00053/2025', contractKey: 'c33', uasg: '200331', numeroItem: 10 },
        { ataKey: '00025/2025', contractKey: 'c33', uasg: '200331', numeroItem: 11 },
        { ataKey: '00025/2025', contractKey: 'c33', uasg: '200331', numeroItem: 11 }
      ],
      (n) => (n === '00025/2025' ? 'Ana' : undefined)
    );
    expect(m.get('c33')).toEqual([
      { numeroAta: '00053/2025', uasg: '200331', itens: [10], gestorNome: undefined },
      { numeroAta: '00025/2025', uasg: '200331', itens: [11], gestorNome: 'Ana' }
    ]);
  });
});
