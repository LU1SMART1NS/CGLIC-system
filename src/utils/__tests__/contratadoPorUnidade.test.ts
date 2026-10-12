import { describe, it, expect } from 'vitest';
import {
  alocacoesPorContrato,
  avaliarAjuste,
  avaliarDivisao,
  contratadoPorNomeDaUnidade,
  legendaDaQuantidade,
  lerInteiro,
  nomeDaFonte,
  unidadesDoContrato,
  type LinhaDivisao
} from '../contratadoPorUnidade';
import { summarizeAllocationExecution, unidadeDaNota } from '../allocationExecution';
import { mapQuantidadeDoContrato } from '../../services/contratadoUnidadeService';
import type { ParcelaDoItem } from '../empenhoDoItem';

const q = (over: Partial<Parameters<typeof legendaDaQuantidade>[0]> = {}) => ({
  ajustada: false,
  quantidadeFonte: 480 as number | null,
  fonte: 'CONTRATOS_GOV' as const,
  fonteMudouAposAjuste: false,
  ajusteQuantidadeFonte: null as number | null,
  ...over
});

describe('texto da fonte embaixo da quantidade', () => {
  it('sem ajuste: só o nome do site', () => {
    expect(legendaDaQuantidade(q())).toEqual({ linha: 'do Contratos.gov.br', aviso: null });
  });

  it('com ajuste: o número do site', () => {
    expect(legendaDaQuantidade(q({ ajustada: true, ajusteQuantidadeFonte: 480 }))).toEqual({ linha: 'No Contratos.gov.br: 480', aviso: null });
  });

  it('a fonte não traz o item', () => {
    expect(legendaDaQuantidade(q({ ajustada: true, quantidadeFonte: null, fonte: 'COMPRAS_GOV' })).linha).toBe('No Compras.gov.br: sem o item');
    expect(legendaDaQuantidade(q({ quantidadeFonte: null, fonte: null as any })).linha).toBe('No Contratos.gov.br: sem o item');
  });

  it('a fonte mudou depois do ajuste', () => {
    expect(legendaDaQuantidade(q({ ajustada: true, ajusteQuantidadeFonte: 470, fonteMudouAposAjuste: true })).aviso).toBe('Mudou de 470 para 480. Confira.');
    expect(legendaDaQuantidade(q({ ajustada: true, ajusteQuantidadeFonte: null, fonteMudouAposAjuste: true })).aviso).toBe('Passou a informar 480. Confira.');
    expect(legendaDaQuantidade(q({ ajustada: true, quantidadeFonte: null, ajusteQuantidadeFonte: 470, fonteMudouAposAjuste: true })).aviso).toBe(
      'Deixou de informar o item (era 470). Confira.'
    );
  });

  it('nome da fonte: sem leitura aponta para o Contratos.gov.br', () => {
    expect(nomeDaFonte('COMPRAS_GOV')).toBe('Compras.gov.br');
    expect(nomeDaFonte(null)).toBe('Contratos.gov.br');
  });
});

describe('lerInteiro', () => {
  it('aceita inteiros com separador de milhar e recusa fração, negativo e vazio', () => {
    expect(lerInteiro('1.000')).toEqual({ valor: 1000, valido: true });
    expect(lerInteiro(' 0 ')).toEqual({ valor: 0, valido: true });
    expect(lerInteiro('4,5').valido).toBe(false);
    expect(lerInteiro('-2').valido).toBe(false);
    expect(lerInteiro('').valido).toBe(false);
    expect(lerInteiro('abc').valido).toBe(false);
  });
});

