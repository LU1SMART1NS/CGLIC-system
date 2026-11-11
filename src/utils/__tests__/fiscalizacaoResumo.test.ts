import { describe, it, expect } from 'vitest';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaEntrega } from '../../services/fiscalizacaoService';
import { agrupar, chaveDoBeneficiario, enderecoDeEntrega, mudancasDoPrograma, passaPrazo, resumir } from '../fiscalizacaoResumo';
import { ataEItemDaChave, passoDoItem, passosDoItem } from '../fiscalizacaoEntregas';
import { comQuemEstaOItem, linhasDoContrato } from '../fiscalizacaoMesa';


const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00055-2026', contrato_numero: '00055/2026', quantidade: 10, origem: 'EMENDA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' });
let n = 0;
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, id: `e${++n}`, ...p });
// Datas longe de hoje para o teste não depender do dia em que roda.
const PASSADO = '2020-01-10';
const FUTURO = '2099-01-10';

describe('resumo de um conjunto de itens', () => {
  it('conta unidades entregues, em andamento, sem início, da área e vencidas', () => {
    const r = resumir([
      e({ quantidade: 5, etapa: 'TRP', entregueEm: '2026-01-01' }),
      e({ quantidade: 3, etapa: 'PRODUCAO', prevista: PASSADO }),
      e({ quantidade: 2, etapa: 'INFO_PEDIDA' }),
      e({ quantidade: 4, responsavel: 'AREA' })
    ]);
    expect(r).toMatchObject({ unidades: 14, acompanhadas: 10, entregues: 5, andamento: 3, semInicio: 2, area: 4, vencidas: 1 });
  });

  it('a fase do conjunto é a do item mais atrasado; sem nada aberto, Finalizado', () => {
    expect(resumir([e({ etapa: 'PAGAMENTO' }), e({ etapa: 'CONTROLADO' })]).fase).toBe('EXECUCAO');
    expect(resumir([e({ etapa: 'FINALIZADO' })]).fase).toBe('FINALIZADO');
    expect(resumir([e({ responsavel: 'AREA' })]).fase).toBeNull();
  });

  it('filtro de prazo: com vencido, vencendo e em dia', () => {
    const vencido = resumir([e({ prevista: PASSADO })]);
    const emDia = resumir([e({ prevista: FUTURO })]);
    expect(passaPrazo(vencido, 'danger')).toBe(true);
    expect(passaPrazo(emDia, 'danger')).toBe(false);
    expect(passaPrazo(emDia, 'neutral')).toBe(true);
    expect(passaPrazo(emDia, '')).toBe(true);
  });

  it('beneficiário pelo cadastro; da planilha, pelo nome escrito', () => {
    expect(chaveDoBeneficiario(e({ beneficiarioId: 'b1' }))).toBe('b1');
    expect(chaveDoBeneficiario(e({ beneficiarioId: null, beneficiarioTexto: 'PM/RN' }))).toBe('planilha:PM/RN');
    expect(agrupar([e({ uf: 'SP' }), e({ uf: 'RJ' }), e({ uf: 'SP' })], (x) => x.uf).get('SP')).toHaveLength(2);
  });
});

describe('com quem está o item', () => {
  it('fiscal, outros ou acabou, pela mesma regra da mesa do contrato', () => {
    expect(comQuemEstaOItem(e({ etapa: 'INFO_ENVIADA' }))).toBe('VOCE');
    expect(comQuemEstaOItem(e({ etapa: 'INFO_PEDIDA' }))).toBe('OUTROS');
    expect(comQuemEstaOItem(e({ etapa: 'CONTROLADO' }))).toBe('OUTROS');
    expect(comQuemEstaOItem(e({ etapa: 'PRODUCAO', prevista: FUTURO }))).toBe('OUTROS');
    expect(comQuemEstaOItem(e({ etapa: 'PRODUCAO', prevista: PASSADO }))).toBe('VOCE');
    expect(comQuemEstaOItem(e({ etapa: 'PRODUCAO', prevista: null }))).toBe('VOCE');
    expect(comQuemEstaOItem(e({ etapa: 'PAGAMENTO', pagoEm: null }))).toBe('OUTROS');
    expect(comQuemEstaOItem(e({ etapa: 'PAGAMENTO', pagoEm: '2026-05-01' }))).toBe('VOCE');
    expect(comQuemEstaOItem(e({ etapa: 'SAL' }))).toBe('FIM');
    expect(comQuemEstaOItem(e({ responsavel: 'AREA' }))).toBe('OUTROS');
  });
});

