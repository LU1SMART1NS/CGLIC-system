import { describe, expect, it } from 'vitest';
import { lerPrazoDoTr } from '../trPrazoParser';

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
