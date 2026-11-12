import { describe, it, expect } from 'vitest';
import { mesaDoPedido, itensDaMesa, passoDoItem, passosDaLinha, PASSO, PASSOS_DO_ITEM } from '../emendasMesa';
import type { BeneficiarioEmenda, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-29';
const A = '00031/2025-200331';
const B = '00048/2025-200331';
const item = (itemKey: string, numeroAta: string, nomeCurto: string): ItemCaep => ({
  itemKey,
  numeroAta,
  codigoUasg: '200331',
  numeroItem: '00001',
  descricao: nomeCurto,
  codigoPdm: 1,
  valorUnitario: 100,
  vigenciaFinal: '2026-12-18',
  ataEncerrada: false,
  alocado: 100,
  nomeCurto
});
const itens = new Map<string, ItemCaep>([
  [`${A}-00001`, item(`${A}-00001`, '00031/2025', 'Carabina')],
  [`${B}-00001`, item(`${B}-00001`, '00048/2025', 'Mira')]
]);
const benef = (id: string, nome: string, sigla: string) => ({ id, nome, sigla }) as BeneficiarioEmenda;
const beneficiarios = new Map([
  ['b1', benef('b1', 'Polícia Militar da Bahia', 'PMBA')],
  ['b2', benef('b2', 'Polícia Civil da Bahia', 'PCBA')]
]);
const linha = (id: string, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id,
  ordem: 1,
  tipo: 'ITEM',
  itemKey: `${A}-00001`,
  kitId: null,
  kitNome: null,
  kitVersao: null,
  kitComposicao: null,
  quantidade: 2,
  beneficiarioId: 'b1',
  cancelada: false,
  canceladaMotivo: null,
  empenhoDocumentoSei: null,
  contratoNumero: null,
  despachoDocumentoSei: null,
  ccgaSituacao: null,
  ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p',
  numero: 1,
  autorId: 'A1',
  etapa: 'CONTRATACAO',
  origem: 'SISTEMA',
  observacao: null,
  contatoNome: null,
  contatoTelefone: null,
  contatoEmail: null,
  reservadoEm: '2026-09-02',
  minutaEm: '2026-09-04',
  minutaDocumentoSei: null,
  oficioNumero: null,
  oficioDocumentoSei: null,
  oficioProcessoSei: null,
  oficioEm: '2026-09-16',
  divergencia: null,
  devolvidoEm: null,
  siopEmenda: '31050007',
  siopEmendaAno: 2026,
  siopValor: null,
  siopGnd: null,
  conferidoEm: '2026-09-19',
  solicitadoEm: '2026-09-30',
  solicitadoDocumentoSei: '41388210',
  autorizadoEm: '2026-10-14',
  autorizadoDocumentoSei: null,
  cgofiEm: '2026-10-15',
  cgofiDocumentoSei: '41730551',
  empenhadoEm: '2026-10-20',
  empenhadoDocumentosSei: ['41225409'],
  contratacaoEm: '2026-10-22',
  contratacaoDocumentosSei: [],
  canceladoEm: null,
  canceladoMotivo: null,
  versao: 1,
  atualizadoPorNome: null,
  atualizadoEm: null,
  linhas: [linha('l1')],
  devolucoes: [],
  documentos: [],
  pedidoOrigemId: null,
  pedidoOrigemNome: null,
  anulacoes: [],
  emendaId: null,
  outrasEmendas: [],
  ...extra
});
const nota = (linhaId: string, extra: Partial<NotaDaLinha> = {}): NotaDaLinha => ({
  linhaId,
  nota: '2026NE000103',
  regra: 'SEI',
  motivo: null,
  contractKey: null,
  empenhoId: 'e1',
  valorEmpenhado: 200,
  valorLiquidado: 0,
  valorPago: 0,
  entregaPrevista: null,
  entregaPrevistaValor: null,
  emitidaEm: '2026-10-18',
  atualizadoEm: null,
  ...extra
});
const CONTRATO = '200331|2026|00041';

