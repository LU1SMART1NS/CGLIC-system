import { describe, expect, it, vi } from 'vitest';
import { lerNomesDaAta, testarNomeItemAta, type AtaDaFilaDoNome, type LeitorDePedacos } from '../nomeItemAtaSyncService';
import type { PaginaDoPdf } from '../nomeItemAtaParser';
import fixtures from './fixtures/nomeItemAta.json';

vi.mock('../supabaseClient', () => ({ supabase: null }));

type Fixture = Array<Array<[number, number, number, number, string]>>;
const paginas = (nome: keyof typeof fixtures): PaginaDoPdf[] => (fixtures[nome] as Fixture).map((pg) => pg.map(([x, y, w, h, s]) => ({ x, y, w, h, s })));

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const resposta = (corpo: string | Uint8Array, tipo = 'application/json') => new Response(corpo as BodyInit, { status: 200, headers: { 'content-type': tipo } });

function fetcherCom(arquivos: unknown[], bytes: Uint8Array = PDF) {
  const pedidos: string[] = [];
  const fetcher = (async (url: string) => {
    pedidos.push(String(url));
    return String(url).endsWith('/arquivos') ? resposta(JSON.stringify(arquivos)) : resposta(bytes, 'application/pdf');
  }) as typeof fetch;
  return { fetcher, pedidos };
}
const leitorCom = (pgs: PaginaDoPdf[]): LeitorDePedacos => ({ pedacosDoPdf: async () => pgs });

/** Título com o número da ata (a fixture da 00024/2026 só tem a tabela) + a tabela. */
const comTitulo = (numero: string, pgs: PaginaDoPdf[]): PaginaDoPdf[] => [
  [{ x: 187, y: 800, w: 160, h: 9, s: `ATA DE REGISTRO DE PREÇOS Nº ${numero}` }, ...pgs[0]],
  ...pgs.slice(1)
];

const ata: AtaDaFilaDoNome = {
  numero_controle_pncp: '00394494000136-1-001651/2025-000001',
  numero_ata: '00024/2026',
  codigo_uasg: '200331',
  tentativas: 0,
  itens: [
    { item_key: '00024/2026-200331-00002', numero_item: '00002', valor_unitario: 75000 },
    { item_key: '00024/2026-200331-00003', numero_item: '00003', valor_unitario: 65650 }
  ]
};
const arquivos = [
  { sequencialDocumento: 2, titulo: 'Termo aditivo', url: 'https://pncp.gov.br:14986/pncp-api/v1/x/2' },
  { sequencialDocumento: 1, titulo: 'Ata assinada', url: 'https://pncp.gov.br:14986/pncp-api/v1/x/1' }
];
const ctx = (f: typeof fetch, pgs: PaginaDoPdf[], restaMs = 90_000) => ({ leitor: leitorCom(pgs), fetcher: f, esperar: async () => {}, restaMs: () => restaMs });

describe('leitura do nome do item nas atas novas (migration 313)', () => {
  it('baixa o arquivo de menor sequencial da ata e devolve o nome por chave do item', async () => {
    const { fetcher, pedidos } = fetcherCom(arquivos);
    const r = await lerNomesDaAta(ata, ctx(fetcher, comTitulo('24/2026', paginas('ata24de2026'))));
    // No servidor, /api-pncp vira https://pncp.gov.br (proxyDeFontes).
    expect(pedidos[0]).toBe('/api-pncp/api/pncp/v1/orgaos/00394494000136/compras/2025/1651/atas/1/arquivos');
    expect(pedidos[1]).toBe('https://pncp.gov.br/pncp-api/v1/x/1');
    expect(r).toEqual({
      numero_controle_pncp: ata.numero_controle_pncp,
      nomes: [
        { item_key: '00024/2026-200331-00002', nome: 'Coletor de projéteis de alta energia, em fibra de aramida' },
        { item_key: '00024/2026-200331-00003', nome: 'Coletor de projéteis de baixa energia, em fibra de aramida' }
      ],
      sem_nome: [],
      motivo: null
    });
  });

  it('PDF de outra ata (00037/2026 com o da 27/2026): nada é gravado, com o motivo', async () => {
    const { fetcher } = fetcherCom(arquivos);
    const r = await lerNomesDaAta(ata, ctx(fetcher, comTitulo('27/2026', paginas('ata24de2026'))));
    expect(r).toMatchObject({ nomes: [], motivo: 'PDF do PNCP sem o número desta ata no título' });
    expect(r?.sem_nome).toHaveLength(2);
  });

  it('ata sem arquivo no PNCP e arquivo que não é PDF', async () => {
    expect(await lerNomesDaAta(ata, ctx(fetcherCom([]).fetcher, []))).toMatchObject({ nomes: [], motivo: 'ata sem arquivo no PNCP' });
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(await lerNomesDaAta(ata, ctx(fetcherCom(arquivos, zip).fetcher, []))).toMatchObject({ nomes: [], motivo: 'arquivo da ata não é PDF' });
  });

  it('sem tempo para a ata: devolve nada (fica para a próxima)', async () => {
    const r = await lerNomesDaAta(ata, ctx(fetcherCom(arquivos).fetcher, [], 5_000));
    expect(r).toBeNull();
  });

  it('mesmo número de controle em duas linhas de ata: o nome vale para as duas chaves', async () => {
    const dupla: AtaDaFilaDoNome = {
      ...ata,
      itens: [...ata.itens, { item_key: '00024/2026-200334-00002', numero_item: '00002', valor_unitario: 75000 }]
    };
    const r = await lerNomesDaAta(dupla, ctx(fetcherCom(arquivos).fetcher, comTitulo('24/2026', paginas('ata24de2026'))));
    expect(r?.nomes.map((n) => n.item_key)).toEqual(['00024/2026-200331-00002', '00024/2026-200334-00002', '00024/2026-200331-00003']);
  });

  it('teste (dry) sem a migration: avisa em vez de falhar', async () => {
    const r = await testarNomeItemAta({ leitor: leitorCom([]) });
    expect(String(r.observacao)).toContain('migration 313');
  });
});
