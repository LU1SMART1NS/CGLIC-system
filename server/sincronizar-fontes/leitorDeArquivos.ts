/**
 * Leitor de PDF e zip do servidor, usado só pelo recurso 'reajuste_atas' (editais e apostilamentos do PNCP).
 *
 * As bibliotecas não entram no package.json do app: o unpdf traz como opcional um pacote nativo (canvas)
 * que o build da Vercel tentaria compilar. No pacote da Edge Function elas ficam como `npm:` com versão
 * fixa (scripts/build-sincronizar-fontes.mjs mantém os `npm:` de fora) e o Deno baixa na implantação.
 * O import é dinâmico: os outros recursos não carregam o leitor de PDF.
 *
 * Memória (migration 161): o PDF é lido página a página até o limite pedido e fechado logo depois; do zip, só
 * os arquivos aceitos são descompactados.
 */
import type { LeitorDeArquivos } from '../../src/services/reajusteAtasSyncService';

interface ItemDeTexto { str?: string; hasEOL?: boolean }
interface PaginaPdf {
  getTextContent(): Promise<{ items: ItemDeTexto[] }>;
  cleanup?(): void;
}
interface DocumentoPdf {
  numPages: number;
  getPage(n: number): Promise<PaginaPdf>;
  destroy?(): Promise<void> | void;
}
export interface ModuloUnpdf {
  getDocumentProxy(dados: Uint8Array): Promise<unknown>;
}
export interface ModuloFflate {
  unzipSync(dados: Uint8Array, opts?: { filter?: (arquivo: { name: string; size: number; originalSize: number }) => boolean }): Record<string, Uint8Array>;
}

export interface CarregadoresDoLeitor {
  unpdf: () => Promise<ModuloUnpdf>;
  fflate: () => Promise<ModuloFflate>;
}

const CARREGADORES_DO_DENO: CarregadoresDoLeitor = {
  unpdf: () => import('npm:unpdf@0.12.1') as Promise<ModuloUnpdf>,
  fflate: () => import('npm:fflate@0.8.2') as Promise<ModuloFflate>
};

/** Nome do arquivo no zip: os editais vêm com nomes em CP850 ("Refer?ncia"); só o nome e a extensão importam. */
const nomeDoArquivo = (nome: string) => nome.split('/').pop() ?? nome;

export function criarLeitorDeArquivos(carregar: CarregadoresDoLeitor = CARREGADORES_DO_DENO): LeitorDeArquivos {
  let unpdf: Promise<ModuloUnpdf> | null = null;
  let fflate: Promise<ModuloFflate> | null = null;
  return {
    async textoDoPdf(bytes, opts = {}) {
      unpdf ??= carregar.unpdf();
      const m = await unpdf;
      // O pdf.js toma posse do buffer: passa uma cópia.
      const documento = (await m.getDocumentProxy(new Uint8Array(bytes))) as DocumentoPdf;
      try {
        const total = Math.min(documento.numPages, opts.maxPaginas ?? documento.numPages);
        let texto = '';
        for (let n = 1; n <= total; n++) {
          const pagina = await documento.getPage(n);
          const conteudo = await pagina.getTextContent();
          texto += conteudo.items.map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join('') + '\n';
          pagina.cleanup?.();
        }
        return texto;
      } finally {
        await documento.destroy?.();
      }
    },
    async arquivosDoZip(bytes, aceitar) {
      fflate ??= carregar.fflate();
      const entradas = (await fflate).unzipSync(bytes, {
        filter: (f) => !f.name.endsWith('/') && (!aceitar || aceitar(nomeDoArquivo(f.name), f.originalSize))
      });
      return Object.entries(entradas)
        .filter(([nome, dados]) => !nome.endsWith('/') && dados.length > 0)
        .map(([nome, dados]) => ({ nome: nomeDoArquivo(nome), bytes: dados }));
    }
  };
}