describe('Mesa do pedido: passo de cada item', () => {
  it('nota, na CCGA, devolvido, contrato e, sem a Fiscalização, faturado = entregue, liquidado = recebido e pago', () => {
    const p = pedido({});
    const passo = (l: LinhaPedido, n?: Partial<NotaDaLinha> | null) => passoDoItem(p, l, new Map(n === null ? [] : [[l.id, nota(l.id, n ?? {})]]));
    expect(passo(linha('a'), null).passo).toBe(-1);
    expect(passo(linha('a')).passo).toBe(0);
    expect(passo(linha('a', { ccgaSituacao: 'ENVIADA', ccgaEm: '2026-10-22' })).passo).toBe(1);
    expect(
      passo(
        linha('a', {
          ccgaSituacao: 'DEVOLVIDA',
          ccgaEm: '2026-10-27',
          ccgaMotivo: 'preço'
        })
      )
    ).toMatchObject({ passo: 1, devolvido: true });
    expect(passo(linha('a', { ccgaSituacao: 'ENVIADA' }), { contractKey: CONTRATO }).passo).toBe(2);
    expect(
      passo(linha('a'), {
        contractKey: CONTRATO,
        faturas: 1,
        faturadoEm: '2026-10-25'
      })
    ).toMatchObject({ passo: PASSO.ENTREGUE, onde: 'faturado em 25/10/2026' });
    expect(
      passo(linha('a'), {
        contractKey: CONTRATO,
        faturas: 1,
        valorLiquidado: 200
      }).passo
    ).toBe(PASSO.RECEBIDO);
    expect(
      passo(linha('a'), {
        contractKey: CONTRATO,
        faturas: 1,
        valorLiquidado: 200,
        valorPago: 200,
        pagoEm: '2026-10-28'
      })
    ).toMatchObject({ passo: PASSO.PAGO, onde: 'em 28/10/2026' });
  });

  it('10 passos, na ordem do protótipo da Fiscalização', () => {
    expect([...PASSOS_DO_ITEM]).toEqual(['Nota', 'Na CCGA', 'Contrato', 'Informações', 'Ordem', 'Produção', 'Entregue', 'Recebido', 'Pago', 'Ofício à SAL']);
  });

  it('Informação e Ordem do pedido viram passos, sem a Fiscalização', () => {
    const p = pedido({ ordens: [{ id: 'o', contractKey: CONTRATO, informacaoEm: '2026-10-10', informacaoDocumentoSei: '37530982', ordemEm: null, ordemDocumentoSei: null }] });
    expect(passoDoItem(p, linha('a'), new Map([['a', nota('a', { contractKey: CONTRATO })]])).passo).toBe(PASSO.INFORMACOES);
  });
});

describe('Mesa do pedido: passos pela Fiscalização (migration 263)', () => {
  const p = pedido({});
  const notas = (extra: Partial<NotaDaLinha> = {}) => new Map([['a', nota('a', { contractKey: CONTRATO, ...extra })]]);
  const e = (etapa: string, quantidade = 10, extra: Record<string, unknown> = {}) => ({ quantidade, responsavel: 'SFC' as const, etapa, etapaEm: '2026-10-20', entregueEm: null, ...extra });

  it('a etapa da entrega vira o passo; parado no Exército em vermelho', () => {
    expect(passosDaLinha(p, linha('a'), notas(), [e('ORDEM')])[0]).toMatchObject({ passo: PASSO.ORDEM, onde: 'Ordem de Fornecimento enviada em 20/10/2026' });
    expect(passosDaLinha(p, linha('a'), notas(), [e('CONTROLADO')])[0]).toMatchObject({ passo: PASSO.PRODUCAO, parado: 'Aguardando o Exército' });
    expect(passosDaLinha(p, linha('a'), notas(), [e('TRP', 10, { entregueEm: '2026-10-25' })])[0]).toMatchObject({ passo: PASSO.ENTREGUE, onde: 'recebimento provisório em 25/10/2026' });
    expect(passosDaLinha(p, linha('a'), notas(), [e('PAGAMENTO')])[0].passo).toBe(PASSO.RECEBIDO);
    expect(passosDaLinha(p, linha('a'), notas({ valorPago: 200, pagoEm: '2026-10-28' }), [e('PAGAMENTO')])[0].passo).toBe(PASSO.PAGO);
    expect(passosDaLinha(p, linha('a'), notas(), [e('SAL')])[0].passo).toBe(PASSO.SAL);
  });

  it('entrega parcial: uma parte por entrega, com "parte de"', () => {
    const partes = passosDaLinha(p, linha('a', { quantidade: 10 }), notas(), [e('ENTREGUE', 4, { entregueEm: '2026-10-25' }), e('CONTROLADO', 6)]);
    expect(partes.map((x) => [x.quantidade, x.passo])).toEqual([[4, PASSO.ENTREGUE], [6, PASSO.PRODUCAO]]);
    expect(partes[0].onde).toContain('parte de 10');
  });

  it('área requisitante e antes do contrato seguem pelas notas', () => {
    expect(passosDaLinha(p, linha('a'), notas(), [{ ...e('ORDEM'), responsavel: 'AREA' }])[0]).toMatchObject({ passo: PASSO.CONTRATO });
    expect(passosDaLinha(p, linha('a', { ccgaSituacao: 'ENVIADA' }), new Map([['a', nota('a')]]), [e('ORDEM')])[0].passo).toBe(PASSO.CCGA);
  });

  it('no quadro, as partes viram linhas e o resumo conta os parados', () => {
    const it = itensDaMesa(pedido({ linhas: [linha('a', { quantidade: 10 })] }), itens, notas(), beneficiarios, new Map([['a', [e('ENTREGUE', 4, { entregueEm: '2026-10-25' }), e('CONTROLADO', 6)]]]))!;
    const todos = it.grupos.flatMap((g) => g.itens);
    expect(todos.map((x) => x.quantidade).sort()).toEqual([4, 6]);
    expect(it.uma).toBeNull();
    expect(it.grupos[0].resumo).toContain('parados no Exército');
  });
});

