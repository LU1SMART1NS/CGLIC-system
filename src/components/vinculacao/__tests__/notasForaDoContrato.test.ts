import { describe, expect, it } from 'vitest';
import { contratoIndicado, contratosSugeridos, motivosDoContrato, naCarteira, notaNoSegmento, semNotasCitadasEmFatura, situacaoDaNota } from '../notasForaDoContrato';
import { linhaNotaForaDoContrato, type ContratoDoFornecedor } from '../../../services/notasForaDoContratoService';

const c = (k: string, extra: Partial<ContratoDoFornecedor> = {}): ContratoDoFornecedor => ({
  contractKey: `200331-${k}-2026`,
  numero: `${k}/2026`,
  assinatura: '2026-10-16',
  vigenciaFim: null,
  temItemDoPedido: true,
  semNotasDaFonte: true,
  ...extra
});
const base = { marca: null, contratoPeloPedido: null, contratosDoFornecedor: [c('00299'), c('00328'), c('00212'), c('00100')] };
const agora = new Date('2026-11-10T12:00:00Z');

describe('notas fora do contrato', () => {
  it('indica a marca, depois o contrato do pedido, depois a 1ª sugestão', () => {
    expect(contratoIndicado(base)).toBe('200331-00299-2026');
    expect(contratoIndicado({ ...base, contratoPeloPedido: '200331-00212-2026' })).toBe('200331-00212-2026');
    expect(contratoIndicado({ ...base, marca: { contractKey: '200331-00100-2026', observacao: null, porNome: 'Ana', em: '2026-11-09' } })).toBe('200331-00100-2026');
    expect(contratoIndicado({ ...base, contratosDoFornecedor: [] })).toBeNull();
  });

  it('põe o contrato do pedido primeiro entre as 3 sugestões', () => {
    expect(contratosSugeridos({ ...base, contratoPeloPedido: '200331-00212-2026' }).map((x) => x.numero)).toEqual(['00212/2026', '00299/2026', '00328/2026']);
    expect(contratosSugeridos(base)).toHaveLength(3);
  });

  it('marca segura a nota por 7 dias; depois volta a "A incluir"', () => {
    const marcada = (em: string) => ({ marca: { contractKey: 'x', observacao: null, porNome: null, em } });
    expect(situacaoDaNota({ marca: null }, agora)).toBe('A_INCLUIR');
    expect(situacaoDaNota(marcada('2026-11-05T12:00:00Z'), agora)).toBe('INCLUINDO');
    expect(situacaoDaNota(marcada('2026-11-02T12:00:00Z'), agora)).toBe('INCLUSAO_NAO_CHEGOU');
    expect(notaNoSegmento(marcada('2026-11-02T12:00:00Z'), 'A_INCLUIR', agora)).toBe(true);
    expect(notaNoSegmento(marcada('2026-11-05T12:00:00Z'), 'A_INCLUIR', agora)).toBe(false);
    expect(notaNoSegmento(marcada('2026-11-05T12:00:00Z'), 'INCLUINDO', agora)).toBe(true);
  });

  it('explica os motivos do contrato sugerido', () => {
    const m = motivosDoContrato({ pedidos: [{ numero: 620, emenda: '42680018' }], dataEmissao: '2026-09-18' }, c('00299', { semNotasDaFonte: false }));
    expect(m).toEqual([
      { aFavor: true, texto: 'Item do pedido 620' },
      { aFavor: true, texto: 'Assinado 28 dias depois da nota' },
      { aFavor: false, texto: 'Já tem notas da fonte' }
    ]);
    expect(motivosDoContrato({ pedidos: [], dataEmissao: '2026-11-01' }, c('00299'))[0]).toEqual({ aFavor: false, texto: 'Nota sem pedido de emenda' });
  });

  it('lê a linha da view', () => {
    const n = linhaNotaForaDoContrato({
      empenho_id: 'e1', numero_oficial: '2026NE000237', uasg_emitente: '200330', ano_exercicio: 2026, data_emissao: '2026-06-19',
      valor_empenhado: '4121.42', credor_nome: 'CESKA', credor_cnpj_cpf: 'ESTRANG', contrato_pelo_pedido: '200331-00238-2026',
      pedidos: [{ numero: 619, emenda: '45530007' }], pedido_de_outro_fornecedor: [],
      contratos_do_fornecedor: [{ contract_key: '200331-00238-2026', numero: '00238/2026', assinatura: '2026-08-04', tem_item_do_pedido: true, sem_notas_da_fonte: true }],
      marca_contract_key: null
    });
    expect(n.valorEmpenhado).toBe(4121.42);
    expect(naCarteira(n)).toBe('PELO_PEDIDO');
    expect(n.marca).toBeNull();
    expect(contratoIndicado(n)).toBe('200331-00238-2026');
  });

  it('nota já citada em fatura fica só em "Citadas em fatura"', () => {
    const notas = [{ empenhoId: 'a' }, { empenhoId: 'b' }];
    expect(semNotasCitadasEmFatura(notas, [{ nota: null }, { nota: { empenhoId: 'b' } as never }])).toEqual([{ empenhoId: 'a' }]);
    expect(semNotasCitadasEmFatura(notas, [])).toEqual(notas);
  });
});
