import { describe, it, expect } from 'vitest';
import { calcularKit, sugestoesDeTroca, diasEntre, buscarItensCaep, nomeDaLinhaDoPedido } from '../emendasKits';
import type { ItemCaep } from '../../services/emendasService';
import type { PrecoDoItem } from '../../services/emendasQuadroService';

const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k,
  numeroAta: '00031/2025',
  codigoUasg: '200331',
  numeroItem: k.slice(-1),
  descricao: `Item ${k}`,
  codigoPdm: 10,
  valorUnitario: 100,
  vigenciaFinal: '2027-06-25',
  ataEncerrada: false,
  alocado: 100,
  ...extra
});

const HOJE = '2026-10-23';
const mapa = (...xs: ItemCaep[]) => new Map(xs.map((x) => [x.itemKey, x]));

describe('calcularKit', () => {
  it('kits possíveis = o item com menos saldo; valor por kit soma os itens', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'b', quantidade: 3 }] }, mapa(item('a', { alocado: 795 }), item('b', { alocado: 30, valorUnitario: 10 })), HOJE);
    expect(r).toMatchObject({ situacao: 'disponivel', kitsPossiveis: 10, valorPorKit: 130 });
    expect(r.itemLimitante?.itemKey).toBe('b');
  });

  it('ata vencendo em até 90 dias: vence em breve, com a data', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'l', quantidade: 1 }] }, mapa(item('a'), item('l', { numeroAta: '00061/2024', vigenciaFinal: '2027-01-08' })), HOJE);
    expect(r.situacao).toBe('vence');
    expect(r.motivo).toContain('08/01/2027, daqui a 77 dias');
  });

  it('ata encerrada: indisponível inteiro, zero kits', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'v', quantidade: 1 }] }, mapa(item('v', { numeroAta: '00020/2025', vigenciaFinal: '2026-05-28', ataEncerrada: true })), HOJE);
    expect(r).toMatchObject({ situacao: 'indisponivel', kitsPossiveis: 0 });
    expect(r.motivo).toContain('encerrou em 28/05/2026');
  });

  it('item sem alocação da CAEP ou sem saldo: indisponível', () => {
    expect(calcularKit({ ativo: true, itens: [{ itemKey: 'x', quantidade: 1 }] }, mapa(), HOJE).situacao).toBe('indisponivel');
    expect(calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 200 }] }, mapa(item('a')), HOJE).situacao).toBe('indisponivel');
  });

  it('desativado pela CAEP vale mais que tudo', () => {
    expect(calcularKit({ ativo: false, itens: [{ itemKey: 'a', quantidade: 1 }] }, mapa(item('a')), HOJE).situacao).toBe('desativado');
  });

  it('o saldo pode vir de fora (entrega 2: alocado menos pedidos)', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }] }, mapa(item('a')), HOJE, () => 7);
    expect(r.kitsPossiveis).toBe(7);
  });
});

describe('sugestoesDeTroca', () => {
  it('mesmo código de material, ata vigente, outro item', () => {
    const velho = item('a', { ataEncerrada: true });
    const todos = [velho, item('b'), item('c', { codigoPdm: 99 }), item('d', { ataEncerrada: true })];
    expect(sugestoesDeTroca(velho, todos).map((i) => i.itemKey)).toEqual(['b']);
  });
});

describe('diasEntre', () => {
  it('conta dias de calendário', () => {
    expect(diasEntre('2026-10-23', '2026-12-19')).toBe(57);
  });
});

describe('buscarItensCaep', () => {
  const lista = [
    item('00031/2025-200331-00001', { numeroAta: '00031/2025', numeroItem: '00001', descricao: 'ARMA DE FOGO - FUZIL, CALIBRE 5,56' }),
    item('00031/2025-200331-00002', { numeroAta: '00031/2025', numeroItem: '00002', descricao: 'ARMA DE FOGO - FUZIL, CANO 11,5' }),
    item('00108/2024-200331-00001', { numeroAta: '00108/2024', numeroItem: '00001', descricao: 'ESTABILIZADOR TENSÃO, NOBREAK' })
  ];
  const chaves = (t: string) => buscarItensCaep(lista, t).map((i) => i.itemKey.slice(-1) + '@' + i.numeroAta);

  it('acha pela descrição sem acento e sem maiúscula, com todas as palavras', () => {
    expect(chaves('tensao')).toEqual(['1@00108/2024']);
    expect(chaves('fuzil cano')).toEqual(['2@00031/2025']);
  });

  it('acha pela ata com ou sem zeros e pelo item', () => {
    expect(chaves('31/2025')).toHaveLength(2);
    expect(chaves('00031')).toHaveLength(2);
    expect(chaves('31/2025 item 2')).toEqual(['2@00031/2025']);
  });

  it('busca vazia devolve todos', () => {
    expect(buscarItensCaep(lista, '  ')).toHaveLength(3);
  });
});