describe('Mesa do pedido: onde está cada item', () => {
  it('antes da nota não aparece', () => {
    expect(itensDaMesa(pedido({ etapa: 'CGOFI' }), itens, new Map(), beneficiarios)).toBeNull();
  });

  it('todos no mesmo passo: uma frase só', () => {
    const p = pedido({
      etapa: 'EMPENHADO',
      linhas: [linha('l1'), linha('l2', { beneficiarioId: 'b2' })]
    });
    const it = itensDaMesa(
      p,
      itens,
      new Map([
        ['l1', nota('l1')],
        ['l2', nota('l2')]
      ]),
      beneficiarios
    )!;
    expect(it.uma?.texto).toBe('Os 2 itens estão com nota, a enviar à CCGA.');
  });

  it('por beneficiário, o pendente primeiro, e linhas iguais juntas', () => {
    const p = pedido({
      linhas: [
        linha('l1', {
          ccgaSituacao: 'DEVOLVIDA',
          ccgaEm: '2026-10-27',
          ccgaMotivo: 'preço acima do registrado'
        }),
        linha('l2', {
          itemKey: `${B}-00001`,
          beneficiarioId: 'b2',
          ccgaSituacao: 'ENVIADA',
          quantidade: 3
        }),
        linha('l3', {
          itemKey: `${B}-00001`,
          beneficiarioId: 'b2',
          ccgaSituacao: 'ENVIADA',
          quantidade: 2
        })
      ]
    });
    const notas = new Map([
      ['l1', nota('l1')],
      ['l2', nota('l2')],
      ['l3', nota('l3')]
    ]);
    const it = itensDaMesa(p, itens, notas, beneficiarios)!;
    expect(it.unico).toBe(false);
    expect(it.grupos.map((g) => g.nome)).toEqual(['PMBA', 'PCBA']);
    expect(it.grupos[0].resumo).toBe('2 devolvidos');
    expect(it.grupos[1].itens).toHaveLength(1);
    expect(it.grupos[1].itens[0]).toMatchObject({
      quantidade: 5,
      nome: 'Mira',
      ata: '00048/2025',
      passo: 1
    });
  });

  it('grande conta as linhas depois de juntar: 11 linhas iguais por beneficiário não fazem pedido grande', () => {
    const ls = Array.from({ length: 11 }, (_, i) =>
      linha(`l${i}`, {
        beneficiarioId: i % 2 ? 'b1' : 'b2',
        ccgaSituacao: 'ENVIADA',
        quantidade: 1
      })
    );
    const it = itensDaMesa(pedido({ linhas: ls }), itens, new Map(ls.map((l) => [l.id, nota(l.id)])), beneficiarios)!;
    expect(it.total).toBe(2);
    expect(it.grande).toBe(false);
    expect(it.uma?.texto).toBe('Os 11 itens estão na CCGA.');
  });
});