describe('próximo passo do contrato (mesa)', () => {
  const nada = () => undefined;
  it('junta os itens que estão no mesmo ponto e põe o processo primeiro', () => {
    const { comVoce, comOutros } = linhasDoContrato(
      [e({ etapa: 'PRODUCAO', prevista: PASSADO }), e({ etapa: 'PRODUCAO', prevista: PASSADO }), e({ etapa: 'ENTREGUE' }), e({ etapa: 'CONTROLADO' }), e({ etapa: 'INFO_PEDIDA' })],
      true,
      nada,
      nada
    );
    expect(comVoce.map((l) => l.chave)).toEqual(['processo', 'cobrar', 'provisorio']);
    expect(comVoce[1].titulo).toBe('Cobrar o fornecedor · 2 itens atrasados');
    expect(comVoce[1].limite).toBe(PASSADO);
    expect(comOutros.map((l) => l.quem)).toEqual(['CAEP', 'Exército (DFPC)']);
  });
  it('item pago de emenda pede o Ofício à SAL; sem emenda, finalizar', () => {
    expect(linhasDoContrato([e({ etapa: 'PAGAMENTO', pagoEm: '2026-05-01', origem: 'EMENDA' })], false, nada, nada).comVoce[0].chave).toBe('sal');
    expect(linhasDoContrato([e({ etapa: 'PAGAMENTO', pagoEm: '2026-05-01', origem: 'CARGA', emenda: null })], false, nada, nada).comVoce[0].chave).toBe('finalizar');
  });
});

describe('régua e chave do item da ata', () => {
  it('Ofício à SAL só em item de emenda', () => {
    expect(passosDoItem(e({ origem: 'EMENDA' }))).toContain('Ofício à SAL');
    expect(passosDoItem(e({ origem: 'CARGA', emenda: null }))).not.toContain('Ofício à SAL');
    expect(passoDoItem(e({ etapa: 'CONTROLADO' }))).toMatchObject({ passo: 2, parado: 'Aguardando o Exército', fim: false });
    expect(passoDoItem(e({ etapa: 'PAGAMENTO', pagoEm: '2026-05-01', origem: 'CARGA', emenda: null })).fim).toBe(true);
  });
  it('lê ata, UASG e número do item da chave', () => {
    expect(ataEItemDaChave('00031/2025-200331-00002')).toEqual({ ata: '00031/2025', uasg: '200331', item: '00002' });
    expect(ataEItemDaChave(null)).toBeNull();
  });
});

describe('programas (migration 265)', () => {
  it('marcas da janela viram incluir e retirar, sem repetir o que não mudou', () => {
    expect(mudancasDoPrograma(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ incluir: ['c'], retirar: ['a'] });
    expect(mudancasDoPrograma(new Set(['a']), new Set(['a']))).toEqual({ incluir: [], retirar: [] });
  });
  it('endereço de entrega: rua com número e complemento; bairro, cidade e CEP embaixo', () => {
    expect(enderecoDeEntrega(e({ entregaLogradouro: 'Rua A', entregaNumero: '10', entregaComplemento: 'Bloco B', entregaBairro: 'Centro', entregaCep: '70000000', municipio: 'Brasília', uf: 'DF' }))).toEqual({ rua: 'Rua A, 10, Bloco B', detalhe: 'Centro · Brasília/DF · CEP 70000-000' });
    expect(enderecoDeEntrega(e({ entregaLogradouro: null, municipio: 'Natal', uf: 'RN' }))).toEqual({ rua: null, detalhe: 'Natal/RN' });
  });
});
