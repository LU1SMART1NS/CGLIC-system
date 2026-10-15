import { describe, it, expect } from 'vitest';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';
import { linhaForaDoContrato } from '../../../services/empenhosForaDoContratoService';
import {
  aguardaVinculoAosItens,
  conferenciaDaNota,
  tipoSugerido,
  trocaSugeridaPelaOb,
  contaNoMenu,
  deixadaComoEsta,
  passaVigencia,
  noSegmento,
  pedeOGestor,
  entraNoLote,
  ordenarFila,
  passaFiltroSugestao,
  temSugestaoUnica,
  vinculadaPelaEquipe
} from '../vinculacaoEmpenhos';

const nota = (over: any) =>
  mapDistribuicao({ contrato_empenho_id: over.id ?? 'c', empenho_id: 'e', numero_oficial: over.ne ?? 'NE', valor_nota: 100, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...over });

describe('fila Empenhos aos itens', () => {
  it('a vincular e a rever esperam a equipe; vinculadas pela equipe vão para o outro segmento; automáticas somem', () => {
    expect(aguardaVinculoAosItens(nota({ situacao: 'A_DISTRIBUIR' }))).toBe(true);
    expect(aguardaVinculoAosItens(nota({ situacao: 'REVISAR' }))).toBe(true);
    expect(aguardaVinculoAosItens(nota({ situacao: 'DISTRIBUIDA', origem: 'AUTO' }))).toBe(false);
    expect(vinculadaPelaEquipe(nota({ situacao: 'DISTRIBUIDA', origem: 'USUARIO' }))).toBe(true);
    expect(vinculadaPelaEquipe(nota({ situacao: 'DISTRIBUIDA', origem: 'AUTO' }))).toBe(false);
  });

  it('só a sugestão única entra no lote, e nunca uma nota a rever', () => {
    const unica = nota({ sugestao_tipo: 'TOTAL_DO_ITEM', sugestao: [{ numero_item: 43, quantidade: 342 }] });
    const varias = nota({ sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 43, quantidade: 7 }, { numero_item: 45, quantidade: 7 }] });
    const rever = nota({ situacao: 'REVISAR', sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] });
    expect(temSugestaoUnica(unica)).toBe(true);
    expect(entraNoLote(unica)).toBe(true);
    expect(entraNoLote(varias)).toBe(false);
    expect(temSugestaoUnica(rever)).toBe(true);
    expect(entraNoLote(rever)).toBe(false);
    expect(passaFiltroSugestao(varias, 'VARIAS')).toBe(true);
    expect(passaFiltroSugestao(nota({ sugestao_tipo: 'SEM_SUGESTAO' }), 'NENHUMA')).toBe(true);
    expect(passaFiltroSugestao(unica, 'NENHUMA')).toBe(false);
    expect(passaFiltroSugestao(unica, 'TODOS')).toBe(true);
  });

  it('as notas a rever vêm primeiro, depois as mais recentes', () => {
    const lista = [
      nota({ id: 'a', ne: 'A', data_emissao: '2026-09-01' }),
      nota({ id: 'b', ne: 'B', data_emissao: '2024-12-01', situacao: 'REVISAR' }),
      nota({ id: 'c', ne: 'C', data_emissao: '2026-09-30' })
    ];
    expect(ordenarFila(lista, (d) => d.dataEmissao).map((d) => d.numeroOficial)).toEqual(['B', 'C', 'A']);
  });
});

// Linhas da v_empenhos_citados_fora_do_contrato modeladas nos casos reais de 13/10/2026.
const linha = (over: any) =>
  linhaForaDoContrato({
    id_fatura: 1, contract_key: '200331-00009-2013', fatura_numero: '900/2 - OUT', fatura_emissao: '2024-11-06', fatura_referencia: null,
    fatura_vencimento: null, fatura_valor_liquido: 16280.21, id_empenho_gov: '11628150', numero_empenho: '2024NE000030',
    empenho_id: null, outros_contratos: [], registro_no_contrato: null, homonimas: [], outras_notas_da_fatura: [],
    veredito: 'FORA_DOS_CONTRATOS', situacao: 'A_CONFERIR', ...over
  });
const caesb = { numero: '00009/2013', fornecedorNome: 'COMPANHIA DE SANEAMENTO AMBIENTAL DO DISTRITO FEDERAL', fornecedorCnpj: '00.082.024/0001-37' };

