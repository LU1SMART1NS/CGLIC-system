import { describe, it, expect } from 'vitest';
import { buildDistribuicaoEquipe, type DistribuicaoAta, type DistribuicaoContrato } from '../distribuicaoEquipe';
import { avaliarCandidatos, indexarItens, montarLote, type CandidatoAtribuicao } from '../sugestaoAtribuicao';
import type { DashboardAttentionItem } from '../../../../types/managementDashboard';

const ata = (numeroAta: string, gestorNome: string | undefined, itens: number): DistribuicaoAta => ({ numeroAta, gestorNome, faixa: 'REGULAR', valor: 1, itens, fornecedores: 1 });
const contrato = (contractKey: string, gestorNome: string | undefined, categoria: string, mesesVigencia: number): DistribuicaoContrato => ({
  contractKey,
  numero: contractKey,
  gestorNome,
  faixa: 'REGULAR',
  valor: 1,
  categoria,
  mesesVigencia
});

// Ana: 1 ata Alta (3); Bruno: 1 contrato Baixa (1); Carla: nada. Sem gestor: ata 00010 (Média) + contrato vinculado (Alta) + contrato expirado.
const distribuicao = buildDistribuicaoEquipe({
  atas: [ata('00001/2025', 'Ana', 10), ata('00010/2025', undefined, 3)],
  contratos: [
    contrato('200331-00001-2025', 'Bruno', 'Compras', 6),
    contrato('200331-00010-2025', undefined, 'Serviços', 24),
    { ...contrato('200331-00099-2020', undefined, 'Compras', 6), faixa: 'EXPIRADO' }
  ],
  links: [],
  attentionItems: [
    { id: '1', category: 'TAREFA_ATRASADA', severity: 'CRITICA', title: 'x', contractKey: '200331-00001-2025' } as DashboardAttentionItem
  ]
});
const links = [
  { ataKey: '00010/2025', contractKey: '200331-00010-2025' },
  { ataKey: '00010/2025', contractKey: '200331-00099-2020' }
];
const candidatos: CandidatoAtribuicao[] = [
  { nome: 'Carla', userId: 'u3', ehGestor: true },
  { nome: 'Ana', userId: 'u1', ehGestor: true },
  { nome: 'Bruno', userId: 'u2', ehGestor: true },
  { nome: 'Diretor', userId: 'u9', ehGestor: false }
];

describe('montarLote', () => {
  it('inclui os contratos que seguem a ata e ignora os encerrados na carga', () => {
    const lote = montarLote([{ tipo: 'ATA', ataKey: '00010/2025' }], links, indexarItens(distribuicao.linhas));
    expect(lote).toMatchObject({ atas: 1, contratos: 1, vinculados: 1, complexidade: { ALTA: 1, MEDIA: 1, BAIXA: 0 }, equivalente: 5 });
  });
});

describe('avaliarCandidatos', () => {
  const lote = montarLote([{ tipo: 'ATA', ataKey: '00010/2025' }], links, indexarItens(distribuicao.linhas));
  const { opcoes, sugestao } = avaliarCandidatos(lote, candidatos, distribuicao.linhas);
  const por = (n: string) => opcoes.find((o) => o.nome === n)!;

  it('mostra carga atual → depois e a pressão de cada um', () => {
    expect(por('Ana')).toMatchObject({ cargaAtual: 3, cargaDepois: 8, urgentes: 0 });
    expect(por('Bruno')).toMatchObject({ cargaAtual: 1, cargaDepois: 6, urgentes: 1, atrasadas: 1 });
    expect(por('Carla')).toMatchObject({ cargaAtual: 0, cargaDepois: 5 });
  });

  it('lista gestores antes dos demais servidores, em ordem alfabética', () => {
    expect(opcoes.map((o) => o.nome)).toEqual(['Ana', 'Bruno', 'Carla', 'Diretor']);
  });

  it('sugere o gestor com menor carga depois da atribuição (nunca um servidor sem perfil de gestor)', () => {
    expect(sugestao).toBe('Carla');
  });

  it('no empate de carga, sugere quem tem menos urgentes', () => {
    const empate = avaliarCandidatos(lote, [{ nome: 'Ana', userId: 'u1', ehGestor: true }, { nome: 'Bruno', userId: 'u2', ehGestor: true }], [
      { ...distribuicao.linhas.find((l) => l.gestorNome === 'Ana')!, equivalente: 1 },
      distribuicao.linhas.find((l) => l.gestorNome === 'Bruno')!
    ]);
    expect(empate.sugestao).toBe('Ana');
  });

  it('marca quem já é gestor de todo o lote e não sugere com um só gestor possível', () => {
    const loteDaAna = montarLote([{ tipo: 'ATA', ataKey: '00001/2025' }], [], indexarItens(distribuicao.linhas));
    const r = avaliarCandidatos(loteDaAna, [{ nome: 'Ana', userId: 'u1', ehGestor: true }, { nome: 'Carla', userId: 'u3', ehGestor: true }], distribuicao.linhas);
    expect(r.opcoes.find((o) => o.nome === 'Ana')!.jaEhGestor).toBe(true);
    // Ana já é a gestora e Bruno entra pela carteira atual: os elegíveis são Bruno e Carla
    expect(r.sugestao).toBe('Carla');
    const so = avaliarCandidatos(loteDaAna, [{ nome: 'Ana', userId: 'u1', ehGestor: true }], [distribuicao.linhas.find((l) => l.gestorNome === 'Ana')!]);
    expect(so.sugestao).toBeNull();
  });
});