describe('prazo de indicação (migration 162)', () => {
  it('a menos de 60 dias do fim da ata o kit fica indisponível; entre 60 e 90, vence em breve com a data limite', async () => {
    const { EMENDAS_RULES } = await import('../../config/alertRules');
    const kit = { ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }] };
    const r50 = calcularKit(kit, mapa(item('a', { numeroAta: '00061/2024', vigenciaFinal: '2026-12-12' })), HOJE);
    expect(r50).toMatchObject({ situacao: 'indisponivel', kitsPossiveis: 0 });
    expect(r50.motivo).toContain('passou do prazo de indicação (60 dias');
    const r70 = calcularKit(kit, mapa(item('a', { numeroAta: '00061/2024', vigenciaFinal: '2027-01-01' })), HOJE);
    expect(r70.situacao).toBe('vence');
    expect(r70.motivo).toContain('Indicação só até 02/11/2026');
    // Ajustes muda o corte na hora
    EMENDAS_RULES.corteIndicacaoAntesDias = 75;
    expect(calcularKit(kit, mapa(item('a', { vigenciaFinal: '2027-01-01' })), HOJE).situacao).toBe('indisponivel');
    EMENDAS_RULES.corteIndicacaoAntesDias = 60;
  });

  it('item a menos de 60 dias do reajuste da ata, ou com o reajuste devido, deixa o kit indisponível (migration 246)', () => {
    const kit = { ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }] };
    const preco = (extra: Partial<PrecoDoItem>) => new Map<string, PrecoDoItem>([['a', { itemKey: 'a', precoAtual: 100, dataReajuste: null, origem: null, devido: false, precoDevido: null, ...extra }]]);
    const perto = calcularKit(kit, mapa(item('a')), HOJE, undefined, preco({ dataReajuste: '2026-12-01', origem: 'REAJUSTE' }));
    expect(perto).toMatchObject({ situacao: 'indisponivel', kitsPossiveis: 0 });
    expect(perto.motivo).toContain('reajuste em 01/12/2026');
    const devido = calcularKit(kit, mapa(item('a')), HOJE, undefined, preco({ devido: true, origem: 'DEVIDO', precoDevido: 105 }));
    expect(devido.situacao).toBe('indisponivel');
    expect(devido.motivo).toContain('aguarda o apostilamento');
    expect(calcularKit(kit, mapa(item('a')), HOJE, undefined, preco({ dataReajuste: '2027-03-01', origem: 'REAJUSTE' })).situacao).toBe('disponivel');
  });
});

describe('nomeDaLinhaDoPedido: o item pelo nome da ata assinada nas listas de pedidos (27/10/2026)', () => {
  const itens = new Map<string, ItemCaep>([
    ['x1', item('x1', { descricao: 'Arma de fogo - empunhável - médio calibre, tipo pistola semiautomática', nomeCurto: 'Pistola 9 mm' })],
    ['x2', item('x2', { descricao: 'Arma de fogo - empunhável - médio calibre, tipo pistola semiautomática', nomeCurto: '  ' })]
  ]);
  it('usa o nome da ata assinada inteiro, sem cortar', () => {
    expect(nomeDaLinhaDoPedido({ tipo: 'ITEM', quantidade: 3, itemKey: 'x1', kitNome: null }, itens, 5)).toBe('3 Pistola 9 mm');
  });
  it('sem o nome da ata assinada, o começo da descrição do catálogo', () => {
    expect(nomeDaLinhaDoPedido({ tipo: 'ITEM', quantidade: 2, itemKey: 'x2', kitNome: null }, itens, 20)).toMatch(/^2 Arma de fogo.*…$/);
  });
  it('o kit pelo nome do kit', () => {
    expect(nomeDaLinhaDoPedido({ tipo: 'KIT', quantidade: 1, itemKey: null, kitNome: 'Kit perícia' }, itens)).toBe('1 Kit perícia');
  });
});