describe('Mesa do pedido: cada ação numa linha só', () => {
  it('empenhado com envio por ata: uma linha "Enviar à CCGA" com as atas, e o despacho não se repete', () => {
    const p = pedido({
      etapa: 'EMPENHADO',
      contratacaoEm: null,
      linhas: [linha('l1'), linha('l2', { itemKey: `${B}-00001` })]
    });
    const m = mesaDoPedido(
      p,
      itens,
      new Map([
        ['l1', nota('l1')],
        ['l2', nota('l2')]
      ]),
      [],
      HOJE,
      true,
      beneficiarios
    );
    const envio = m.comVoce.filter((l) => l.chave === 'ccga-enviar');
    expect(envio).toHaveLength(1);
    expect(envio[0].titulo).toBe('Enviar à CCGA · 2 atas (00031/2025, 00048/2025)');
    expect(m.comVoce.some((l) => l.chave === 'tarefa-despacho')).toBe(false);
    expect(m.comVoce.flatMap((l) => l.acoes).filter((a) => a.faz.tipo === 'ccgaEnviar')).toHaveLength(1);
  });

  it('item devolvido: reenviar e anular na mesma linha, no alto', () => {
    const p = pedido({
      linhas: [
        linha('l1', {
          ccgaSituacao: 'DEVOLVIDA',
          ccgaEm: '2026-10-27',
          ccgaMotivo: 'preço acima do registrado'
        }),
        linha('l2', { ccgaSituacao: 'ENVIADA', ccgaEm: '2026-10-22' })
      ]
    });
    const m = mesaDoPedido(
      p,
      itens,
      new Map([
        ['l1', nota('l1')],
        ['l2', nota('l2')]
      ]),
      [],
      HOJE,
      true,
      beneficiarios
    );
    expect(m.comVoce[0].chave).toBe('devolvido-ccga');
    expect(m.comVoce[0].acoes.map((a) => a.rotulo)).toEqual(['Registrar anulação', 'Reenviar à CCGA']);
    // O item devolvido não pede outro "Enviar à CCGA".
    expect(m.comVoce.some((l) => l.chave === 'ccga-enviar')).toBe(false);
    // A CCGA da ata em Com outros, com o fim da ata como prazo e o desfazer na própria linha.
    const ccga = m.comOutros.find((l) => l.chave === `ccga-${A}`)!;
    expect(ccga).toMatchObject({ quem: 'CCGA', prazo: '18/12/2026' });
    expect(ccga.acoes.map((a) => a.rotulo)).toEqual(['Desfazer envio']);
  });

  it('números SEI que faltam: uma linha com um link para cada; sem perfil de gestão, nenhuma', () => {
    const p = pedido({
      etapa: 'EMPENHADO',
      contratacaoEm: null,
      cgofiDocumentoSei: null,
      empenhadoDocumentosSei: []
    });
    const m = mesaDoPedido(p, itens, new Map([['l1', nota('l1')]]), [], HOJE, true, beneficiarios);
    const sei = m.comVoce.filter((l) => l.chave === 'falta-sei');
    expect(sei).toHaveLength(1);
    expect(sei[0].titulo).toBe('Completar 2 números SEI');
    expect(sei[0].acoes.map((a) => a.rotulo)).toEqual(['envio à CGOFI', 'nota de empenho']);
    const leitura = mesaDoPedido(p, itens, new Map([['l1', nota('l1')]]), [], HOJE, false, beneficiarios);
    expect(leitura.comVoce.some((l) => l.chave === 'falta-sei')).toBe(false);
    expect(leitura.comVoce.flatMap((l) => l.acoes)).toEqual([]);
  });

  it('caminho: a fase da etapa é a atual; a Execução acende com o primeiro contrato', () => {
    const p = pedido({
      linhas: [linha('l1', { ccgaSituacao: 'ENVIADA' }), linha('l2', { ccgaSituacao: 'ENVIADA', itemKey: `${B}-00001` })]
    });
    const m = mesaDoPedido(
      p,
      itens,
      new Map([
        ['l1', nota('l1', { contractKey: CONTRATO })],
        ['l2', nota('l2', { nota: '2026NE000104' })]
      ]),
      [],
      HOJE,
      true,
      beneficiarios
    );
    expect(m.fases.map((f) => f.estado)).toEqual(['feita', 'feita', 'atual', 'atual']);
    const antes = mesaDoPedido(pedido({ etapa: 'OFICIO' }), itens, new Map(), [], HOJE, true, beneficiarios);
    expect(antes.fases.map((f) => f.estado)).toEqual(['feita', 'atual', 'vem', 'vem']);
  });
});

