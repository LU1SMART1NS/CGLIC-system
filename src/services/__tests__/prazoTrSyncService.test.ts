import { describe, expect, it } from 'vitest';
import { lerPrazoDaCompra, partesDaCompra, paginaDaCompra } from '../prazoTrSyncService';
import type { LeitorDeArquivos } from '../reajusteAtasSyncService';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const resposta = (corpo: string | Uint8Array, tipo = 'application/json') => new Response(corpo as BodyInit, { status: 200, headers: { 'content-type': tipo } });

function fetcherCom(arquivos: unknown[]): typeof fetch {
  return (async (url: string) => (String(url).endsWith('/arquivos') ? resposta(JSON.stringify(arquivos)) : resposta(PDF, 'application/pdf'))) as typeof fetch;
}
const leitorCom = (texto: string): LeitorDeArquivos => ({ textoDoPdf: async () => texto, arquivosDoZip: async () => [] });
const ctx = (arquivos: unknown[], texto: string) => ({ leitor: leitorCom(texto), fetcher: fetcherCom(arquivos), esperar: async () => {}, restaMs: () => 90_000 });

describe('leitura do TR das atas novas (migration 303)', () => {
  it('endereço da compra e página no PNCP', () => {
    const p = partesDaCompra('00394494000136-1-001038/2025')!;
    expect(p).toEqual({ cnpj: '00394494000136', sequencial: 1038, ano: '2025' });
    expect(paginaDaCompra(p)).toBe('https://pncp.gov.br/app/editais/00394494000136/2025/1038');
    expect(partesDaCompra('00071/2025')).toBeNull();
  });
  it('lê o TR antes do edital e grava a sugestão com o documento', async () => {
    const arquivos = [
      { sequencialDocumento: 1, tipoDocumentoNome: 'Edital', titulo: 'edital.zip', url: 'https://pncp.gov.br:14986/pncp-api/v1/x/1' },
      { sequencialDocumento: 4, tipoDocumentoNome: 'Termo de Referência', titulo: '80/2025.pdf', url: 'https://pncp.gov.br:14986/pncp-api/v1/x/4' }
    ];
    const r = await lerPrazoDaCompra('00394494000136-1-001637/2025', ctx(arquivos, 'O prazo de entrega dos bens é de 30 (trinta) dias, contados da assinatura do contrato, em remessa única.'));
    expect(r).toMatchObject({ leitura: 'CLARO', dias: 30, inicio: 'ASSINATURA', documento: 'Termo de Referência (80/2025.pdf)', url: 'https://pncp.gov.br/app/editais/00394494000136/2025/1637' });
  });
  it('compra sem edital nem TR no PNCP: sem cláusula, com o motivo', async () => {
    const r = await lerPrazoDaCompra('00394494000136-1-000001/2026', ctx([{ sequencialDocumento: 1, tipoDocumentoNome: 'Outros Documentos', url: 'x' }], ''));
    expect(r).toMatchObject({ leitura: 'SEM_CLAUSULA', motivo: 'sem edital ou Termo de Referência no PNCP', documento: null });
  });
  it('sem tempo para a compra: devolve nada (fica para a próxima)', async () => {
    const r = await lerPrazoDaCompra('00394494000136-1-001637/2025', { ...ctx([{ sequencialDocumento: 4, tipoDocumentoNome: 'Termo de Referência', url: 'x' }], 'x'), restaMs: () => 5_000 });
    expect(r).toBeNull();
  });
});
