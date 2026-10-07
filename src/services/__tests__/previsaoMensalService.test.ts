import { describe, it, expect } from 'vitest';
import {
  compararPrevistoPago,
  ehEmendaPeloPlanoInterno,
  mesDaProximaPrevisao,
  montarPrevisao,
  prazoDaPrevisao,
  textoParaSei,
  ultimoDiaUtil,
  type DadosDaPrevisao
} from '../previsaoMensalService';
import type { FaturaCarteira, EmpenhoCarteiraRow } from '../financeiroCarteiraService';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';

const fatura = (o: Partial<FaturaCarteira>): FaturaCarteira => ({
  idFatura: 1, contractKey: 'A', numero: '231', tipo: 'Nota Fiscal', emissao: '2026-10-01', vencimento: null, valorLiquido: 100,
  dataLiquidacao: null, situacao: 'Pendente', cancelada: false, np: null, referencia: '09/2026', ordensBancarias: null,
  obEmissao: null, paga: false, npContratos: 0, empenhos: '2026NE000412', ...o
});
const empenho = (o: Partial<EmpenhoCarteiraRow>): EmpenhoCarteiraRow => ({
  empenhoId: 'e1', canonicalKey: '200331-2026-2026NE412', numero: '2026NE000412', ano: 2026, uasgEmitente: '200331', dataEmissao: '2026-01-01',
  credorNome: null, credorDocumento: null, valorEmpenhado: 1000, valorPago: 0, saldo: 1000, contractKeys: ['A'], planoInterno: null, naturezaDespesa: null, ...o
});
const dados = (o: Partial<DadosDaPrevisao>): DadosDaPrevisao => ({
  mesAlvo: '2026-11', faturas: [], ciclos: [], ligacoes: [], empenhos: [empenho({})], marcas: new Map(), entregas: [], historicos: new Map(),
  ajustes: [], contratosVigentes: new Set(['A', 'B']), ...o
});
const marca = (contractKey: string, valorMensal: number | null = null) =>
  [contractKey, { contractKey, tipo: 'MENSAL' as const, valorMensal, observacao: null, atualizadoPorNome: null, atualizadoEm: '' }] as const;

describe('datas da previsão (Portaria 50, art. 5º, § 2º, III)', () => {
  it('prazo = último dia útil do mês anterior ao da previsão', () => {
    expect(ultimoDiaUtil('2026-10')).toBe('2026-10-30'); // 31/10/2026 é sábado
    expect(prazoDaPrevisao('2026-11')).toBe('2026-10-30');
  });
  it('próxima previsão: o mês seguinte; depois do último dia útil, o seguinte a ele', () => {
    expect(mesDaProximaPrevisao(new Date(2026, 9, 7))).toBe('2026-11');
    expect(mesDaProximaPrevisao(new Date(2026, 9, 30))).toBe('2026-11');
    expect(mesDaProximaPrevisao(new Date(2026, 9, 31))).toBe('2026-12');
  });
});

describe('emenda pelo plano interno', () => {
  it('reconhece o número da emenda e as palavras emenda/bancada', () => {
    expect(ehEmendaPeloPlanoInterno('SP999S97124 - 202471240007 - BANCADA DE RORAIMA')).toBe(true);
    expect(ehEmendaPeloPlanoInterno('SP999S93711 - SORAYA SANTOS - EMENDA 202537650011')).toBe(true);
    expect(ehEmendaPeloPlanoInterno('SP999S94416 - ROGERIA SANTOS/202544700016')).toBe(true);
    expect(ehEmendaPeloPlanoInterno('SP99OBQ3SIH - SINESP - TECNOLGIA DA INFORMACAO')).toBe(false);
    expect(ehEmendaPeloPlanoInterno(null)).toBe(false);
  });
});

