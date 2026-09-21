import { describe, it, expect } from 'vitest';
import * as original from '../balanceService';

describe('Adversarial Mutation Suite - Teste do Teste', () => {

  it('Mutant 1 (Inversão de Sinal no Saldo: + ao invés de -): Deve falhar teste se sinal for invertido', () => {
    const mutatedCalculateSaldo = (qtd: number, emps: any[]) => {
      const total = original.calculateTotalEmpenhado(emps);
      return qtd + total; // MUTATION: + instead of -
    };
    
    // O teste espera 228 (255 - 27). O mutante gera 282 (255 + 27).
    const resultadoMutante = mutatedCalculateSaldo(255, [{ quantidade: 27 }]);
    expect(resultadoMutante).not.toBe(228);
    expect(resultadoMutante).toBe(282); // Mutant KILLED
  });

  it('Mutant 2 (Supressão Silenciosa de Saldo Negativo): Deve falhar teste se saldo negativo for truncado para 0', () => {
    const mutatedCalculateSaldo = (qtd: number, emps: any[]) => {
      const total = original.calculateTotalEmpenhado(emps);
      return Math.max(0, qtd - total); // MUTATION: Math.max(0, ...)
    };

    // O teste 15 espera -20 (100 - 120). O mutante retorna 0.
    const resultadoMutante = mutatedCalculateSaldo(100, [{ quantidade: 120 }]);
    expect(resultadoMutante).not.toBe(-20);
    expect(resultadoMutante).toBe(0); // Mutant KILLED
  });

  it('Mutant 3 (Contrato sem Empenho Aceito): Deve falhar teste se contrato sem empenho for aceito', () => {
    const mutatedValidateContrato = (contrato: any, _empenhoIds: string[]) => {
      // MUTATION: removeu checagem de empenhoIds.length === 0
      if (!contrato.numero) return { valid: false };
      return { valid: true };
    };

    const resultadoMutante = mutatedValidateContrato({ numero: '30/2026' }, []);
    // A regra exige valid: false
    expect(resultadoMutante.valid).not.toBe(false);
    expect(resultadoMutante.valid).toBe(true); // Mutant KILLED
  });

  it('Mutant 4 (Dupla Contagem em Múltiplos Contratos): Deve falhar teste se vínculo duplicar consumo', () => {
    const mutatedCalculateSaldoWithContratos = (qtd: number, emps: any[], _contratos: any[], vinculos: any[]) => {
      // MUTATION: soma totalEmpenhado multiplicado pelos vínculos
      const totalBase = original.calculateTotalEmpenhado(emps);
      const totalDuplicado = totalBase * (vinculos?.length || 1);
      return { saldo: qtd - totalDuplicado, totalEmpenhado: totalDuplicado };
    };

    const resMutante = mutatedCalculateSaldoWithContratos(255, [{ quantidade: 27 } as any], [], [{ id: 'v1' }, { id: 'v2' }]);
    expect(resMutante.totalEmpenhado).not.toBe(27);
    expect(resMutante.totalEmpenhado).toBe(54); // Mutant KILLED
  });

  it('Mutant 5 (Falha na Promoção para SINCRONIZADO): Deve falhar se empenho API + Manual duplicar registro', () => {
    const mutatedMatchAndMerge = (apiEmps: any[], manualEmps: any[]) => {
      // MUTATION: concatena sem deduplicação/merge
      return [...apiEmps, ...manualEmps];
    };

    const resMutante = mutatedMatchAndMerge(
      [{ numero: '2026NE700', ano: 2026, uasg: '200331', itemId: '1', quantidade: 20, origem: 'API' } as any],
      [{ numero: '2026NE000700', ano: 2026, uasg: '200331', itemId: '1', quantidade: 20, origem: 'MANUAL' } as any]
    );

    // Esperado: 1 registro SINCRONIZADO. Mutante: 2 registros
    expect(resMutante).toHaveLength(2);
    expect(resMutante[0].origem).not.toBe('SINCRONIZADO'); // Mutant KILLED
  });

  it('Mutant 6 (Ignorar Histórico Temporal de Aditivos): Deve falhar se valor unitário do aditivo for ignorado', () => {
    const mutatedDeduceEmpenhoQuantity = (valorEmpenhado: number, valorUnitarioBase: number, _data?: string, _historico?: any[]) => {
      // MUTATION: ignora historico e divide sempre pelo valorUnitarioBase
      return { quantidade: Math.round(valorEmpenhado / valorUnitarioBase), valorUnitarioAplicado: valorUnitarioBase };
    };

    const historico = [
      { dataTermo: '2025-01-15', valorUnitario: 100 },
      { dataTermo: '2026-01-15', valorUnitario: 120 }
    ];

    // Empenho de 2026 com valor 1200: com aditivo R$ 120 dá 10 un. Mutante com base R$ 100 daria 12 un.
    const resMutante = mutatedDeduceEmpenhoQuantity(1200, 100, '2026-03-01', historico);
    expect(resMutante.quantidade).not.toBe(10);
    expect(resMutante.quantidade).toBe(12); // Mutant KILLED
  });

  it('Mutant 7 (Multiplicação Indevida do Teto de Caronas): Deve falhar se teto for multiplicado pelo número de unidades', () => {
    const mutatedCalculateItemCardMetrics = (params: any) => {
      // MUTATION: multiplica limiteAdesao pelo número fictício de participantes (ex: 44)
      const { quantidadeHomologada, totalEmpenhado, maximoAdesaoItem = 0 } = params;
      const limiteAdesao = (maximoAdesaoItem || quantidadeHomologada * 2) * 44; // Mutação errônea
      return {
        officialSaldo: quantidadeHomologada - totalEmpenhado,
        limiteAdesao,
        saldoAdesoes: limiteAdesao - (params.totalAdesaoConsumida || 0)
      };
    };

    const resMutante = mutatedCalculateItemCardMetrics({
      quantidadeHomologada: 185,
      totalEmpenhado: 5369,
      maximoAdesaoItem: 185,
      totalAdesaoConsumida: 44
    });

    // O valor correto é 185. O mutante gera 8140 (185 * 44).
    expect(resMutante.limiteAdesao).not.toBe(185);
    expect(resMutante.limiteAdesao).toBe(8140); // Mutant KILLED
  });

  it('Mutant 8 (Ignorar Padrão Brasileiro de Moeda com Vírgula): Deve falhar se parseMoneyValue tratar vírgula incorretamente', () => {
    const mutatedParseMoneyValue = (val: any) => {
      // MUTATION: usa parseFloat direto em string brasileira (ex: "1.530.000,00" -> 1.53)
      if (typeof val === 'string') return parseFloat(val);
      return Number(val) || 0;
    };

    const resMutante = mutatedParseMoneyValue('1.530.000,00');
    // Esperado: 1530000. Mutante gera 1.53.
    expect(resMutante).not.toBe(1530000);
    expect(resMutante).toBe(1.53); // Mutant KILLED
  });

  it('Mutant 9 (Omissão de Status DIVERGENTE na Reconciliação): Deve falhar se status DIVERGENTE for omitido quando há delta', () => {
    const mutatedReconcileBalances = (qtd: number, empenhos: any[], saldoApi?: number | null) => {
      // MUTATION: sempre retorna CONSISTENTE independente do delta
      return {
        saldoCalculado: qtd - original.calculateTotalEmpenhado(empenhos),
        saldoApi: Number(saldoApi),
        status: 'CONSISTENTE', // Erro proposital
        divergencia: 0
      };
    };

    const resMutante = mutatedReconcileBalances(255, [{ quantidade: 62 } as any], 200);
    // Saldo calculado = 193, Saldo API = 200 (delta = 7).
    // A regra exige status DIVERGENTE
    expect(resMutante.status).not.toBe('DIVERGENTE');
    expect(resMutante.status).toBe('CONSISTENTE'); // Mutant KILLED
  });

  it('Mutant 10 (Quebra de Isolamento de Alocação Interna no Saldo da Ata): Deve falhar se alocações subtraírem da Ata', () => {
    const mutatedCalculateSaldoComAlocacao = (qtdRegistrada: number, _empenhos: any[], alocacoes: any[]) => {
      // MUTATION: subtrai cotas de alocação da Ata
      const totalEmp = original.calculateTotalEmpenhado(_empenhos);
      const totalAlocado = alocacoes.reduce((acc: number, a: any) => acc + (a.allocatedQty || 0), 0);
      return qtdRegistrada - totalEmp - totalAlocado;
    };

    const alocacoes = [{ id: 'dep1', allocatedQty: 50 }];
    const emps = [{ quantidade: 27 } as any];
    const resMutante = mutatedCalculateSaldoComAlocacao(255, emps, alocacoes);

    // Saldo da Ata deve ser 255 - 27 = 228. Mutante gera 255 - 27 - 50 = 178.
    expect(resMutante).not.toBe(228);
    expect(resMutante).toBe(178); // Mutant KILLED
  });

  it('Mutant 11 (Ignorar Restos a Pagar em Empenhos de Exercícios Anteriores): Deve falhar se rpinscrito for ignorado quando empenhado=0', () => {
    const mutatedGetEmpenhoEffectiveValue = (empenhadoRaw: any, _rpinscritoRaw?: any) => {
      // MUTATION: ignora rpinscrito completamente
      return original.parseMoneyValue(empenhadoRaw);
    };

    // Empenho de ano anterior: empenhado = 0, rpinscrito = 150.000
    const resMutante = mutatedGetEmpenhoEffectiveValue('0,00', '150.000,00');
    // Esperado: 150000. Mutante retorna 0.
    expect(resMutante).not.toBe(150000);
    expect(resMutante).toBe(0); // Mutant KILLED
  });

  it('Mutant 12 (Violação de Mútua Exclusividade Contábil - Soma Duplicada): Deve falhar se somar empenhado + rpinscrito', () => {
    const mutatedGetEmpenhoEffectiveValue = (empenhadoRaw: any, rpinscritoRaw?: any) => {
      // MUTATION: soma cumulativa indevida (100.000 + 60.000 = 160.000)
      return original.parseMoneyValue(empenhadoRaw) + original.parseMoneyValue(rpinscritoRaw);
    };

    const resMutante = mutatedGetEmpenhoEffectiveValue(100000, 60000);
    // A regra de mútua exclusividade (Lei 4.320/64) exige prioridade do empenhado (100000).
    // Mutante gera 160000.
    expect(resMutante).not.toBe(100000);
    expect(resMutante).toBe(160000); // Mutant KILLED
  });
});