describe('janela Ajustar quantidade contratada', () => {
  const base = { texto: '500', justificativa: 'Termo aditivo 01/2025 acrescentou 20', ajustadaAtual: null, quantidadeFonte: 480, dividido: 0, consumoOutros: 500, cota: 1200 };

  it('grava com quantidade inteira e justificativa de 15 caracteres', () => {
    expect(avaliarAjuste(base)).toMatchObject({ quantidade: 500, podeSalvar: true, avisos: [], podeDesfazer: false });
  });

  it('justificativa curta ou ausente bloqueia', () => {
    const a = avaliarAjuste({ ...base, justificativa: 'curta' });
    expect(a.podeSalvar).toBe(false);
    expect(a.erroJustificativa).toContain('ao menos 15');
  });

  it('número não inteiro bloqueia', () => {
    expect(avaliarAjuste({ ...base, texto: '4,5' })).toMatchObject({ podeSalvar: false, erroQuantidade: 'Informe um número inteiro, zero ou maior.' });
  });

  it('igual ao ajuste atual não grava; igual à fonte sugere desfazer', () => {
    expect(avaliarAjuste({ ...base, ajustadaAtual: 500 }).podeSalvar).toBe(false);
    const igual = avaliarAjuste({ ...base, ajustadaAtual: 500, texto: '480' });
    expect(igual.igualAFonte).toBe(true);
    expect(igual.podeDesfazer).toBe(true);
  });

  it('acima da cota e abaixo do dividido só avisam', () => {
    const a = avaliarAjuste({ ...base, texto: '750', dividido: 800 });
    expect(a.podeSalvar).toBe(true);
    expect(a.avisos[0]).toContain('1.250, acima do quantitativo SENASP (1.200)');
    expect(a.avisos[1]).toContain('Já há 800 deste contrato divididos');
  });

  it('desfazer também exige justificativa', () => {
    expect(avaliarAjuste({ ...base, ajustadaAtual: 500, justificativa: '' }).podeDesfazer).toBe(false);
  });
});

describe('janela Unidades do contrato no item', () => {
  const linhas = (a: string, b: string): LinhaDivisao[] => [
    { unidade: 'DFNSP', alocado: 700, contratadoOutros: 650, original: 0, texto: a },
    { unidade: 'DGFNSP', alocado: 400, contratadoOutros: 150, original: 0, texto: b }
  ];

  it('divisão completa grava; livre = alocado − outros contratos', () => {
    const a = avaliarDivisao(linhas('50', '150'), 200);
    expect(a.porLinha.get('DFNSP')).toMatchObject({ livre: 50, naoCabe: false, quantidade: 50 });
    expect(a).toMatchObject({ soma: 200, semUnidade: 0, erros: [], avisos: [], podeSalvar: true });
    expect(a.mudancas).toEqual(['DFNSP 50', 'DGFNSP 150']);
  });

  it('acima do livre da unidade bloqueia', () => {
    const a = avaliarDivisao(linhas('120', '80'), 200);
    expect(a.porLinha.get('DFNSP')?.naoCabe).toBe(true);
    expect(a.erros[0]).toContain('DFNSP não tem alocação livre para 120: cabem no máximo 50');
    expect(a.podeSalvar).toBe(false);
  });

  it('soma acima do contrato bloqueia', () => {
    const a = avaliarDivisao(linhas('50', '200'), 200);
    expect(a.erros.join(' ')).toContain('passa do contratado no item (200)');
    expect(a.podeSalvar).toBe(false);
  });

  it('divisão parcial grava com aviso do que fica sem unidade', () => {
    const a = avaliarDivisao(linhas('50', '50'), 200);
    expect(a.podeSalvar).toBe(true);
    expect(a.semUnidade).toBe(100);
    expect(a.avisos[0]).toContain('100 ficam sem unidade');
  });

  it('não inteiro, tudo zero ou nada mudou não grava', () => {
    expect(avaliarDivisao(linhas('1,5', ''), 200).podeSalvar).toBe(false);
    expect(avaliarDivisao(linhas('', '0'), 200).podeSalvar).toBe(false);
    const sem = avaliarDivisao([{ unidade: 'DFNSP', alocado: 700, contratadoOutros: 0, original: 50, texto: '50' }], 200);
    expect(sem.podeSalvar).toBe(false);
  });

  it('tirar uma unidade aparece no resumo', () => {
    const a = avaliarDivisao([{ unidade: 'DFNSP', alocado: 700, contratadoOutros: 0, original: 50, texto: '0' }, { unidade: 'DGFNSP', alocado: 400, contratadoOutros: 0, original: 0, texto: '20' }], 200);
    expect(a.mudancas).toEqual(['− DFNSP', 'DGFNSP 20']);
  });
});

