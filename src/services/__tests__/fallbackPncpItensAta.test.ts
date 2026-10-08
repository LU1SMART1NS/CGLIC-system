import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArpItems, limparCachesAtas } from '../api';

/**
 * Fallback do PNCP em fetchArpItems. Em 06/10/2026 ele gravou itens de outra ata em sete atas: o PNCP lista os itens
 * da compra (não da ata), devolvia só 10 por página, e a trava "um fornecedor só" olhava só esses 10.
 * Regra agora: sem o fornecedor da ata, só atribui itens pelo PNCP se a compra gerou uma ata só.
 */

const CNPJ = '00394494000136';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Compras.gov.br responde 200, mas só com itens de OUTRA ata (a ata pedida não aparece): é o que dispara o fallback.
const comprasSemAAta = () => json({ resultado: [{ numeroAtaRegistroPreco: '00099/2024', numeroItem: '00001', niFornecedor: '99999999000199' }], paginasRestantes: 0 });

const itensDaCompra = (n: number) => Array.from({ length: n }, (_, i) => ({ numeroItem: i + 1, descricao: `Item ${i + 1}`, quantidade: 10, valorUnitarioEstimado: 1 }));
const resultado = (ni: string) => [{ niFornecedor: ni, nomeRazaoSocialFornecedor: `Fornecedor ${ni}`, valorUnitarioHomologado: 2, quantidadeHomologada: 5 }];

function mockFetch(opcoes: { atasNaCompra: number | 'falha'; itens?: number; fornecedorDoItem?: (n: number) => string }) {
  const chamadas: string[] = [];
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    chamadas.push(url);
    if (url.startsWith('/api-arp/')) return comprasSemAAta();
    if (/\/compras\/\d{4}\/\d+\/atas$/.test(url)) {
      return opcoes.atasNaCompra === 'falha' ? new Response('', { status: 429 }) : json({ data: [], totalRegistros: opcoes.atasNaCompra });
    }
    const res = url.match(/\/itens\/(\d+)\/resultados$/);
    if (res) return json(resultado(opcoes.fornecedorDoItem ? opcoes.fornecedorDoItem(Number(res[1])) : '11111111000111'));
    if (/\/itens\?tamanhoPagina=500$/.test(url)) return json(itensDaCompra(opcoes.itens ?? 2));
    throw new Error(`URL não prevista no teste: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, chamadas };
}

// Ata 00021/2024: segunda ata da compra 390/2024 (a mesma compra da ata 00020/2024, de outro fornecedor).
const ctxAta21 = { numeroControlePncpAta: `${CNPJ}-1-000390/2024-000002`, anoCompra: '2024', numeroCompra: '90002' };
// Ata 00069/2025: única ata da compra 1102/2025 (só existe no PNCP).
const ctxAta69 = { numeroControlePncpAta: `${CNPJ}-1-001102/2025-000001`, anoCompra: '2025', numeroCompra: '1102' };

describe('fetchArpItems — fallback do PNCP só quando os itens são certamente da ata', () => {
  beforeEach(() => limparCachesAtas());
  afterEach(() => vi.unstubAllGlobals());

  it('compra com várias atas e fornecedor desconhecido: não carrega item nenhum nem consulta os itens da compra', async () => {
    const { chamadas } = mockFetch({ atasNaCompra: 4 });
    const r = await fetchArpItems('2024-08-08', '200331', '00021/2024', ctxAta21, { estrito: true });
    expect(r.resultado).toEqual([]);
    expect(chamadas.some((u) => /\/compras\/2024\/390\/atas$/.test(u))).toBe(true);
    expect(chamadas.some((u) => /\/compras\/2024\/390\/itens/.test(u))).toBe(false);
  });

  it('compra com uma ata só e um fornecedor só: os itens vêm do PNCP, pedindo todas as páginas de uma vez', async () => {
    const { chamadas } = mockFetch({ atasNaCompra: 1, itens: 6 });
    const r = await fetchArpItems('2025-09-01', '200331', '00069/2025', ctxAta69, { estrito: true });
    expect(r.resultado.map((i) => i.numeroItem)).toEqual(['00001', '00002', '00003', '00004', '00005', '00006']);
    expect(chamadas).toContain(`/api-pncp/api/pncp/v1/orgaos/${CNPJ}/compras/2025/1102/itens?tamanhoPagina=500`);
  });

  it('compra com uma ata só, mas itens de fornecedores diferentes: não carrega nada', async () => {
    mockFetch({ atasNaCompra: 1, itens: 3, fornecedorDoItem: (n) => (n === 3 ? '22222222000122' : '11111111000111') });
    const r = await fetchArpItems('2025-09-01', '200331', '00069/2025', ctxAta69, { estrito: true });
    expect(r.resultado).toEqual([]);
  });

  it('PNCP não informa quantas atas a compra tem: na dúvida, ata sem itens', async () => {
    const { chamadas } = mockFetch({ atasNaCompra: 'falha' });
    const r = await fetchArpItems('2025-09-01', '200331', '00069/2025', ctxAta69, { estrito: true });
    expect(r.resultado).toEqual([]);
    expect(chamadas.some((u) => /\/compras\/2025\/1102\/itens/.test(u))).toBe(false);
  });
});