describe('montagem das linhas', () => {
  it('fatura em aberto entra; paga, cancelada ou em ciclo aberto não', () => {
    const ciclo = { id: 'c1', cycleKey: 'C1', contractKey: 'A', status: 'ENVIADO_CGOFI', input: { valorAtesto: 50, documentoAtestoSei: '7' }, itens: [] } as unknown as PaymentFollowUpCycle;
    const linhas = montarPrevisao(
      dados({
        faturas: [fatura({ idFatura: 1 }), fatura({ idFatura: 2, paga: true }), fatura({ idFatura: 3, cancelada: true }), fatura({ idFatura: 4 })],
        ciclos: [ciclo],
        ligacoes: [{ cycle_id: 'c1', id_fatura: 4 }]
      })
    );
    expect(linhas.map((l) => l.chave).sort()).toEqual(['ciclo-C1-0', 'fatura-1']);
    expect(linhas.find((l) => l.chave === 'fatura-1')).toMatchObject({ ug: '200331', empenho: '2026NE000412', valor: 100, origem: 'FATURA' });
  });

  it('ciclo entra uma vez por nota do item "DO PAGAMENTO", com o subitem', () => {
    const ciclo = {
      id: 'c1', cycleKey: 'C1', contractKey: 'A', status: 'RECEBIDO', input: { valorAtesto: 300, documentoAtestoSei: '7' },
      itens: [
        { id: 'i1', notaFiscal: '10', atestoSei: '7', empenhoCanonicalKey: '200331-2026-2026NE412', subelemento: '39', valorBruto: 100, jurosMulta: 0, glosa: 0, desconto: 0, valorAPagar: 100 },
        { id: 'i2', notaFiscal: '11', atestoSei: '7', empenhoCanonicalKey: '200330-2025-2025NE5', subelemento: '52', valorBruto: 200, jurosMulta: 0, glosa: 0, desconto: 0, valorAPagar: 200 }
      ]
    } as unknown as PaymentFollowUpCycle;
    const linhas = montarPrevisao(dados({ ciclos: [ciclo] }));
    expect(linhas.map((l) => [l.ug, l.empenho, l.subitem, l.valor])).toEqual([
      ['200331', '2026NE000412', '39', 100],
      ['200330', '2025NE5', '52', 200]
    ]);
  });

  it('contrato mensal entra só sem fatura/ciclo, pelo valor informado ou pela média', () => {
    const historicos = new Map([['B', { porMes: [], mesesComPagamento: 3, media: 500, menor: 400, maior: 600 }]]);
    const linhas = montarPrevisao(
      dados({ marcas: new Map([marca('A'), marca('B'), marca('C', 900)]), historicos, faturas: [fatura({ contractKey: 'A' })], contratosVigentes: new Set(['A', 'B', 'C']) })
    );
    expect(linhas.find((l) => l.chave === 'mensal-A')).toBeUndefined();
    expect(linhas.find((l) => l.chave === 'mensal-B')).toMatchObject({ valor: 500, origem: 'MENSAL' });
    expect(linhas.find((l) => l.chave === 'mensal-C')).toMatchObject({ valor: 900, detalhe: 'valor mensal informado' });
  });

  it('mensal sem histórico e sem valor fica marcado para informar o valor', () => {
    const [l] = montarPrevisao(dados({ marcas: new Map([marca('B')]) }));
    expect(l).toMatchObject({ chave: 'mensal-B', valor: 0, semValor: true });
  });

  it('entrega entra no mês dela; os ajustes retiram, corrigem e marcam emenda', () => {
    const entregas = [
      { id: 'x', contractKey: 'A', dataPrevista: '2026-11-20', valor: 2000, empenhoCanonicalKey: '200331-2026-2026NE412', descricao: 'viaturas', situacao: 'PREVISTA' as const, motivoCancelamento: null, criadoPorNome: null },
      { id: 'y', contractKey: 'A', dataPrevista: '2026-12-20', valor: 9, empenhoCanonicalKey: null, descricao: 'outra', situacao: 'PREVISTA' as const, motivoCancelamento: null, criadoPorNome: null }
    ];
    const ajustes = [
      { chave: 'fatura-1', retirada: true, valor: null, subitem: null, emenda: null, contractKey: null, empenhoKey: null, descricao: null, ajustadoPorNome: null },
      { chave: 'entrega-x', retirada: false, valor: 1500, subitem: '52', emenda: true, contractKey: null, empenhoKey: null, descricao: null, ajustadoPorNome: null },
      { chave: 'manual-1', retirada: false, valor: 300, subitem: null, emenda: null, contractKey: 'B', empenhoKey: null, descricao: 'reparo', ajustadoPorNome: null }
    ];
    const linhas = montarPrevisao(dados({ faturas: [fatura({})], entregas, ajustes }));
    expect(linhas.find((l) => l.chave === 'fatura-1')!.retirada).toBe(true);
    expect(linhas.find((l) => l.chave === 'entrega-x')).toMatchObject({ valor: 1500, valorOriginal: 2000, subitem: '52', emenda: true, ajustada: true });
    expect(linhas.find((l) => l.chave === 'entrega-y')).toBeUndefined();
    expect(linhas.find((l) => l.chave === 'manual-1')).toMatchObject({ origem: 'MANUAL', valor: 300, contractKey: 'B' });
  });

  it('avisa quando o empenho não cobre as linhas mantidas', () => {
    const linhas = montarPrevisao(dados({ empenhos: [empenho({ saldo: 150 })], faturas: [fatura({ idFatura: 1 }), fatura({ idFatura: 2 })] }));
    expect(linhas.every((l) => l.semSaldo)).toBe(true);
  });

  it('emenda automática pelo plano interno do empenho', () => {
    const [l] = montarPrevisao(dados({ empenhos: [empenho({ planoInterno: 'SP999S97124 - 202471240007 - BANCADA DE RORAIMA' })], faturas: [fatura({})] }));
    expect(l).toMatchObject({ emenda: true, emendaAutomatica: true });
  });
});

