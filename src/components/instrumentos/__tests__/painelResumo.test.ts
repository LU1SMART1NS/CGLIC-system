import { describe, it, expect } from 'vitest';
import { contarFaixas, criticasPorInstrumento, organizarCartoesDistribuicao, resumoPorGestor, type InstrumentoNoPainel, type ResumoDoGestor } from '../painelResumo';
import type { DashboardAttentionItem } from '../../../types/managementDashboard';

const atas: InstrumentoNoPainel[] = [
  { chave: '00010/2025', uasg: '200330', faixa: 'REGULAR' },
  { chave: '00011/2025', uasg: '200330', faixa: 'CRITICO' },
  { chave: '00012/2025', uasg: '200331', faixa: 'EXPIRADO' },
  { chave: '00013/2025', uasg: '200331', faixa: 'ATENCAO' }
];
const contratos: InstrumentoNoPainel[] = [
  { chave: 'C1', uasg: '200330', faixa: 'ATENCAO' },
  { chave: 'C2', uasg: '200330', faixa: 'REGULAR' },
  { chave: 'C3', uasg: '200331', faixa: 'SEM_DATA' }
];

const item = (over: Partial<DashboardAttentionItem>): DashboardAttentionItem => ({ id: Math.random().toString(), category: 'LEMBRETE', severity: 'CRITICA', title: 't', ...over });

describe('contarFaixas', () => {
  it('conta como o trilho das carteiras: vigentes sem encerradas nem sem data', () => {
    expect(contarFaixas(atas)).toEqual({ regular: 1, atencao: 1, critico: 1, vigentes: 3 });
    expect(contarFaixas(contratos)).toEqual({ regular: 1, atencao: 1, critico: 0, vigentes: 2 });
  });
});

describe('criticasPorInstrumento', () => {
  it('saldo de item conta para a ata; pagamento e tarefa, para o contrato; só críticas', () => {
    const r = criticasPorInstrumento([
      item({ category: 'ATA_CRITICA', arpKey: '00011/2025-200330-00003', numeroAta: '00011/2025', contractKey: 'C9' }),
      item({ category: 'PAGAMENTO_CRITICO', contractKey: 'C1', numeroContrato: '00001/2025' }),
      item({ category: 'TAREFA_ATRASADA', contractKey: 'C2', severity: 'URGENTE' })
    ]);
    expect(r).toEqual([
      { tipo: 'ATA', chave: '00011/2025' },
      { tipo: 'CONTRATO', chave: 'C1' }
    ]);
  });
});

describe('resumoPorGestor', () => {
  it('separa atas e contratos de cada carteira e junta o resto em "sem gestor"', () => {
    const linhas = resumoPorGestor(
      [{ gestor: { userId: 'ana', nome: 'Ana' }, escopo: { ataKeys: new Set(['00010/2025', '00011/2025']), contractKeys: new Set(['C1']) } }],
      atas,
      contratos,
      [{ tipo: 'ATA', chave: '00011/2025' }, { tipo: 'CONTRATO', chave: 'C2' }]
    );
    expect(linhas[0]).toEqual({
      gestor: { userId: 'ana', nome: 'Ana' },
      atas: { total: 2, vencem90: 1, criticas: 1 },
      contratos: { total: 1, vencem90: 1, criticas: 0 }
    });
    // Sem gestor: a ata 00013 (a 00012 está encerrada) e o contrato C2 (C3 está sem data).
    expect(linhas[1]).toEqual({
      atas: { total: 1, vencem90: 1, criticas: 0 },
      contratos: { total: 1, vencem90: 0, criticas: 1 }
    });
  });
});

describe('organizarCartoesDistribuicao (números da tela de 15/10/2026)', () => {
  const lado = (total: number, vencem90 = 0, criticas = 0) => ({ total, vencem90, criticas });
  const g = (nome: string, atas: ReturnType<typeof lado>, contratos: ReturnType<typeof lado>): ResumoDoGestor => ({ gestor: { userId: nome, nome }, atas, contratos });
  const linhas: ResumoDoGestor[] = [
    g('Alan Jonne', lado(3), lado(2)),
    g('Borges', lado(30, 5, 13), lado(40, 9, 3)),
    g('Daniela', lado(0), lado(0)),
    g('Renilda', lado(16, 7), lado(66, 5)),
    g('Vanessa', lado(33, 10, 6), lado(96, 29, 2)),
    { atas: lado(0), contratos: lado(36, 8, 2) }
  ];
  const r = organizarCartoesDistribuicao(linhas);

  it('sem gestor separado e primeiro', () => {
    expect(r.semGestor?.contratos.total).toBe(36);
  });
  it('mais críticas primeiro, depois a maior carteira', () => {
    expect(r.gestores.map((x) => x.gestor.nome)).toEqual(['Borges', 'Vanessa', 'Renilda', 'Alan Jonne']);
    expect(r.gestores[0].criticas).toBe(16);
  });
  it('barra relativa à maior carteira', () => {
    const v = r.gestores.find((x) => x.gestor.nome === 'Vanessa')!;
    expect(v).toMatchObject({ carga: 129, pctDaMaior: 100, maiorCarteira: true });
    expect(r.gestores.find((x) => x.gestor.nome === 'Alan Jonne')!.pctDaMaior).toBe(4);
  });
  it('gestor sem carteira vai para o rodapé', () => {
    expect(r.semCarteira).toEqual(['Daniela']);
  });
  it('sem gestor vazio não aparece', () => {
    expect(organizarCartoesDistribuicao([g('Ana', lado(1), lado(0)), { atas: lado(0), contratos: lado(0) }]).semGestor).toBeNull();
  });
});