describe('Mesa do pedido: Informação e Ordem de Fornecimento por contrato (migration 250)', () => {
  const C1 = '200331-00057-2026';
  const C2 = '200331-00041-2026';
  const contratados = () => {
    const ls = [linha('l1', { ccgaSituacao: 'ENVIADA' }), linha('l2', { ccgaSituacao: 'ENVIADA', itemKey: `${B}-00001`, beneficiarioId: 'b2' })];
    const notas = new Map([
      ['l1', nota('l1', { contractKey: C1 })],
      ['l2', nota('l2', { nota: '2026NE000104', contractKey: C2 })]
    ]);
    return { ls, notas };
  };

  it('contratos sem Informação: uma linha em Com você com os contratos; nada em Com outros', () => {
    const { ls, notas } = contratados();
    const m = mesaDoPedido(pedido({ linhas: ls }), itens, notas, [], HOJE, true, beneficiarios);
    const l = m.comVoce.find((x) => x.chave === 'ordem-informacao')!;
    expect(l.titulo).toBe('Fazer a Informação para a Ordem de Fornecimento · 2 contratos (00041/2026, 00057/2026)');
    expect(l.acoes[0].faz).toEqual({ tipo: 'ordem', modo: 'INFORMACAO', contratos: [C2, C1] });
    expect(m.comOutros.some((x) => x.chave.startsWith('ordem-sfc'))).toBe(false);
  });

  it('com a Informação, a Ordem é com a SFC; com a Ordem, some e vai para o histórico', () => {
    const { ls, notas } = contratados();
    const ordens = [
      { id: 'o1', contractKey: C1, informacaoEm: '2026-10-27', informacaoDocumentoSei: '37530982', ordemEm: null, ordemDocumentoSei: null },
      { id: 'o2', contractKey: C2, informacaoEm: '2026-10-20', informacaoDocumentoSei: '37500000', ordemEm: '2026-10-22', ordemDocumentoSei: '37510000' }
    ];
    const m = mesaDoPedido(pedido({ linhas: ls, ordens }), itens, notas, [], HOJE, true, beneficiarios);
    expect(m.comVoce.some((x) => x.chave === 'ordem-informacao')).toBe(false);
    const sfc = m.comOutros.filter((x) => x.chave.startsWith('ordem-sfc'));
    expect(sfc).toHaveLength(1);
    expect(sfc[0]).toMatchObject({ quem: 'SFC', titulo: 'Emitir a Ordem de Fornecimento · Contrato 00057/2026', detalhe: 'Informação de 27/10/2026.' });
    const execucao = m.historico.find((f) => f.fase === 'Execução')!;
    expect(execucao.registros.map((r) => r.texto)).toContain('Ordem de Fornecimento · Contrato 00041/2026');
    // O item do contrato com Ordem mostra a data dela.
    const itensDoPedido = m.itens!.grupos.flatMap((g) => g.itens);
    expect(itensDoPedido.some((x) => x.onde?.includes('Ordem de Fornecimento em 22/10/2026'))).toBe(true);
  });

  it('contrato já faturado sem registro fica comprovado pela entrega e não pede nada', () => {
    const { ls } = contratados();
    const notas = new Map([
      ['l1', nota('l1', { contractKey: C1, faturas: 1, faturadoEm: '2026-10-25' })],
      ['l2', nota('l2', { nota: '2026NE000104', contractKey: C2, faturas: 1 })]
    ]);
    const m = mesaDoPedido(pedido({ linhas: ls }), itens, notas, [], HOJE, true, beneficiarios);
    expect(m.comVoce.some((x) => x.chave === 'ordem-informacao')).toBe(false);
  });
});

describe('Mesa do pedido: ajustes de 30/10/2026', () => {
  it('pedido do controle anterior da CAEP não pede o SEI que faltou lá', () => {
    const p = pedido({ etapa: 'EMPENHADO', contratacaoEm: null, cgofiDocumentoSei: null, origem: 'PLANILHA' });
    const m = mesaDoPedido(p, itens, new Map([['l1', nota('l1')]]), [], HOJE, true, beneficiarios);
    expect(m.comVoce.some((l) => l.chave === 'falta-sei')).toBe(false);
  });

  it('"Nesta fase": só o primeiro passo aberto é o atual', () => {
    const p = pedido({ linhas: [linha('l1', { ccgaSituacao: 'ENVIADA' })], ordens: [{ id: 'o', contractKey: '200331-00041-2026', informacaoEm: null, informacaoDocumentoSei: null, ordemEm: '2026-10-22', ordemDocumentoSei: '37510000' }] });
    const m = mesaDoPedido(p, itens, new Map([['l1', nota('l1', { contractKey: '200331-00041-2026' })]]), [], HOJE, true, beneficiarios);
    expect(m.passos.filter((x) => x.atual)).toHaveLength(1);
  });

  it('item único com contrato: a frase leva o contrato, a assinatura e a Ordem', () => {
    const p = pedido({ linhas: [linha('l1', { ccgaSituacao: 'ENVIADA' })], ordens: [{ id: 'o', contractKey: '200331-00041-2026', informacaoEm: null, informacaoDocumentoSei: null, ordemEm: '2026-10-22', ordemDocumentoSei: '37510000' }] });
    const it = itensDaMesa(p, itens, new Map([['l1', nota('l1', { contractKey: '200331-00041-2026', contratoAssinadoEm: '2026-10-02' })]]), beneficiarios)!;
    expect(it.uma?.texto).toBe('O item está com a Ordem de Fornecimento · Contrato 00041/2026 · assinado em 02/10/2026 · Ordem de Fornecimento em 22/10/2026.');
  });
});

