import { describe, it, expect } from 'vitest';
import { buildDistribuicaoEquipe, ordenarDistribuicao, type DistribuicaoAta, type DistribuicaoContrato } from '../distribuicaoEquipe';
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
  ({ id: Math.random().toString(), category: 'LEMBRETE', severity: 'ATENCAO', title: 'x', ...fields }) as DashboardAttentionItem;

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

  it('põe "Sem gestor" primeiro e os gestores em ordem alfabética; por carga quando pedido', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Bruno'), ata('00002/2025'), { ...ata('00003/2025', 'Ana'), itens: 1 }, { ...ata('00004/2025', 'Carla'), itens: 10 }],
      contratos: [],
      links: [],
      attentionItems: []
    });
    expect(linhas.map((l) => l.gestorNome)).toEqual([null, 'Ana', 'Bruno', 'Carla']);
    // Ana: 1 item = Baixa (1); Bruno: sem itens = Média (2); Carla: 10 itens = Alta (3)
    expect(ordenarDistribuicao(linhas, 'CARGA').map((l) => l.gestorNome)).toEqual([null, 'Carla', 'Bruno', 'Ana']);
  });

  it('soma a carga equivalente por complexidade e compara com a média da equipe (±25%)', () => {
    const { linhas, totais } = buildDistribuicaoEquipe({
      atas: [{ ...ata('00001/2025', 'Ana'), itens: 10 }, { ...ata('00002/2025', 'Ana'), itens: 10 }, { ...ata('00003/2025', 'Bruno'), itens: 1 }],
      contratos: [
        { ...contrato('200331-00001-2025', 'Ana'), categoria: 'Serviços', mesesVigencia: 24 },
        { ...contrato('200331-00002-2025', 'Bruno'), categoria: 'Compras', mesesVigencia: 6 },
        { ...contrato('200331-00003-2025', 'Carla'), categoria: 'Compras', mesesVigencia: 13 },
        { ...contrato('200331-00004-2025', 'Carla'), categoria: 'Compras', mesesVigencia: 18 },
        { ...contrato('200331-00005-2025'), categoria: 'Serviços', mesesVigencia: 24 }
      ],
      links: [],
      attentionItems: []
    });
    const por = (n: string | null) => linhas.find((l) => l.gestorNome === n)!;
    expect(por('Ana')).toMatchObject({ complexidade: { ALTA: 3, MEDIA: 0, BAIXA: 0 }, equivalente: 9 });
    expect(por('Bruno')).toMatchObject({ complexidade: { ALTA: 0, MEDIA: 0, BAIXA: 2 }, equivalente: 2 });
    expect(por('Carla')).toMatchObject({ complexidade: { ALTA: 0, MEDIA: 2, BAIXA: 0 }, equivalente: 4 });
    expect(totais.mediaEquivalente).toBe(5); // (9 + 2 + 4) / 3; "Sem gestor" fora da média
    expect(por('Ana').relacaoEquipe).toBe('ACIMA');
    expect(por('Bruno').relacaoEquipe).toBe('ABAIXO');
    expect(por('Carla').relacaoEquipe).toBe('NA_MEDIA'); // 4 está dentro de 5 ± 25%
    expect(por(null).relacaoEquipe).toBeNull();
  });

  it('com um gestor só não há comparação com a média', () => {
    const { linhas, totais } = buildDistribuicaoEquipe({ atas: [ata('00001/2025', 'Ana')], contratos: [], links: [], attentionItems: [] });
    expect(totais.mediaEquivalente).toBeNull();
    expect(linhas[0].relacaoEquipe).toBeNull();
  });

  it('atribui pendências ao gestor do contrato ou da ata, separando urgentes de acompanhamento', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Ana'), ata('00002/2025')],
      contratos: [contrato('200331-00001-2025', 'Bruno'), contrato('200331-00009-2020', 'Bruno', 'EXPIRADO')],
      links: [],
      attentionItems: [
        alerta({ contractKey: '200331-00001-2025', severity: 'CRITICA', category: 'TAREFA_ATRASADA' }),
        alerta({ contractKey: '200331-00001-2025', severity: 'INFO' }),
        alerta({ arpKey: '00001/2025-200331', severity: 'URGENTE' }),
        alerta({ numeroAta: '00002/2025', severity: 'ATENCAO' }),
        alerta({ contractKey: '200331-00009-2020', severity: 'CRITICA' }) // contrato expirado: fora da carteira vigente
      ]
    });
    expect(linhas.find((l) => l.gestorNome === 'Ana')!.pendencias).toEqual({ urgentes: 1, acompanhar: 0, atrasadas: 0 });
    expect(linhas.find((l) => l.gestorNome === 'Bruno')!.pendencias).toEqual({ urgentes: 1, acompanhar: 1, atrasadas: 1 });
    expect(linhas.find((l) => l.gestorNome === null)!.pendencias).toEqual({ urgentes: 0, acompanhar: 1, atrasadas: 0 });
  });

  it('lista as chaves das atas e contratos vigentes de cada gestor (alvos da transferência)', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [ata('00001/2025', 'Ana'), ata('00002/2025', 'Ana', 'EXPIRADO'), ata('00003/2025', 'Ana')],
      contratos: [contrato('200331-00001-2025', 'Ana'), contrato('200331-00002-2025', 'Ana', 'EXPIRADO')],
      links: [],
      attentionItems: []
    });
    const ana = linhas.find((l) => l.gestorNome === 'Ana')!;
    expect(ana.ataKeys).toEqual(['00001/2025', '00003/2025']);
    expect(ana.contractKeys).toEqual(['200331-00001-2025']);
  });

  it('lista os itens vigentes do gestor, atas antes de contratos, cada grupo pelo prazo, com as pendências de cada um', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [
        { ...ata('00001/2025', 'Ana', 'REGULAR'), dias: 200, objeto: 'Papel' },
        { ...ata('00002/2025', 'Ana', 'CRITICO'), dias: 10, uasg: '200331' },
        ata('00003/2024', 'Ana', 'EXPIRADO')
      ],
      contratos: [
        { ...contrato('200331-00001-2025', 'Ana', 'ATENCAO'), dias: 40, objeto: 'Limpeza' },
        { ...contrato('200331-00002-2025', 'Ana', 'REGULAR'), dias: 300 }
      ],
      links: [],
      attentionItems: [
        alerta({ contractKey: '200331-00002-2025', severity: 'URGENTE' }),
        alerta({ contractKey: '200331-00002-2025', severity: 'CRITICA' }),
        alerta({ numeroAta: '00001/2025', severity: 'INFO' })
      ]
    });
    const itens = linhas.find((l) => l.gestorNome === 'Ana')!.itens;
    expect(itens.map((i) => `${i.tipo}:${i.chave}`)).toEqual([
      'ATA:00002/2025', // 10 dias
      'ATA:00001/2025', // 200
      'CONTRATO:200331-00001-2025', // 40
      'CONTRATO:200331-00002-2025' // 300
    ]);
    expect(itens[0].uasg).toBe('200331');
    expect(itens[1]).toMatchObject({ objeto: 'Papel', urgentes: 0, acompanhar: 1 });
    expect(itens[3]).toMatchObject({ urgentes: 2, acompanhar: 0 });
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
  it('contrato em duas atas com o gestor de uma delas não diverge; com gestor de nenhuma, diverge nas duas', () => {
    const { divergencias } = buildDistribuicaoEquipe({
      atas: [ata('00053/2025', 'Daniel'), ata('00025/2025', 'Ana')],
      contratos: [contrato('200331-00033-2026', 'Daniel'), contrato('200331-00034-2026', 'Carla')],
      links: [
        { ataKey: '00053/2025', contractKey: '200331-00033-2026' },
        { ataKey: '00025/2025', contractKey: '200331-00033-2026' },
        { ataKey: '00053/2025', contractKey: '200331-00034-2026' },
        { ataKey: '00025/2025', contractKey: '200331-00034-2026' }
      ],
      attentionItems: []
    });
    expect(divergencias.map((d) => [d.contractKey, d.numeroAta])).toEqual([
      ['200331-00034-2026', '00025/2025'],
      ['200331-00034-2026', '00053/2025']
    ]);
  });
});

describe('ajuste manual de complexidade', () => {
  it('a carga do gestor usa a faixa ajustada (ata e contrato)', () => {
    const { linhas } = buildDistribuicaoEquipe({
      atas: [{ ...ata('00001/2025', 'Ana'), itens: 1 }],
      contratos: [{ ...contrato('200331-00001-2025', 'Ana'), categoria: 'Compras', mesesVigencia: 6 }],
      links: [],
      attentionItems: [],
      ajustes: {
        'CONTRATO:200331-00001-2025': { tipo: 'CONTRATO', chave: '200331-00001-2025', nivel: 'ALTA', motivo: 'Mão de obra com dedicação exclusiva' },
        'ATA:00099/2025': { tipo: 'ATA', chave: '00099/2025', nivel: 'ALTA', motivo: 'Outra ata' }
      }
    });
    const ana = linhas.find((l) => l.gestorNome === 'Ana')!;
    expect(ana.complexidade).toEqual({ ALTA: 1, MEDIA: 0, BAIXA: 1 });
    expect(ana.equivalente).toBe(4);
    const c = ana.itens.find((i) => i.tipo === 'CONTRATO')!;
    expect(c.complexidade.ajuste?.automatica.nivel).toBe('BAIXA');
  });
});
