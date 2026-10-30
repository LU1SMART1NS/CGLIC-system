import { describe, it, expect } from 'vitest';
import { mesaDoPedido, itensDaMesa, passoDoItem } from '../emendasMesa';
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
  it('nota, na CCGA, devolvido, contrato, faturado, liquidado e pago', () => {
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
      }).passo
    ).toBe(3);
    expect(
      passo(linha('a'), {
        contractKey: CONTRATO,
        faturas: 1,
        valorLiquidado: 200
      }).passo
    ).toBe(4);
    expect(
      passo(linha('a'), {
        contractKey: CONTRATO,
        faturas: 1,
        valorLiquidado: 200,
        valorPago: 200,
        pagoEm: '2026-10-28'
      })
    ).toMatchObject({ passo: 5, onde: 'em 28/10/2026' });
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
    expect(it.uma?.texto).toBe('O item está com contrato · Contrato 00041/2026 · assinado em 02/10/2026 · Ordem de Fornecimento em 22/10/2026.');
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
