import { describe, it, expect } from 'vitest';
import { buildDistribuicaoEquipe, type DistribuicaoAta, type DistribuicaoContrato } from '../distribuicaoEquipe';
import type { DashboardAttentionItem } from '../../../../types/managementDashboard';

const ata = (numeroAta: string, gestorNome?: string, faixa: DistribuicaoAta['faixa'] = 'REGULAR', valor = 100): DistribuicaoAta => ({
  numeroAta,
  gestorNome,
  faixa,
  valor
});
const contrato = (contractKey: string, gestorNome?: string, faixa: DistribuicaoContrato['faixa'] = 'REGULAR', valor = 10): DistribuicaoContrato => ({
  contractKey,
  numero: contractKey.split('-')[1],
  gestorNome,
  faixa,
  valor
});
const alerta = (fields: Partial<DashboardAttentionItem>): DashboardAttentionItem =>
  ({ id: Math.random().toString(), category: 'TAREFA_ATRASADA', severity: 'ATENCAO', title: 'x', ...fields }) as DashboardAttentionItem;

describe('buildDistribuicaoEquipe', () => {
  it('soma só instrumentos vigentes por gestor, com prazo e valor', () => {
    const { linhas, totais } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Ana', 'CRITICO', 500), ata('00002/2025', 'Ana', 'ATENCAO', 300), ata('00003/2024', 'Ana', 'EXPIRADO'), ata('00004/2025', 'Bruno', 'SEM_DATA')],
      contratos: [contrato('200331-00001-2025', 'Ana', 'REGULAR', 50), contrato('200331-00002-2025', 'Bruno', 'CRITICO', 20)],
      links: [],
      attentionItems: []
    });

    const ana = linhas.find((l) => l.gestorNome === 'Ana')!;
    expect(ana.atas).toEqual({ vigentes: 2, criticos: 1, atencao: 1, valor: 800 });
    expect(ana.contratos).toEqual({ vigentes: 1, criticos: 0, atencao: 0, valor: 50 });
    const bruno = linhas.find((l) => l.gestorNome === 'Bruno')!;
    expect(bruno.atas.vigentes).toBe(0);
    expect(bruno.contratos.criticos).toBe(1);
    expect(totais).toMatchObject({ gestores: 2, atas: { vigentes: 2 }, contratos: { vigentes: 2 } });
  });

  it('põe "Sem gestor" primeiro e ordena os gestores pela carga', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Bruno'), ata('00002/2025'), ata('00003/2025', 'Ana'), ata('00004/2025', 'Ana')],
      contratos: [contrato('200331-00001-2025', 'Carla')],
      links: [],
      attentionItems: []
    });
    expect(linhas.map((l) => l.gestorNome)).toEqual([null, 'Ana', 'Bruno', 'Carla']);
  });

  it('atribui pendências ao gestor do contrato ou da ata', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Ana'), ata('00002/2025')],
      contratos: [contrato('200331-00001-2025', 'Bruno'), contrato('200331-00009-2020', 'Bruno', 'EXPIRADO')],
      links: [],
      attentionItems: [
        alerta({ contractKey: '200331-00001-2025' }),
        alerta({ arpKey: '00001/2025-200331' }),
        alerta({ numeroAta: '00002/2025' }),
        alerta({ contractKey: '200331-00009-2020' }) // contrato expirado: fora da carteira vigente
      ]
    });
    expect(linhas.find((l) => l.gestorNome === 'Ana')!.pendencias).toBe(1);
    expect(linhas.find((l) => l.gestorNome === 'Bruno')!.pendencias).toBe(1);
    expect(linhas.find((l) => l.gestorNome === null)!.pendencias).toBe(1);
  });

  it('aponta contrato vinculado com gestor diferente do da ata, uma vez por par', () => {
    const { divergencias } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Ana'), ata('00002/2025', 'Bruno')],
      contratos: [contrato('200331-00001-2025', 'Ana'), contrato('200331-00002-2025', 'Carla'), contrato('200331-00003-2025')],
      links: [
        { ataKey: '00001/2025', contractKey: '200331-00001-2025' },
        { ataKey: '00002/2025', contractKey: '200331-00002-2025' },
        { ataKey: '00002/2025', contractKey: '200331-00002-2025' },
        { ataKey: '00001/2025', contractKey: '200331-00003-2025' }
      ],
      attentionItems: []
    });
    expect(divergencias).toEqual([
      { numeroAta: '00001/2025', gestorAta: 'Ana', contractKey: '200331-00003-2025', numeroContrato: '00003', gestorContrato: undefined },
      { numeroAta: '00002/2025', gestorAta: 'Bruno', contractKey: '200331-00002-2025', numeroContrato: '00002', gestorContrato: 'Carla' }
    ]);
  });
});
