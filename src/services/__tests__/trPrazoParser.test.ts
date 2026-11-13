import { describe, expect, it } from 'vitest';
import { lerPrazoDoTr, lerRecebimentoDoTr } from '../trPrazoParser';

// Trechos dos editais do PNCP lidos na carga de 13/11/2026 (texto do unpdf).
describe('prazo de entrega no TR', () => {
  it('claro: um prazo, a partir do recebimento da Ordem', () => {
    const r = lerPrazoDoTr('Edital. O prazo de entrega dos bens é de até 30 (trinta) dias, contados do recebimento da ordem de fornecimento, em remessa única. Outros itens.');
    expect(r).toMatchObject({ leitura: 'CLARO', dias: 30, inicio: 'OF_RECEBIMENTO', contagem: 'CORRIDOS', contagemDita: false });
    expect(r.trechos[0]).toMatch(/^O prazo de entrega dos bens é de até 30/);
  });
  it('controlados: conta da autorização do Exército, com o trecho dela', () => {
    const r = lerPrazoDoTr(
      'Prazo e Local de Entrega O prazo de entrega dos bens será de 90 (noventa) dias, contados da solicitação feita por meio da ordem de fornecimento, em remessa única. ' +
        'Ademais, no caso em que se tratar de material controlado pelo Exército Brasileiro, a contagem do prazo de 90 (noventa) dias para entrega terá contagem iniciada após a emissão da autorização do Exército Brasileiro.'
    );
    expect(r).toMatchObject({ leitura: 'CLARO', dias: 90, inicio: 'EXERCITO' });
    expect(r.trechos.some((t) => /autorização do Exército/u.test(t))).toBe(true);
  });
  it('dias úteis ditos no TR', () => {
    expect(lerPrazoDoTr('O prazo de entrega dos bens é de 60 (sessenta) dias úteis, contados do(a) ordem do fornecimento, em remessa única.')).toMatchObject({ dias: 60, contagem: 'UTEIS', contagemDita: true, inicio: 'OF_EMISSAO' });
  });
  it('a conferir: trechos que contam de pontos diferentes', () => {
    const r = lerPrazoDoTr(
      'O prazo de entrega dos bens é de até 60 (sessenta) dias, contados do recebimento da ordem de fornecimento, em remessa única. ' +
        'O prazo de entrega dos aparelhos será de 60 (sessenta) dias corridos, contados da assinatura do contrato, em remessa única.'
    );
    expect(r).toMatchObject({ leitura: 'CONFERIR', motivo: 'trechos contam de pontos diferentes', dias: 60 });
  });
  it('a conferir: dois prazos no mesmo trecho (por destino)', () => {
    const r = lerPrazoDoTr('A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 60 dias corridos para as capitais dos estados e de 75 dias corridos para as demais localidades, a contar do recebimento da Ordem de Fornecimento de Bens (OFB).');
    expect(r).toMatchObject({ leitura: 'CONFERIR', motivo: 'o mesmo trecho tem mais de um prazo (por destino ou por item)', dias: 60 });
  });
  it('a conferir: escalonado pela quantidade', () => {
    const r = lerPrazoDoTr('O prazo de entrega dos bens será de 180 dias para lotes de até 50 unidades, acrescidos de 30 dias a cada 20 unidades, contados da emissão da ordem de autorização, em remessa única. Parcela Faixa de quantidade contratada.');
    expect(r.leitura).toBe('CONFERIR');
  });
  it('sem cláusula e sem texto', () => {
    expect(lerPrazoDoTr('Início da execução do objeto: 05 dias da assinatura do contrato.')).toMatchObject({ leitura: 'SEM_CLAUSULA', dias: null });
    expect(lerPrazoDoTr('')).toMatchObject({ leitura: 'SEM_CLAUSULA', motivo: 'sem texto do edital no PNCP' });
  });
  it('ignora prazos que não são de entrega (amostra, recolhimento)', () => {
    expect(lerPrazoDoTr('As amostras entregues deverão ser recolhidas pelos fornecedores no prazo de 30 (trinta) dias.').leitura).toBe('SEM_CLAUSULA');
  });
});

describe('lerRecebimentoDoTr (TRP e TRD)', () => {
  const AGU_TRP = 'Os bens serão recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato.';
  const AGU_TRD = 'O recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material.';
  const SERVICO = 'Os serviços serão recebidos definitivamente no prazo de 30 (trinta) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço.';

  it('modelo da AGU: TRP no ato da entrega, TRD em 10 dias úteis da nota fiscal', () => {
    const r = lerRecebimentoDoTr(`${AGU_TRP} ${AGU_TRD}`);
    expect(r.recebimento).toEqual({ trpDias: 0, trpContagem: 'CORRIDOS', trdDias: 10, trdContagem: 'UTEIS', trdInicio: 'ENTREGA' });
    expect(r.trechos).toHaveLength(2);
    expect(r.trechos[0]).toMatch(/^Recebidos provisoriamente/);
    expect(r.clara).toBe(true);
  });

  it('o trecho de material vence o modelo de serviço que vem junto no TR', () => {
    expect(lerRecebimentoDoTr(`${SERVICO} ${AGU_TRP} ${AGU_TRD}`).recebimento?.trdDias).toBe(10);
  });

  it('só o modelo de serviço: conta do recebimento provisório, a conferir', () => {
    const r = lerRecebimentoDoTr(SERVICO);
    expect(r.recebimento).toMatchObject({ trdDias: 30, trdContagem: 'CORRIDOS', trdInicio: 'TRP' });
    expect(r.clara).toBe(false);
  });

  it('trechos de material com prazos diferentes: a conferir', () => {
    expect(lerRecebimentoDoTr(`${AGU_TRP} ${AGU_TRD} O recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal.`).clara).toBe(false);
  });

  it('texto do PDF embaralhado: "quinze (15) dias" e o número depois da vírgula', () => {
    expect(lerRecebimentoDoTr('O recebimento definitivo ocorrerá no prazo de quinze (15) dias úteis, a contar do cumprimento das etapas de entrega.').recebimento?.trdDias).toBe(15);
    expect(lerRecebimentoDoTr('O recebimento definitivo ocorrerá no prazo de , a contar do recebimento da nota fiscal ou15 (quinze) dias corridos instrumento de cobrança.').recebimento).toMatchObject({ trdDias: 15, trdContagem: 'CORRIDOS', trdInicio: 'ENTREGA' });
  });

  it('TRP em dias e sem a cláusula do definitivo', () => {
    expect(lerRecebimentoDoTr(`Os bens serão recebidos provisoriamente no prazo de 5 (cinco) dias úteis da entrega. ${AGU_TRD}`).recebimento).toMatchObject({ trpDias: 5, trpContagem: 'UTEIS' });
    expect(lerRecebimentoDoTr(AGU_TRP)).toEqual({ recebimento: null, trechos: [], clara: false });
    expect(lerRecebimentoDoTr('')).toEqual({ recebimento: null, trechos: [], clara: false });
  });
});
