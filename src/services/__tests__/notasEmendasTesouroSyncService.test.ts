import { describe, it, expect, vi, beforeEach } from 'vitest';

let fila: string[] = [];
let doPortal: Array<{ numero_oficial: string; emenda: string; anos: number[] }> = [];
const rpc = vi.fn(async (nome: string, args: any): Promise<any> => {
  if (nome === 'notas_das_emendas_a_trazer') return { data: fila.map((numero_oficial) => ({ numero_oficial })), error: null };
  if (nome === 'notas_das_emendas_pelo_portal') return { data: doPortal, error: null };
  if (nome === 'gravar_notas_pelo_portal') return { data: args.p_notas[0].emenda_codigo ? { GRAVADA: 1 } : { PORTAL_SEM_A_NOTA: 1 }, error: null };
  // gravar_notas_do_tesouro: grava se veio a nota da 200330, senão registra que o Tesouro não tem
  const temEmenda = args.p_notas.some((n: any) => n.ug === '200330');
  return { data: temEmenda ? { GRAVADA: 1 } : { TESOURO_SEM_A_NOTA: 1 }, error: null };
});
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: (n: string, a: any) => rpc(n, a) } }));
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));
const respostaSta = (ug: string, numero: string) => ({
  num_lista: `${ug}00001${numero}`,
  ug,
  numero,
  emissao: '2026-03-27',
  nome: ug === '200330' ? 'GENERAL MOTORS DO BRASIL LTDA' : 'FUNDO NACIONAL DE SEGURANCA PUBLICA - FNSP',
  cpfcnpjugidgener: ug === '200330' ? '59.275.792/0001-50' : '200331',
  picodigo: ug === '200330' ? 'SP999S94557' : 'SP99FS9NMMS',
  pidescricao: ug === '200330' ? 'AUTOR 202645570012' : 'EVENTOS',
  naturezadespesa: '449052',
  naturezadespesadescricao: 'EQUIPAMENTOS E MATERIAL PERMANENTE',
  observacao: ug === '200330' ? 'VALOR QUE SE EMPENHA PARA ATENDER DESPESAS DA EMENDA PARLAMENTAR 45570012, DEP. FEDERAL' : 'DIARIAS',
  itens: [{ numitem: '001', subitem: '52', quantidade: '16.00000', valortotal: '5683680.00' }]
});
// 2026NE000999: o Tesouro não tem a nota na 200330
const padrao = async (ug: string, numero: string): Promise<any> => (numero === '2026NE000999' && ug === '200330' ? null : respostaSta(ug, numero));
const fetchNota = vi.fn(padrao);
vi.mock('../api', () => ({ fetchNotaDoTesouro: (u: string, n: string) => fetchNota(u, n) }));

import { consultarNotaNasDuasUgs, consultarNotaNoPortal, dataDoPortal, normalizarNotaDoTesouro, sincronizarNotasDasEmendasDoTesouro } from '../notasEmendasTesouroSyncService';
import type { ResultadoSincronizacao } from '../sincronizacaoFontesService';

const mensagem = (r: ResultadoSincronizacao) => ('mensagem' in r ? r.mensagem : undefined);

beforeEach(() => {
  rpc.mockClear();
  fetchNota.mockClear();
  fetchNota.mockImplementation(padrao);
  fila = [];
  doPortal = [];
});

describe('normalizarNotaDoTesouro', () => {
  it('fica só com os campos da gravação', () => {
    expect(normalizarNotaDoTesouro(respostaSta('200330', '2026NE000043'))).toEqual({
      ug: '200330',
      numero: '2026NE000043',
      emissao: '2026-03-27',
      nome: 'GENERAL MOTORS DO BRASIL LTDA',
      cpfcnpjugidgener: '59.275.792/0001-50',
      picodigo: 'SP999S94557',
      pidescricao: 'AUTOR 202645570012',
      naturezadespesa: '449052',
      naturezadespesadescricao: 'EQUIPAMENTOS E MATERIAL PERMANENTE',
      observacao: 'VALOR QUE SE EMPENHA PARA ATENDER DESPESAS DA EMENDA PARLAMENTAR 45570012, DEP. FEDERAL'
    });
  });
  it('leva a descrição da nota, que vale quando o plano interno do SIAFI não é o da emenda', () => {
    expect(normalizarNotaDoTesouro({ ...respostaSta('200330', '2026NE000380'), observacao: '  ' })?.observacao).toBeNull();
    expect(normalizarNotaDoTesouro({ ...respostaSta('200330', '2026NE000380'), observacao: 'X'.repeat(3000) })?.observacao).toHaveLength(2000);
  });
  it('descarta resposta sem UG ou sem número de nota', () => {
    expect(normalizarNotaDoTesouro(null)).toBeNull();
    expect(normalizarNotaDoTesouro({ ug: '200330', numero: 'XPTO' })).toBeNull();
    expect(normalizarNotaDoTesouro({ numero: '2026NE000043' })).toBeNull();
  });
});