describe('Mesa do pedido: observação e datas do controle anterior (30/10/2026)', () => {
  it('a observação vai no alto do Histórico, com o texto inteiro', () => {
    const p = pedido({ observacao: 'Ofício 219/2026 (35657060), Guarda Municipal de Londrina: R$ 399.954,94.' });
    const m = mesaDoPedido(p, itens, new Map([['l1', nota('l1')]]), [], HOJE, true, beneficiarios);
    expect(m.historico[0]).toEqual({ fase: 'Observação do pedido', registros: [expect.objectContaining({ chave: 'observacao', texto: 'Ofício 219/2026 (35657060), Guarda Municipal de Londrina: R$ 399.954,94.' })] });
  });

  it('pedido do controle anterior: etapa sem data diz isso na própria linha', () => {
    const p = pedido({ origem: 'PLANILHA', minutaEm: null, oficioEm: null, conferidoEm: null });
    const m = mesaDoPedido(p, itens, new Map([['l1', nota('l1')]]), [], HOJE, true, beneficiarios);
    const interlocucao = m.historico.find((f) => f.fase === 'Interlocução')!;
    expect(interlocucao.registros.map((r) => r.data)).toEqual(['sem data no controle anterior', 'sem data no controle anterior']);
  });
});

describe('Mesa do pedido: botão da próxima etapa em "Com outros" (11/11/2026)', () => {
  const minuta = (extra: Partial<PedidoEmenda> = {}) =>
    pedido({ etapa: 'MINUTA', oficioEm: null, conferidoEm: null, solicitadoEm: null, autorizadoEm: null, cgofiEm: null, empenhadoEm: null, contratacaoEm: null, ...extra });

  it('minuta enviada: "Registrar o ofício" fica na linha do gabinete', () => {
    const m = mesaDoPedido(minuta(), itens, new Map(), [], HOJE, true, beneficiarios);
    const linhaMinuta = m.comOutros.find((l) => l.chave === 'tarefa-minuta')!;
    expect(linhaMinuta.acoes.map((a) => [a.rotulo, a.faz.tipo])).toEqual([['Registrar o ofício', 'proxima']]);
  });

  it('sem poder gerir: a linha fica sem botão', () => {
    const m = mesaDoPedido(minuta(), itens, new Map(), [], HOJE, false, beneficiarios);
    expect(m.comOutros.find((l) => l.chave === 'tarefa-minuta')!.acoes).toEqual([]);
  });

  it('solicitação na Diretora: "Registrar a autorização" na linha da assinatura', () => {
    const p = pedido({ etapa: 'SOLICITADO', autorizadoEm: null, cgofiEm: null, empenhadoEm: null, contratacaoEm: null });
    const m = mesaDoPedido(p, itens, new Map(), [], HOJE, true, beneficiarios);
    expect(m.comOutros.find((l) => l.chave === 'tarefa-assinatura')?.acoes.map((a) => a.rotulo)).toEqual(['Registrar a autorização']);
  });

  it('prazo gravado com a minuta: a linha mostra o mesmo prazo do aviso', () => {
    const m = mesaDoPedido(minuta({ minutaEm: '2026-10-20', minutaValidaAte: '2026-10-25' }), itens, new Map(), [], HOJE, true, beneficiarios);
    const linhaMinuta = m.comOutros.find((l) => l.chave === 'tarefa-minuta')!;
    expect([linhaMinuta.prazo, linhaMinuta.vencido]).toEqual(['25/10/2026', true]);
  });
});
