import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ataManagerService', () => ({ saveAtaManagerRpc: vi.fn() }));
vi.mock('../../adapters/contractManagementRpcAdapter', () => ({ saveContractManagerRpc: vi.fn() }));

import { saveAtaManagerRpc } from '../ataManagerService';
import { saveContractManagerRpc } from '../../adapters/contractManagementRpcAdapter';
import {
  assignManagerWithPropagation,
  parseContractKey,
  resolveManagerPropagation
} from '../managerAssignmentService';

const links = [
  { ataKey: '00001/2025', contractKey: '200331-00010-2025' },
  { ataKey: '00001/2025', contractKey: '200331-00011-2025' },
  // contrato 00011 também usa itens da ata 00002 → as duas atas ficam no mesmo grupo
  { ataKey: '00002/2025', contractKey: '200331-00011-2025' },
  { ataKey: '00002/2025', contractKey: '200331-00012-2025' },
  // grupo independente
  { ataKey: '00009/2025', contractKey: '200330-00090-2025' }
];

describe('resolveManagerPropagation — gestor da ata = gestor dos contratos vinculados', () => {
  it('a partir de uma ata alcança os contratos dela e, por eles, as demais atas ligadas', () => {
    expect(resolveManagerPropagation([{ tipo: 'ATA', ataKey: '00001/2025' }], links)).toEqual({
      ataKeys: ['00001/2025', '00002/2025'],
      contractKeys: ['200331-00010-2025', '200331-00011-2025', '200331-00012-2025']
    });
  });

  it('a partir de um contrato alcança a ata e os outros contratos dela', () => {
    expect(resolveManagerPropagation([{ tipo: 'CONTRATO', contractKey: '200330-00090-2025' }], links)).toEqual({
      ataKeys: ['00009/2025'],
      contractKeys: ['200330-00090-2025']
    });
  });

  it('contrato ou ata sem vínculo afeta só a si mesmo', () => {
    expect(resolveManagerPropagation([{ tipo: 'CONTRATO', contractKey: '200331-00500-2024' }], links)).toEqual({
      ataKeys: [],
      contractKeys: ['200331-00500-2024']
    });
    expect(resolveManagerPropagation([{ tipo: 'ATA', ataKey: '00077/2026' }], links)).toEqual({
      ataKeys: ['00077/2026'],
      contractKeys: []
    });
  });

  it('lote soma os grupos sem duplicar', () => {
    const result = resolveManagerPropagation(
      [
        { tipo: 'ATA', ataKey: '00009/2025' },
        { tipo: 'CONTRATO', contractKey: '200331-00012-2025' }
      ],
      links
    );
    expect(result.ataKeys).toEqual(['00001/2025', '00002/2025', '00009/2025']);
    expect(result.contractKeys).toHaveLength(4);
  });
});

describe('parseContractKey', () => {
  it('separa UASG, número e ano da chave canônica', () => {
    expect(parseContractKey('200330-00065-2021')).toEqual({ uasg: '200330', numero: '00065', ano: 2021 });
    expect(parseContractKey('chave-invalida')).toBeNull();
  });
});

describe('assignManagerWithPropagation', () => {
  beforeEach(() => {
    vi.mocked(saveAtaManagerRpc).mockReset().mockResolvedValue({} as any);
    vi.mocked(saveContractManagerRpc).mockReset().mockResolvedValue({} as any);
  });

  it('grava o mesmo gestor na ata e em todos os contratos do grupo', async () => {
    const result = await assignManagerWithPropagation({
      targets: [{ tipo: 'CONTRATO', contractKey: '200330-00090-2025' }],
      gestorNome: '  Maria Souza ',
      gestorUserId: 'user-maria',
      links
    });

    expect(saveAtaManagerRpc).toHaveBeenCalledWith({ ataKey: '00009/2025', gestorNome: 'Maria Souza', gestorUserId: 'user-maria' });
    expect(saveContractManagerRpc).toHaveBeenCalledWith({
      uasg: '200330',
      numero: '00090',
      ano: 2025,
      gestorNome: 'Maria Souza',
      gestorUserId: 'user-maria'
    });
    expect(result.falhas).toEqual([]);
    expect(result.atualizados).toEqual({ atas: ['00009/2025'], contratos: ['200330-00090-2025'] });
  });

  it('segue gravando o restante quando um item falha e devolve a falha', async () => {
    vi.mocked(saveContractManagerRpc).mockImplementation(async (input: any) => {
      if (input.numero === '00011') throw new Error('UNAUTHORIZED');
      return {} as any;
    });

    const result = await assignManagerWithPropagation({
      targets: [{ tipo: 'ATA', ataKey: '00001/2025' }],
      gestorNome: 'João',
      links
    });

    expect(result.atualizados.atas).toHaveLength(2);
    expect(result.atualizados.contratos).toHaveLength(2);
    expect(result.falhas).toEqual([{ chave: '200331-00011-2025', tipo: 'CONTRATO', erro: 'UNAUTHORIZED' }]);
  });
});
