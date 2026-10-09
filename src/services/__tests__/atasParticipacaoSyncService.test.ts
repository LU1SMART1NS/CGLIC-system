import { describe, it, expect, vi } from 'vitest';
import {
  atasDaCompra,
  comprasDeOutrasUasgs,
  comprasParaLer,
  compraParaGravar,
  concluirDescoberta,
  decomporIdCompra,
  deduplicarItens,
  descobrirParticipacoes,
  lerCompraNasFontes,
  papelNoItem,
  type CompraDeOutraUasg,
  type FontesDaParticipacao,
  type LeituraDaCompra
} from '../atasParticipacaoSyncService';
import type { AdesaoItemRecord, ArpRecord, UnidadeItemRecord } from '../../types';

const AGORA = Date.parse('2026-10-09T15:00:00Z');
const HOJE = '2026-10-09';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const iso = (ms: number) => new Date(ms).toISOString();

// Casos reais de 09/10/2026: compra 90007/2025 da DTI/PF (200342) e 23/2023 da CGL/MJ (200109).
const PF = '20034205900072025';
const VEICULOS = '20010905000232023';

const ata = (numero: string, uasg: string, idCompra: string, extra: Partial<ArpRecord> = {}): ArpRecord => ({
  numeroAtaRegistroPreco: numero,
  codigoUnidadeGerenciadora: uasg,
  nomeUnidadeGerenciadora: 'GERENCIADORA',
  idCompra,
  numeroCompra: String(Number(idCompra.slice(8, 13))),
  anoCompra: idCompra.slice(13),
  codigoModalidadeCompra: idCompra.slice(6, 8),
  nomeModalidadeCompra: 'Pregão',
  dataVigenciaInicial: '2025-10-06',
  dataVigenciaFinal: '2026-10-22',
  statusAta: 'Ata de Registro de Preços',
  objeto: 'Equipamentos de informática',
  numeroControlePncpAta: `ctrl-${numero}`,
  ...extra
} as ArpRecord);

const unidade = (codigo: string, tipo: string, quantidade: number): UnidadeItemRecord =>
  ({ codigoUnidade: codigo, nomeUnidade: `UASG ${codigo}`, tipoUnidade: tipo, quantidadeRegistrada: quantidade, saldoRemanejamentoEmpenho: quantidade, numeroAta: 'x' } as UnidadeItemRecord);

describe('decomporIdCompra e comprasDeOutrasUasgs', () => {
  it('decompõe o idCompra de 17 dígitos', () => {
    expect(decomporIdCompra(PF)).toEqual({ idCompra: PF, uasgCompra: '200342', modalidade: '05', numero: '90007', ano: '2025' });
    expect(decomporIdCompra('123')).toBeNull();
    expect(decomporIdCompra('20034205900071825')).toBeNull();
  });

  it('agrupa as compras de outras UASGs e conta os contratos; ignora as da CGLIC e as inválidas', () => {
    const r = comprasDeOutrasUasgs([PF, PF, VEICULOS, '20033105900012025', '20033005900012025', null, '']);
    expect(r.map((c) => [c.idCompra, c.contratos])).toEqual([[VEICULOS, 1], [PF, 2]]);
  });
});

