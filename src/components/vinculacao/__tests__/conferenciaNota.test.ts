import { describe, it, expect } from 'vitest';
import { mapConferencia } from '../../../services/conferenciaNotaService';
import { textoDaConferenciaDaNota as textoOriginal } from '../conferenciaNota';

// O formatador de moeda separa "R$" do número com espaço que não quebra (U+00A0): normaliza para comparar.
const sp = (v: string) => v.replace(/\u00a0/g, ' ');
const textoDaConferenciaDaNota = (...args: Parameters<typeof textoOriginal>) => {
  const t = textoOriginal(...args);
  return { ...t, frase: sp(t.frase), fazer: t.fazer.map((f) => ({ se: sp(f.se), faca: sp(f.faca) })), dados: t.dados.map(sp) };
};

const conf = (over: any) =>
  mapConferencia({
    contrato_empenho_id: 'c', contract_key: 'K', numero_oficial: '2024NE000335', uasg_emitente: '200330', valor_nota: 36234,
    itens_nota: [], itens_fora: [], outro_preco: [], parcelas: [], itens_contrato: [], situacao: 'A_CONFERIR', ...over
  });
const item = (numero_item: number, quantidade: number, valor_unitario: number, no_contrato = true) => ({ numero_item, quantidade, valor_unitario, valor_total: quantidade * valor_unitario, no_contrato });

describe('textos da conferência da nota (casos reais de 14/10/2026)', () => {
  it('item fora do contrato: os outros contam; incluir o item ou a nota em outro contrato', () => {
    const t = textoDaConferenciaDaNota(
      conf({
        tipo: 'ITEM_FORA_DO_CONTRATO',
        itens_nota: [item(29, 3, 1922, false), item(30, 6, 2040), item(31, 4, 2060), item(32, 4, 2497)],
        itens_fora: [29],
        total_siafi: 36234,
        itens_contrato: [25, 26, 27, 28, 30, 31, 32].map((n) => ({ numero_item: n }))
      }),
      { numero: '00068/2025', fornecedorNome: 'COPLATEX INDUSTRIA E COMERCIO DE TECIDOS S.A' }
    );
    expect(t.frase).toBe('A nota tem 4 itens. Os itens 30, 31 e 32 estão no contrato 00068/2025 e já contam no empenhado. O item 29, com 3 un a R$ 1.922,00, não está no contrato.');
    expect(t.tituloFazer).toBe('O que fazer no Contratos.gov.br');
    expect(t.fazer).toEqual([
      { se: 'Se o item 29 faz parte deste contrato:', faca: 'inclua o item no 00068/2025.' },
      { se: 'Se o item 29 é de outro contrato da COPLATEX:', faca: 'inclua a nota também naquele contrato.' }
    ]);
    expect(t.dados[1]).toBe('Contrato 00068/2025: itens 25, 26, 27, 28, 30, 31 e 32.');
  });

  it('item com o preço de outro: corrigir o contrato ou avisar quem emitiu a nota', () => {
    const t = textoDaConferenciaDaNota(
      conf({
        numero_oficial: '2026NE000218',
        tipo: 'ITEM_COM_OUTRO_PRECO',
        valor_nota: 2796.44,
        itens_nota: [item(1, 4, 699.11)],
        outro_preco: [{ numero_item: 1, preco_nota: 699.11, preco_contrato: 679, item_com_esse_preco: 2 }],
        itens_contrato: [{ numero_item: 1, quantidade: 98, valor_unitario: 679 }, { numero_item: 2, quantidade: 28, valor_unitario: 699.11 }]
      }),
      { numero: '00043/2026' }
    );
    expect(t.frase).toBe('A nota diz item 1, com 4 un a R$ 699,11. No contrato 00043/2026, o item 1 custa R$ 679,00 e o item 2 é que custa R$ 699,11.');
    expect(t.tituloFazer).toBe('O que fazer');
    expect(t.fazer[1].faca).toContain('Avise quem emitiu a nota');
    expect(t.dados[1]).toBe('Contrato 00043/2026: item 1, 98 un a R$ 679,00 · item 2, 28 un a R$ 699,11.');
  });

  it('contrato sem itens: cadastrar os itens; sem leitura, diz que a nota não foi lida', () => {
    const lida = textoDaConferenciaDaNota(
      conf({ tipo: 'CONTRATO_SEM_ITENS', numero_oficial: '2023NE000432', itens_nota: [item(6, 40, 115435.99), item(7, 66, 115435.99), item(8, 55, 115435.99), item(10, 18, 115435.99)], nota_lida_em: '2026-10-14' }),
      { numero: '00117/2023' }
    );
    expect(lida.frase).toBe('O contrato 00117/2023 não tem itens no Contratos.gov.br. A nota diz 179 un em 4 itens da compra.');
    expect(lida.fazer).toEqual([{ se: 'No contrato 00117/2023:', faca: 'cadastre os itens. A linha sai daqui quando a sincronização trouxer os itens.' }]);
    expect(lida.dados).toContain('Sem os itens, a nota fica no contrato inteiro e não conta no empenhado de nenhum item.');
    expect(textoDaConferenciaDaNota(conf({ tipo: 'CONTRATO_SEM_ITENS' }), { numero: '00117/2023' }).frase).toContain('A nota ainda não foi lida no SIAFI.');
  });

  it('vínculo do gestor diferente da nota; valor em dobro nos dados', () => {
    const t = textoDaConferenciaDaNota(
      conf({ tipo: 'VINCULO_DIFERENTE_DA_NOTA', parcelas: [{ numero_item: 1 }, { numero_item: 2 }], itens_nota: [item(2, 1, 700)], valor_em_dobro: true, valor_nota: 1400, total_siafi: 700 }),
      { numero: '00001/2026' }
    );
    expect(t.frase).toBe('A nota foi vinculada aos itens 1 e 2 antes de ser lida no SIAFI. A nota diz item 2.');
    expect(t.dados).toContain('O Contratos.gov.br informa R$ 1.400,00 para esta nota, e o SIAFI informa R$ 700,00.');
  });
});