describe('consultarNotaNasDuasUgs', () => {
  it('pergunta nas duas UGs e devolve as que o Tesouro tem', async () => {
    expect((await consultarNotaNasDuasUgs('2026NE000043')).map((n) => n.ug)).toEqual(['200330', '200331']);
    expect((await consultarNotaNasDuasUgs('2026NE000999')).map((n) => n.ug)).toEqual(['200331']);
    expect(fetchNota).toHaveBeenCalledWith('200330', '2026NE000043');
    expect(fetchNota).toHaveBeenCalledWith('200331', '2026NE000043');
  });
});

describe('sincronizarNotasDasEmendasDoTesouro', () => {
  it('sem fila: sucesso sem consultar o Tesouro', async () => {
    const r = await sincronizarNotasDasEmendasDoTesouro();
    expect(r).toMatchObject({ status: 'SUCESSO', total: 0 });
    expect(fetchNota).not.toHaveBeenCalled();
  });

  it('manda cada nota consultada à gravação, com as respostas das duas UGs', async () => {
    fila = ['2026NE000043', '2026NE000999'];
    const r = await sincronizarNotasDasEmendasDoTesouro({ concorrencia: 1 });
    const gravacoes = rpc.mock.calls.filter(([n]) => n === 'gravar_notas_do_tesouro').map(([, a]) => a);
    expect(gravacoes).toEqual([
      { p_consultadas: ['2026NE000043'], p_notas: [expect.objectContaining({ ug: '200330' }), expect.objectContaining({ ug: '200331' })] },
      { p_consultadas: ['2026NE000999'], p_notas: [expect.objectContaining({ ug: '200331' })] }
    ]);
    expect(r).toMatchObject({ status: 'SUCESSO', total: 1 });
    expect(mensagem(r)).toContain('1 TESOURO_SEM_A_NOTA');
  });

  it('falha do Tesouro: a nota não vai à gravação e fica para a próxima (PARCIAL)', async () => {
    fila = ['2026NE000043', '2026NE000500'];
    fetchNota.mockImplementation(async (ug: string, numero: string) => {
      if (numero === '2026NE000500') throw new Error('Tesouro (STA) não respondeu em 30 s.');
      return respostaSta(ug, numero);
    });
    const r = await sincronizarNotasDasEmendasDoTesouro({ concorrencia: 2 });
    const consultadas = rpc.mock.calls.filter(([n]) => n === 'gravar_notas_do_tesouro').map(([, a]) => a.p_consultadas[0]);
    expect(consultadas).toEqual(['2026NE000043']);
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1 });
    expect(mensagem(r)).toContain('1 com falha');
  });

  it('respeita o orçamento de tempo', async () => {
    fila = ['2026NE000043', '2026NE000044', '2026NE000045'];
    let t = 0;
    const r = await sincronizarNotasDasEmendasDoTesouro({ concorrencia: 1, orcamentoMs: 10, agora: () => (t += 6) });
    expect(r).toMatchObject({ status: 'PARCIAL' });
    expect(mensagem(r)).toContain('ficam para a próxima');
  });
});