describe('comprasParaLer', () => {
  const [veiculos, pf] = comprasDeOutrasUasgs([VEICULOS, PF]);
  const antiga = comprasDeOutrasUasgs(['20010905000012017'])[0];
  const lido = (ms: number, extra: Partial<LeituraDaCompra> = {}): LeituraDaCompra =>
    ({ lidoEm: iso(ms), leituraCompleta: true, temAtaVigente: false, atasEncontradas: 3, ...extra });

  it('lê a compra nunca lida antes de todas', () => {
    const leituras = new Map([[pf.idCompra, lido(AGORA - 40 * DIA)]]);
    expect(comprasParaLer([pf, veiculos], leituras, { agora: AGORA }).map((c) => c.idCompra)).toEqual([VEICULOS, PF]);
  });

  it('com ata vigente: relê depois de 24 horas', () => {
    expect(comprasParaLer([pf], new Map([[PF, lido(AGORA - 23 * HORA, { temAtaVigente: true })]]), { agora: AGORA })).toEqual([]);
    expect(comprasParaLer([pf], new Map([[PF, lido(AGORA - 25 * HORA, { temAtaVigente: true })]]), { agora: AGORA })).toEqual([pf]);
  });

  it('leitura incompleta: tenta de novo depois de 6 horas', () => {
    expect(comprasParaLer([veiculos], new Map([[VEICULOS, lido(AGORA - 5 * HORA, { leituraCompleta: false })]]), { agora: AGORA })).toEqual([]);
    expect(comprasParaLer([veiculos], new Map([[VEICULOS, lido(AGORA - 7 * HORA, { leituraCompleta: false })]]), { agora: AGORA })).toEqual([veiculos]);
  });

  it('compra recente ainda sem ata: relê depois de 24 horas; antiga sem ata, depois de 30 dias', () => {
    expect(comprasParaLer([pf], new Map([[PF, lido(AGORA - 25 * HORA, { atasEncontradas: 0 })]]), { agora: AGORA })).toEqual([pf]);
    const leituraAntiga = new Map([[antiga.idCompra, lido(AGORA - 29 * DIA, { atasEncontradas: 0 })]]);
    expect(comprasParaLer([antiga], leituraAntiga, { agora: AGORA })).toEqual([]);
    expect(comprasParaLer([antiga], new Map([[antiga.idCompra, lido(AGORA - 31 * DIA, { atasEncontradas: 0 })]]), { agora: AGORA })).toEqual([antiga]);
  });

  it('atas encerradas: relê depois de 30 dias; forçar relê tudo', () => {
    const leituras = new Map([[VEICULOS, lido(AGORA - 10 * DIA)]]);
    expect(comprasParaLer([veiculos], leituras, { agora: AGORA })).toEqual([]);
    expect(comprasParaLer([veiculos], leituras, { agora: AGORA, forcar: true })).toEqual([veiculos]);
  });
});

describe('atasDaCompra e deduplicarItens', () => {
  const compra = comprasDeOutrasUasgs([PF])[0];
  it('fica com as atas da compra (pelo idCompra ou pelos campos) e sem repetidas', () => {
    const lista = [
      ata('00005/2025', '200342', PF),
      ata('00005/2025', '200342', PF),
      ata('00006/2025', '200342', '', { numeroCompra: '90007', anoCompra: '2025', codigoModalidadeCompra: '5' } as Partial<ArpRecord>),
      ata('00012/2025', '200342', '20034205900082025')
    ];
    expect(atasDaCompra(lista, compra).map((a) => a.numeroAtaRegistroPreco)).toEqual(['00005/2025', '00006/2025']);
  });

  it('deixa um registro por número de item', () => {
    expect(deduplicarItens([{ numeroItem: '00001' }, { numeroItem: 1 }, { numeroItem: '00004' }, { numeroItem: null }])).toHaveLength(2);
  });
});

describe('papelNoItem', () => {
  const unidades = [unidade('200342', 'GERENCIADORA', 2641), unidade('200331', 'PARTICIPANTE', 4117), unidade('200005', 'PARTICIPANTE', 4382)];
  const adesao = (unidadeNaoParticipante: string, q: number | null): AdesaoItemRecord =>
    ({ numeroAta: '00048/2024', unidadeGerenciadora: '200109', unidadeNaoParticipante, dataAprovacaoAnalise: '2026-08-10T16:49:07', quantidadeAprovadaAdesao: q });

  it('participante: quantidade registrada da UASG', () => {
    expect(papelNoItem('200331', unidades, [])).toMatchObject({ papel: 'PARTICIPANTE', quantidade: 4117, unidade: { codigoUnidade: '200331', tipoUnidade: 'PARTICIPANTE' } });
  });

  it('adesão: soma as quantidades aprovadas da UASG; quantidade nula quando a fonte não informa', () => {
    const adesoes = [adesao('200331 - SENASP', 1), adesao('200331 - SENASP', 4), adesao('929777 - OUTRO', 50)];
    expect(papelNoItem('200330', unidades, adesoes)).toBeNull();
    const semSenasp = unidades.filter((u) => u.codigoUnidade !== '200331');
    expect(papelNoItem('200331', semSenasp, adesoes)).toMatchObject({ papel: 'ADESAO', quantidade: 5 });
    expect(papelNoItem('200331', semSenasp, [adesao('200331 - SENASP', null)])).toMatchObject({ papel: 'ADESAO', quantidade: null });
  });

  it('nem participante nem adesão: nulo', () => {
    expect(papelNoItem('200331', [unidade('200342', 'GERENCIADORA', 10)], [])).toBeNull();
  });
});