describe('unidade herdada pela nota', () => {
  const contratos = [
    mapQuantidadeDoContrato({ item_key: 'i', contract_key: 'C12', unidades: [{ unidade: 'DFNSP', quantidade: 500, alocada: true }] }),
    mapQuantidadeDoContrato({ item_key: 'i', contract_key: 'C31', unidades: [{ unidade: 'DFNSP', quantidade: 150, alocada: true }, { unidade: 'dgfnsp', quantidade: 150, alocada: true }] }),
    mapQuantidadeDoContrato({ item_key: 'i', contract_key: 'C45', unidades: [] }),
    mapQuantidadeDoContrato({ item_key: 'i', contract_key: 'C77', unidades: [{ unidade: 'CGLIC', quantidade: 10, alocada: false }] })
  ];
  const allocations = [{ id: 'a1', unitName: 'DFNSP' }, { id: 'a2', unitName: 'DGFNSP' }];
  const porContrato = alocacoesPorContrato(contratos, allocations);

  it('mapeia as unidades de cada contrato em alocações (sem divisão ou sem alocação fica de fora)', () => {
    expect([...porContrato.entries()]).toEqual([['C12', ['a1']], ['C31', ['a1', 'a2']]]);
    expect(unidadesDoContrato(contratos[3])).toEqual([]);
  });

  const parcela = (numero: string, contractKey: string, quantidade: number | null): ParcelaDoItem => ({
    contratoEmpenhoId: numero,
    contractKey,
    empenhoId: numero,
    numeroOficial: numero,
    dataEmissao: null,
    uasgEmitente: null,
    numeroItem: 1,
    valor: 1,
    quantidade,
    quantidadeCalculada: quantidade,
    informada: false,
    valorMudou: null,
    origem: 'AUTO',
    vinculadaPorNome: null,
    vinculadaEm: null
  });

  it('nota de contrato de uma unidade herda; de contrato dividido entre várias, só com escolha', () => {
    const empenho = { parcelas: [parcela('2025NE000207', 'C12', 390), parcela('2025NE000418', 'C31', 80), parcela('2025NE000522', 'C31', 40)] };
    const r = summarizeAllocationExecution(allocations, empenho, { '2025NE000418': 'a1' }, porContrato);
    expect(r.porAlocacao.get('a1')).toEqual({ empenhado: 470, vinculados: 2 });
    expect(r.porAlocacao.get('a2')).toEqual({ empenhado: 0, vinculados: 0 });
    expect(r.semUnidade).toEqual({ empenhado: 40, count: 1 });
    expect(r.foraDoContrato).toEqual([]);
  });

  it('ligação à mão fora da divisão do contrato vale, mas fica para conferir', () => {
    const empenho = { parcelas: [parcela('2025NE000207', 'C12', 390)] };
    const r = summarizeAllocationExecution(allocations, empenho, { '2025NE000207': 'a2' }, porContrato);
    expect(r.porAlocacao.get('a2')?.empenhado).toBe(390);
    expect(r.foraDoContrato).toEqual([{ numero: '2025NE000207', allocationId: 'a2', contractKey: 'C12' }]);
  });

  it('sem o mapa dos contratos, nada é herdado (comportamento antigo)', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2025NE000207', 'C12', 390)] }, {});
    expect(r.semUnidade.count).toBe(1);
  });

  it('unidadeDaNota diz se a unidade veio do contrato', () => {
    expect(unidadeDaNota('2025NE207', 'C12', {}, porContrato)).toEqual({ allocationId: 'a1', herdada: true });
    expect(unidadeDaNota('2025NE000207', 'C12', { '2025NE207': 'a2' }, porContrato)).toEqual({ allocationId: 'a2', herdada: false });
    expect(unidadeDaNota('2025NE000418', 'C31', {}, porContrato)).toBeNull();
  });

  it('contratado por unidade soma pelo nome sem diferença de caixa', () => {
    const m = contratadoPorNomeDaUnidade([{ unitName: 'DFNSP', quantidadeContratada: 650 }, { unitName: ' dfnsp', quantidadeContratada: 10 }]);
    expect(m.get('dfnsp')).toBe(660);
  });
});

describe('leitura da view', () => {
  it('converte números e mantém nulos da fonte', () => {
    const c = mapQuantidadeDoContrato({
      item_key: 'i',
      contract_key: 'C45',
      quantidade_fonte: null,
      fonte: null,
      quantidade_ajustada: '200.0000',
      quantidade_contratada: '200.0000',
      ajustada: true,
      quantidade_dividida: '150',
      quantidade_sem_unidade: '50',
      situacao_divisao: 'PARCIAL',
      divisao_origem: 'USUARIO',
      unidades: [{ unidade: 'DFNSP', quantidade: '150', alocada: true }]
    });
    expect(c).toMatchObject({ quantidadeFonte: null, fonte: null, quantidadeContratada: 200, quantidadeSemUnidade: 50, situacao: 'PARCIAL', divisaoOrigem: 'USUARIO' });
    expect(c.unidades).toEqual([{ unidade: 'DFNSP', quantidade: 150, alocada: true }]);
  });
});