// Portal da Transparência (migration 192), no formato da documentação da API: documentos da emenda
// (DocumentoRelacionadoEmendaDTO) e o documento da nota (DespesasPorDocumentoDTO). Pedido 468, carabinas.
const portal = (caminho: string): unknown => {
  if (caminho.startsWith('/api-transparencia/api-de-dados/emendas/documentos/202643260010?pagina=1')) {
    return [
      { data: '27/07/2026', fase: 'Empenho', codigoDocumento: '200330000012026NE000309', codigoDocumentoResumido: '2026NE000309' },
      { data: '27/07/2026', fase: 'Empenho', codigoDocumento: '200330000012026NE000310', codigoDocumentoResumido: '2026NE000310' }
    ];
  }
  if (caminho.startsWith('/api-transparencia/api-de-dados/emendas/documentos/')) return [];
  if (caminho === '/api-transparencia/api-de-dados/despesas/documentos/200330000012026NE000309') {
    return { data: '27/07/2026', codigoFavorecido: '***.379.061-**', nomeFavorecido: 'MARCELO SILVEIRA DA COSTA', autor: 'CORONEL ASSIS / EMENDA 10' };
  }
  throw new Error(`caminho inesperado: ${caminho}`);
};
const fetcherDoPortal = vi.fn(async (url: string) => new Response(JSON.stringify(portal(url)), { status: 200 }));
const semEspera = async () => undefined;

describe('Portal: notas que o Tesouro não descreve (migration 192)', () => {
  it('data do Portal em dd/mm/aaaa vira aaaa-mm-dd', () => {
    expect(dataDoPortal('27/07/2026')).toBe('2026-07-27');
    expect(dataDoPortal('2026-07-27T00:00:00')).toBe('2026-07-27');
    expect(dataDoPortal('')).toBeNull();
  });

  it('acha a nota nos documentos da emenda e lê o favorecido', async () => {
    const consultar = (c: string) => Promise.resolve(portal(`/api-transparencia/api-de-dados${c}`));
    expect(await consultarNotaNoPortal({ numero: '2026NE000309', emenda: '43260010', anos: [2026] }, consultar)).toEqual({
      numero: '2026NE000309',
      emenda_codigo: '202643260010',
      autor: 'CORONEL ASSIS / EMENDA 10',
      data: '2026-07-27',
      favorecido_codigo: '***.379.061-**',
      favorecido_nome: 'MARCELO SILVEIRA DA COSTA'
    });
    // Nota que a emenda não tem: volta sem a emenda, para a gravação registrar a consulta.
    expect(await consultarNotaNoPortal({ numero: '2026NE000999', emenda: '43260010', anos: [2026, 2025] }, consultar)).toMatchObject({ emenda_codigo: null });
  });

  it('roda antes da fila do Tesouro, com a chave, e grava pela função do Portal', async () => {
    doPortal = [{ numero_oficial: '2026NE000309', emenda: '43260010', anos: [2026] }];
    const r = await sincronizarNotasDasEmendasDoTesouro({ chave: 'k', fetcher: fetcherDoPortal as unknown as typeof fetch, esperar: semEspera });
    const gravacoes = rpc.mock.calls.filter(([n]) => n === 'gravar_notas_pelo_portal').map(([, a]) => a.p_notas[0]);
    expect(gravacoes).toEqual([expect.objectContaining({ numero: '2026NE000309', emenda_codigo: '202643260010', favorecido_nome: 'MARCELO SILVEIRA DA COSTA' })]);
    expect(fetcherDoPortal).toHaveBeenCalledWith(expect.stringContaining('/emendas/documentos/202643260010'), expect.objectContaining({ headers: expect.objectContaining({ 'chave-api-dados': 'k' }) }));
    expect(r).toMatchObject({ status: 'SUCESSO', total: 1 });
    expect(mensagem(r)).toContain('1 de 1 nota(s) que o Tesouro não descreve consultada(s) no Portal da Transparência, 1 gravada(s)');
  });

  it('sem a chave do Portal, o passo fica de fora', async () => {
    doPortal = [{ numero_oficial: '2026NE000309', emenda: '43260010', anos: [2026] }];
    const r = await sincronizarNotasDasEmendasDoTesouro();
    expect(rpc.mock.calls.some(([n]) => n === 'notas_das_emendas_pelo_portal' || n === 'gravar_notas_pelo_portal')).toBe(false);
    expect(r).toMatchObject({ status: 'SUCESSO', total: 0 });
  });
});