function fontesFalsas(over: Partial<FontesDaParticipacao> = {}): FontesDaParticipacao {
  return {
    atasDaGerenciadora: vi.fn(async () => [
      ata('00005/2025', '200342', PF),
      ata('00010/2025', '200342', PF),
      ata('00011/2025', '200342', PF, { dataVigenciaFinal: '2026-10-06' })
    ]),
    itensDaAta: vi.fn(async (ctrl: string) =>
      ctrl === 'ctrl-00005/2025'
        ? [{ numeroItem: '00001', descricaoItem: 'MICROCOMPUTADOR', niFornecedor: '81243735000903', nomeRazaoSocialFornecedor: 'POSITIVO', quantidadeHomologadaVencedor: 11618, valorUnitario: 4257, maximoAdesao: 23236 }, { numeroItem: '00001' }]
        : [{ numeroItem: '00007', descricaoItem: 'NOTEBOOK' }]),
    unidadesDoItem: vi.fn(async (numeroAta: string) => {
      if (numeroAta === '00005/2025') return [unidade('200342', 'GERENCIADORA', 2641), unidade('200331', 'PARTICIPANTE', 4117)];
      if (numeroAta === '00010/2025') return [unidade('200342', 'GERENCIADORA', 100)];
      return [];
    }),
    adesoesDoItem: vi.fn(async (numeroAta: string, _g: string, _i: string, unidadeSenasp: string) =>
      numeroAta === '00010/2025' && unidadeSenasp === '200331'
        ? [{ numeroAta, unidadeGerenciadora: '200342', unidadeNaoParticipante: '200331 - SENASP', dataAprovacaoAnalise: '2026-07-10', quantidadeAprovadaAdesao: 3 }]
        : []),
    vigenciasPncp: vi.fn(async (atas: ArpRecord[]) => atas),
    ...over
  };
}

describe('lerCompraNasFontes', () => {
  const compra: CompraDeOutraUasg = { ...decomporIdCompra(PF)!, contratos: 14 };

  it('separa participação, adesão e ata sem resposta; vigência e itens repetidos', async () => {
    const fontes = fontesFalsas();
    const lista = await fontes.atasDaGerenciadora('200342', 2025, HOJE);
    const r = await lerCompraNasFontes(compra, lista, { fontes, hoje: HOJE });
    expect(r.atasDaCompra).toBe(3);
    expect(r.atas.map((a) => [a.numeroAta, a.uasgSenasp, a.papel, a.itens.length])).toEqual([
      ['00005/2025', '200331', 'PARTICIPANTE', 1],
      ['00010/2025', '200331', 'ADESAO', 1]
    ]);
    expect(r.atas[0].itens[0]).toMatchObject({ numeroItem: '00001', quantidadeSenasp: 4117, fornecedorNome: 'POSITIVO', maximoAdesao: 23236 });
    expect(r.atas[1].itens[0]).toMatchObject({ papel: 'ADESAO', quantidadeSenasp: 3 });
    // 00011/2025 veio sem unidades: sem resposta, não é "sem SENASP".
    expect(r).toMatchObject({ atasSemSenasp: 0, itensSemResposta: 1, leituraCompleta: false, temAtaVigente: true });
    // A 00005/2025 tem a 200331 como participante: só a 200330 consulta adesões.
    expect(fontes.adesoesDoItem).not.toHaveBeenCalledWith('00005/2025', '200342', '00001', '200331');
  });

  it('ata cancelada não conta como vigente; falha nos itens vira sem resposta', async () => {
    const fontes = fontesFalsas({ itensDaAta: vi.fn(async (ctrl: string) => { if (ctrl === 'ctrl-00010/2025') throw new Error('429'); return [{ numeroItem: '00001' }]; }) });
    const lista = [ata('00005/2025', '200342', PF, { statusAta: 'Cancelada' }), ata('00010/2025', '200342', PF)];
    const r = await lerCompraNasFontes(compra, lista, { fontes, hoje: HOJE });
    expect(r.atas).toHaveLength(1);
    expect(r.atas[0]).toMatchObject({ statusAta: 'Cancelada' });
    expect(r).toMatchObject({ temAtaVigente: false, itensSemResposta: 1, leituraCompleta: false });
  });

  it('monta o corpo da gravação com os nomes das colunas', async () => {
    const fontes = fontesFalsas();
    const r = await lerCompraNasFontes(compra, await fontes.atasDaGerenciadora('200342', 2025, HOJE), { fontes, hoje: HOJE });
    const corpo = compraParaGravar(r) as any;
    expect(corpo).toMatchObject({ id_compra: PF, uasg_compra: '200342', contratos: 14, atas_encontradas: 3, leitura_completa: false });
    expect(corpo.atas[0]).toMatchObject({ numero_ata: '00005/2025', uasg_gerenciadora: '200342', uasg_senasp: '200331', papel: 'PARTICIPANTE' });
    expect(corpo.atas[0].itens[0]).toMatchObject({ numero_item: '00001', quantidade_senasp: 4117, papel: 'PARTICIPANTE' });
  });
});

