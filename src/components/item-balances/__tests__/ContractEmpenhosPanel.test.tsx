import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractEmpenhosPanel } from '../ContractEmpenhosPanel';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';
import { montarEmpenhoDoItem } from '../../../utils/empenhoDoItem';

// Contrato 00002/2025 (real): item 43 (capacete, R$ 3.500), 13 (placa, R$ 4.900).
const nota = (o: any) =>
  mapDistribuicao({ contrato_empenho_id: o.ne, contract_key: 'K', empenho_id: o.ne, numero_oficial: o.ne, valor_nota: 0, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', uasg_emitente: '200331', ...o });
const execucao = montarEmpenhoDoItem({
  numeroItem: 43,
  contratos: [
    {
      contractKey: 'K',
      valorUnitario: 3500,
      distribuicoes: [
        nota({ ne: '2024NE000337', data_emissao: '2024-12-27', valor_nota: 1197000, situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 1197000 }], distribuido_por_nome: 'Maria', distribuido_em: '2026-10-07T14:00:00Z' }),
        nota({ ne: '2024NE000301', valor_nota: 127400, situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 13, valor: 127400 }] }),
        nota({ ne: '2024NE000330', valor_nota: 147000, sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 13, quantidade: 30 }, { numero_item: 43, quantidade: 42 }] }),
        nota({ ne: '2024NE000328', valor_nota: 14700, sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] })
      ]
    }
  ]
}).porContrato.get('K');

const base: React.ComponentProps<typeof ContractEmpenhosPanel> = {
  numeroItem: 43,
  contratado: 342,
  execucao,
  loading: false,
  canLinkEmpenhos: true,
  allocationOptions: [{ id: 'a1', unitName: 'DFNSP', saldoQty: 0 }],
  linkedAllocationId: () => '',
  onLinkAllocation: vi.fn(),
  onVincularAosItens: vi.fn(),
  busy: false
};
const html = (over: Partial<typeof base> = {}) => renderToStaticMarkup(<ContractEmpenhosPanel {...base} {...over} />);