describe('conferência de Empenhos ao contrato', () => {
  it('em outro contrato: diz onde está e os dois caminhos no Contratos.gov.br', () => {
    const c = conferenciaDaNota(
      linha({
        veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00024-2018'], empenho_id: 'e30', numero_oficial: '2024NE000030', uasg_emitente: '200331',
        data_emissao: '2024-01-26', valor_empenhado: 250000, credor_nome: 'COMPANHIA DE SANEAMENTO AMBIENTAL DO DISTRITO FEDERAL', credor_cnpj_cpf: '00082024000137',
        homonimas: [{ uasg_emitente: '200330', credor_nome: 'GENERAL MOTORS DO BRASIL LTDA', contratos: ['200331-00032-2024'] }],
        outras_notas_da_fatura: [{ numero_empenho: '2024NE000100', no_contrato: true }, { numero_empenho: '2024NE000657', no_contrato: false }]
      }),
      caesb
    );
    expect(c.frase).toBe('Esta nota está no contrato 00024/2018 e não neste.');
    expect(c.fazer.map((f) => `${f.se} ${f.faca}`)).toEqual([
      'Se a fatura é do 00024/2018: mude a fatura para aquele contrato.',
      'Se a nota paga os dois contratos: inclua a nota também no 00009/2013.'
    ]);
    expect(c.dados[0]).toMatch(/^2024NE000030 · UG 200331 · emitida em 26\/01\/2024 · R\$\s?250\.000,00 · .*mesmo credor do contrato\.$/);
    expect(c.dados[1]).toMatch(/cita também 2024NE000100 \(deste contrato\) e 2024NE000657\.$/);
    expect(c.dados[2]).toBe('Há também uma 2024NE000030 da UG 200330, de GENERAL MOTORS DO BRASIL LTDA, sem relação com esta.');
  });

  it('nota em dobro: mostra o registro do contrato e manda trocar na fatura', () => {
    const c = conferenciaDaNota(
      linha({
        contract_key: '200331-00064-2024', fatura_numero: '900', numero_empenho: '2025NE000215', veredito: 'NOTA_EM_DOBRO',
        registro_no_contrato: { numero_oficial: '2025ne000215', uasg_emitente: '200331', data_emissao: '2025-02-21', valor_empenhado: 0 }
      }),
      { numero: '00064/2024' }
    );
    expect(c.frase).toMatch(/^O Contratos.gov.br tem dois registros da nota 2025NE000215\. Este contrato tem um, com valor R\$\s?0,00\./);
    expect(c.fazer[0]).toEqual({ se: 'Na fatura 900:', faca: 'troque a nota pelo registro que está neste contrato.' });
    expect(c.dados[0]).toMatch(/^No contrato: 2025ne000215 · UG 200331/);
  });

  it('a OB pagou outra nota deste contrato: manda trocar o número na fatura e marca o tipo certo (fatura 7216218, 15/10/2026)', () => {
    const l = linha({
      contract_key: '200331-00088-2013', fatura_numero: '7216218', numero_empenho: '2024NE000027', veredito: 'EM_OUTRO_CONTRATO',
      outros_contratos: ['200331-00004-2017'], outras_notas_da_fatura: [{ numero_empenho: '2024NE000565', no_contrato: true }]
    });
    const pagamento = {
      obs: [{ numero: '2024OB073730', emissao: '2024-08-21', valor: 2333.27, notas: ['2024NE000566', '2024NE000565'] }],
      notasDoContrato: ['2024NE000565', '2024NE000566', '2024NE000395']
    };
    const c = conferenciaDaNota(l, { numero: '00088/2013' }, pagamento);
    expect(c.fazer[0]).toEqual({
      se: 'A OB pagou esta fatura com 2024NE000566, que está neste contrato:',
      faca: 'na fatura 7216218, troque a 2024NE000027 por ela.'
    });
    expect(c.fazer).toHaveLength(3);
    expect(c.dados.at(-1)).toBe('A OB 2024OB073730 (21/08/2024) pagou esta fatura com 2024NE000566 e 2024NE000565.');
    expect(trocaSugeridaPelaOb(l, pagamento)).toEqual(['2024NE000566']);
    expect(tipoSugerido(l, pagamento)).toBe('CORRIGIR_NUMERO_NA_FATURA');
    expect(tipoSugerido(l, null)).toBe('MUDAR_FATURA_DE_CONTRATO');
  });

  it('a OB pagou a nota citada: só diz isso; a citação está certa e não há troca (00033/2023)', () => {
    const l = linha({ numero_empenho: '2023NE000180', veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00054-2023'] });
    const pagamento = { obs: [{ numero: '2024OB000159', emissao: null, valor: 120135.4, notas: ['2023NE000180'] }], notasDoContrato: ['2023NE000051'] };
    const c = conferenciaDaNota(l, { numero: '00033/2023' }, pagamento);
    expect(trocaSugeridaPelaOb(l, pagamento)).toEqual([]);
    expect(c.fazer).toHaveLength(2);
    expect(c.dados.at(-1)).toBe('A OB 2024OB000159 pagou esta fatura com 2023NE000180, e a nota citada está entre elas.');
  });

  it('sem OB confirmada ou nota em dobro: nada muda no texto', () => {
    const l = linha({ veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00024-2018'] });
    expect(conferenciaDaNota(l, caesb, null)).toEqual(conferenciaDaNota(l, caesb));
    const dobro = linha({ veredito: 'NOTA_EM_DOBRO' });
    const pagamento = { obs: [{ numero: '2024OB000001', emissao: null, valor: 1, notas: ['2024NE000999'] }], notasDoContrato: ['2024NE000999'] };
    expect(trocaSugeridaPelaOb(dobro, pagamento)).toEqual([]);
  });

  it('fora dos contratos: incluir no contrato ou corrigir o número; sem dados da nota, só a fatura', () => {
    const c = conferenciaDaNota(linha({ numero_empenho: '2024NE000657' }), caesb);
    expect(c.frase).toBe('Esta nota não está em nenhum contrato da CGLIC no Contratos.gov.br.');
    expect(c.fazer.map((f) => f.faca)).toEqual(['inclua a nota no 00009/2013.', 'corrija a nota na fatura 900/2 - OUT.']);
    expect(c.dados).toHaveLength(1);
    expect(c.dados[0]).toMatch(/^Fatura 900\/2 - OUT · 06\/11\/2024 · R\$\s?16\.280,21\.$/);
  });

  it('credor diferente do fornecedor fica dito nos dados', () => {
    const c = conferenciaDaNota(
      linha({ veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00055-2025', '200331-00030-2025'], empenho_id: 'x', numero_oficial: '2024NE000345', uasg_emitente: '200330', valor_empenhado: 1, credor_nome: 'HPE AUTOMOTORES DO BRASIL LTDA', credor_cnpj_cpf: '54305743000104' }),
      caesb
    );
    expect(c.frase).toBe('Esta nota está nos contratos 00055/2025 e 00030/2025 e não neste.');
    expect(c.dados[0]).toMatch(/credor diferente do fornecedor do contrato\.$/);
  });

  it('segmentos: "A conferir" inclui a marca vencida; "Corrigindo" só a marca no prazo; o menu conta o que pede o gestor', () => {
    const a = linha({ situacao: 'A_CONFERIR' });
    const c = linha({ situacao: 'CORRIGINDO', correcao_tipo: 'OUTRO', correcao_em: '2026-10-13T12:00:00Z' });
    const n = linha({ situacao: 'CORRECAO_NAO_CHEGOU', correcao_tipo: 'OUTRO', correcao_em: '2026-10-01T12:00:00Z' });
    expect([a, c, n].filter((l) => noSegmento(l, 'A_CONFERIR'))).toEqual([a, n]);
    expect([a, c, n].filter((l) => noSegmento(l, 'CORRIGINDO'))).toEqual([c]);
    expect([a, c, n].filter((l) => noSegmento(l, 'TODAS'))).toHaveLength(3);
    expect([a, c, n].filter(pedeOGestor)).toHaveLength(2);
    expect(c.correcao).toEqual({ tipo: 'OUTRO', observacao: null, porNome: null, em: '2026-10-13T12:00:00Z' });
    expect(a.chave).toBe('1|11628150');
  });
});

describe('contratos encerrados nas filas (15/10/2026)', () => {
  it('filtro Vigência: sem data de fim conta como vigente; "Todos" mostra tudo', () => {
    expect(passaVigencia(false, 'VIGENTES')).toBe(true);
    expect(passaVigencia(undefined, 'VIGENTES')).toBe(true);
    expect(passaVigencia(true, 'VIGENTES')).toBe(false);
    expect(passaVigencia(true, 'ENCERRADOS')).toBe(true);
    expect(passaVigencia(false, 'ENCERRADOS')).toBe(false);
    expect(passaVigencia(true, 'TODOS')).toBe(true);
  });

  it('deixada como está só com marca E contrato encerrado; prorrogado volta à fila; o menu conta só vigentes', () => {
    expect(deixadaComoEsta(true, true)).toBe(true);
    expect(deixadaComoEsta(false, true)).toBe(false);
    expect(deixadaComoEsta(true, false)).toBe(false);
    expect(contaNoMenu(false)).toBe(true);
    expect(contaNoMenu(undefined)).toBe(true);
    expect(contaNoMenu(true)).toBe(false);
  });
});