describe('descobrirParticipacoes', () => {
  it('lê a lista de cada gerenciadora uma vez, entrega cada compra lida e resume', async () => {
    const fontes = fontesFalsas();
    const lidas: string[] = [];
    const resumo = await descobrirParticipacoes('200331', {
      fontes, idsCompra: [PF, PF, '20034205900082025'], leituras: new Map(), agora: () => AGORA,
      aoLer: async (r) => { lidas.push(r.compra.idCompra); }
    });
    expect(fontes.atasDaGerenciadora).toHaveBeenCalledTimes(1);
    expect(lidas).toEqual([PF, '20034205900082025']);
    expect(resumo).toMatchObject({ compras: 2, antigas: 0, pendentes: 2, lidas: 2, participante: 1, adesao: 1, itensSemResposta: 1, falhas: 0, adiadas: 0 });
  });

  it('deixa de fora as compras com mais de 4 anos', async () => {
    const fontes = fontesFalsas();
    const resumo = await descobrirParticipacoes('200331', { fontes, idsCompra: ['20010905000012017', '20010905000202022', PF], leituras: new Map(), agora: () => AGORA });
    expect(resumo).toMatchObject({ compras: 2, antigas: 1 });
    expect(fontes.atasDaGerenciadora).toHaveBeenCalledWith('200109', 2022, HOJE, expect.any(Function));
  });

  it('tempo esgotado no meio de uma compra: ela não é entregue e fica para a próxima', async () => {
    let t = AGORA;
    const fontes = fontesFalsas({ unidadesDoItem: vi.fn(async () => { t += 60_000; return [unidade('200342', 'GERENCIADORA', 1)]; }) });
    const aoLer = vi.fn(async () => {});
    const resumo = await descobrirParticipacoes('200331', { fontes, idsCompra: [PF], leituras: new Map(), agora: () => t, orcamentoMs: 100_000, aoLer });
    expect(aoLer).not.toHaveBeenCalled();
    expect(resumo).toMatchObject({ lidas: 0, adiadas: 1 });
    expect(concluirDescoberta(resumo, 0)).toMatchObject({ status: 'PARCIAL', mensagem: '1 compra ficou para a próxima execução.' });
  });

  it('falha na lista da gerenciadora: conta a falha e segue', async () => {
    const fontes = fontesFalsas({ atasDaGerenciadora: vi.fn(async () => { throw new Error('Compras.gov.br respondeu 503.'); }) });
    const resumo = await descobrirParticipacoes('200331', { fontes, idsCompra: [PF, VEICULOS], leituras: new Map(), agora: () => AGORA });
    expect(resumo).toMatchObject({ lidas: 0, falhas: 2 });
    expect(concluirDescoberta(resumo, 0)).toMatchObject({ status: 'PARCIAL', mensagem: '2 compras não foram lidas no Compras.gov.br.' });
    expect(concluirDescoberta({ ...resumo, falhas: 0 }, 4)).toEqual({ status: 'SUCESSO', total: 4, fontesComFalha: [] });
  });
});