describe('tabela para o SEI', () => {
  it('colunas da Portaria e total', () => {
    const linhas = montarPrevisao(dados({ faturas: [fatura({ valorLiquido: 1234.5 })] }));
    const texto = textoParaSei(linhas, () => ({ numero: '00094/2022', fornecedorNome: 'MIRANDA', fornecedorCnpj: '24.929.614/0001-10' }));
    const l = texto.split('\n');
    expect(l[0]).toBe(['Contrato', 'Contratada', 'CNPJ', 'UG do empenho', 'Nota de empenho', 'Subitem', 'Valor'].join('\t'));
    expect(l[1]).toBe(['00094/2022', 'MIRANDA', '24.929.614/0001-10', '200331', '2026NE000412', '', '1.234,50'].join('\t'));
    expect(l[2]).toBe(['TOTAL', '', '', '', '', '', '1.234,50'].join('\t'));
  });
});

describe('previsto × pago', () => {
  it('soma o previsto do envio e as faturas com OB no mês, por contrato, incluindo os pagos fora da previsão', () => {
    const linhas = [
      { contract_key: 'A', valor: 100 },
      { contract_key: 'A', valor: 50 },
      { contract_key: 'B', valor: 300 }
    ];
    const faturas = [
      fatura({ idFatura: 1, contractKey: 'A', paga: true, obEmissao: '2026-11-10', valorLiquido: 150 }),
      fatura({ idFatura: 2, contractKey: 'C', paga: true, obEmissao: '2026-11-12', valorLiquido: 80 }),
      fatura({ idFatura: 3, contractKey: 'B', paga: true, obEmissao: '2026-12-01', valorLiquido: 300 }),
      fatura({ idFatura: 4, contractKey: 'A', paga: true, obEmissao: '2026-11-20', valorLiquido: 10, cancelada: true })
    ];
    const r = compararPrevistoPago(linhas, faturas, '2026-11');
    expect(r.find((l) => l.contractKey === 'A')).toMatchObject({ previsto: 150, pago: 150, faturasPagas: 1 });
    expect(r.find((l) => l.contractKey === 'B')).toMatchObject({ previsto: 300, pago: 0 });
    expect(r.find((l) => l.contractKey === 'C')).toMatchObject({ previsto: 0, pago: 80 });
    expect(r[0].contractKey).toBe('B'); // maior diferença primeiro
  });
});