describe('ContractEmpenhosPanel (notas do contrato para este item)', () => {
  it('mostra só as notas vinculadas a este item, com quantidade e quem vinculou (sem a parcela em R$)', () => {
    const out = html();
    expect(out).toContain('Notas vinculadas a este item');
    expect(out).toContain('2024NE000337');
    expect(out).not.toContain('Parcela deste item');
    expect(out).not.toContain('R$');
    expect(out).toContain('342 un');
    expect(out).toContain('por Maria em 07/10/2026');
    // Nota de placas (item 13) não aparece como deste item.
    expect(out).not.toContain('2024NE000301');
  });

  it('resume contratado, empenhado e a empenhar do contrato', () => {
    const out = html();
    expect(out).toContain('Contratado: <strong>342</strong>');
    expect(out).toContain('Empenhado: <strong>342</strong>');
    expect(out).toContain('A empenhar: <strong>0</strong>');
  });

  it('lista as notas a vincular, destacando "deste item" na sugestão e marcando as de outro item', () => {
    const out = html();
    expect(out).toContain('Notas do contrato ainda a vincular aos itens');
    expect(out).toContain('42 un deste item');
    expect(out).toContain('2024NE000328');
    expect(out).toContain('outro item');
    expect(out).toContain('Vincular aos itens');
  });

  it('sem confirmação de quantidade por item: nada de Aceitar, Confirmar ou Desfazer', () => {
    const out = html();
    expect(out).not.toContain('Aceitar');
    expect(out).not.toContain('Confirmar');
    expect(out).not.toContain('Desfazer');
    expect(out).not.toContain('Pendente');
  });

  it('quem não vincula não vê o botão Vincular aos itens', () => {
    expect(html({ onVincularAosItens: undefined })).not.toContain('Vincular aos itens');
  });

  it('a nota vinculada tem o seletor de unidade interna; sem unidades alocadas, avisa', () => {
    expect(html()).toContain('Unidade interna da nota 2024NE000337');
    expect(html({ allocationOptions: [] })).toContain('Sem unidades alocadas');
  });

  it('unidade onde a nota não cabe fica desabilitada; a unidade atual da nota continua escolhível', () => {
    // Nota 2024NE000337: 342 un deste item.
    const opcoes = [
      { id: 'a1', unitName: 'DFNSP', saldoQty: 100 },
      { id: 'a2', unitName: 'DIOPI', saldoQty: 400 },
      { id: 'a3', unitName: 'CGLIC', saldoQty: 0 }
    ];
    const out = html({ allocationOptions: opcoes, linkedAllocationId: () => 'a3' });
    expect(out).toContain('<option value="a1" disabled="">DFNSP (saldo 100 un · não cabe)</option>');
    expect(out).toContain('<option value="a2">DIOPI (saldo 400 un)</option>');
    // Já ligada à CGLIC: o saldo 0 já desconta esta nota.
    expect(out).toContain('<option value="a3" selected="">CGLIC (saldo 0 un)</option>');
  });

  it('nota sem quantidade neste item: a unidade fica travada até a quantidade ser definida', () => {
    const semPreco = montarEmpenhoDoItem({
      numeroItem: 43,
      contratos: [{ contractKey: 'K', valorUnitario: null, distribuicoes: [nota({ ne: '2024NE000337', valor_nota: 1000, situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 43, valor: 1000 }] })] }]
    }).porContrato.get('K');
    const out = html({ execucao: semPreco });
    expect(out).toContain('Defina a quantidade primeiro');
    expect(out).not.toContain('DFNSP');
  });

  it('quem edita vê o campo da quantidade; marcador Informada só quando a quantidade foi digitada', () => {
    const out = html({ onInformarQuantidade: vi.fn() });
    expect(out).toMatch(/data-testid="quantidade-nota-2024NE000337"[^>]*value="342"/);
    expect(out).not.toContain('quantidade-nota-2024NE000337-informada');
    const informada = montarEmpenhoDoItem({
      numeroItem: 43,
      contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: [nota({ ne: 'N9', valor_nota: 7000, situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 43, valor: 7000, quantidade_informada: 3 }] })] }]
    }).porContrato.get('K');
    const comInformada = html({ execucao: informada, onInformarQuantidade: vi.fn() });
    expect(comInformada).toMatch(/data-testid="quantidade-nota-N9"[^>]*value="3"/);
    expect(comInformada).toContain('quantidade-nota-N9-informada');
    // Sem a função (leitor), só o número.
    expect(html({ execucao: informada })).not.toContain('quantidade-nota-N9"');
    expect(html({ execucao: informada })).toContain('Informada');
  });

  it('quantidade calculada quebrada pede a quantidade certa', () => {
    const quebrada = montarEmpenhoDoItem({
      numeroItem: 1,
      contratos: [{ contractKey: 'L', valorUnitario: 2458.16, distribuicoes: [nota({ ne: 'L1', contract_key: 'L', valor_nota: 11750, situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 1, valor: 11750 }] })] }]
    }).porContrato.get('L');
    const out = html({ numeroItem: 1, contratado: 12, execucao: quebrada, onInformarQuantidade: vi.fn() });
    expect(out).toContain('value="4,78"');
    expect(out).toContain('A quantidade calculada não é inteira');
  });

  it('valor da nota mudou: aviso com o valor antigo e o novo; quem edita confere', () => {
    const mudou = montarEmpenhoDoItem({
      numeroItem: 43,
      contratos: [
        {
          contractKey: 'K',
          valorUnitario: 3500,
          distribuicoes: [nota({ ne: 'M1', valor_nota: 14000, valor_na_distribuicao: 7000, motivo_revisao: 'VALOR_MUDOU', situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 43, valor: 14000, quantidade_informada: 2 }] })]
        }
      ]
    }).porContrato.get('K');
    const out = html({ execucao: mudou, onConferirQuantidades: vi.fn() });
    expect(out).toContain('contract-empenhos-valor-mudou');
    expect(out).toMatch(/mudou de R\$\s7\.000,00 para R\$\s14\.000,00/);
    expect(out).toContain('Quantidade conferida');
    expect(html({ execucao: mudou })).not.toContain('Quantidade conferida');
  });

  it('soma das notas acima do contratado: aviso amarelo', () => {
    expect(html({ contratado: 300 })).toContain('contract-empenhos-acima-do-contratado');
    expect(html()).not.toContain('contract-empenhos-acima-do-contratado');
  });

  it('a lista de notas a vincular não mostra o valor da nota', () => {
    expect(html()).not.toContain('Valor da nota');
  });

  it('quem não é gestor nem coordenador vê a unidade, mas não muda', () => {
    expect(html({ canLinkEmpenhos: false })).toContain('Só o gestor e o coordenador escolhem a unidade interna da nota.');
  });

  it('contrato sem itens na fonte: avisa que as notas não têm divisão por item', () => {
    const semItens = montarEmpenhoDoItem({
      numeroItem: 43,
      contratos: [{ contractKey: 'S', valorUnitario: 3500, distribuicoes: [nota({ ne: 'X', contract_key: 'S', valor_nota: 7500, situacao: 'SEM_ITENS' })] }]
    }).porContrato.get('S');
    const out = html({ execucao: semItens });
    expect(out).toContain('contract-empenhos-sem-itens');
    expect(out).toContain('sem divisão por item');
    expect(out).toContain('Nenhuma nota deste contrato foi vinculada a este item ainda.');
  });
});
