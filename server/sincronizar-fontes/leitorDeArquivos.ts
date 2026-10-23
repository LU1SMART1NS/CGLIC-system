/**
 * Leitor de PDF e zip do servidor, usado só pelo recurso 'reajuste_atas' (editais e apostilamentos do PNCP).
 *
 * As bibliotecas não entram no package.json do app: o unpdf traz como opcional um pacote nativo (canvas)
 * que o build da Vercel tentaria compilar. No pacote da Edge Function elas ficam como `npm:` com versão
 * fixa (scripts/build-sincronizar-fontes.mjs mantém os `npm:` de fora) e o Deno baixa na implantação.
 * O import é dinâmico: os outros recursos não carregam o leitor de PDF.
 */
import type { LeitorDeArquivos } from '../../src/services/reajusteAtasSyncService';

export interface ModuloUnpdf {
  getDocumentProxy(dados: Uint8Array): Promise<unknown>;
  extractText(documento: unknown, opcoes: { mergePages: true }): Promise<{ totalPages: number; text: string }>;
}
export interface ModuloFflate {
  unzipSync(dados: Uint8Array): Record<string, Uint8Array>;
}

export interface CarregadoresDoLeitor {
  unpdf: () => Promise<ModuloUnpdf>;
  fflate: () => Promise<ModuloFflate>;
}

const CARREGADORES_DO_DENO: CarregadoresDoLeitor = {
  unpdf: () => import('npm:unpdf@0.12.1') as Promise<ModuloUnpdf>,
  fflate: () => import('npm:fflate@0.8.2') as Promise<ModuloFflate>
};

export function criarLeitorDeArquivos(carregar: CarregadoresDoLeitor = CARREGADORES_DO_DENO): LeitorDeArquivos {
  let unpdf: Promise<ModuloUnpdf> | null = null;
  let fflate: Promise<ModuloFflate> | null = null;
  return {
    async textoDoPdf(bytes) {
      unpdf ??= carregar.unpdf();
      const m = await unpdf;
      // O pdf.js toma posse do buffer: passa uma cópia.
      const documento = await m.getDocumentProxy(new Uint8Array(bytes));
      const { text } = await m.extractText(documento, { mergePages: true });
      return text;
    },
    async arquivosDoZip(bytes) {
      fflate ??= carregar.fflate();
      const entradas = (await fflate).unzipSync(bytes);
      // Os editais vêm com nomes em CP850 ("Refer?ncia"); só o nome do arquivo e a extensão importam.
      return Object.entries(entradas)
        .filter(([nome, dados]) => !nome.endsWith('/') && dados.length > 0)
        .map(([nome, dados]) => ({ nome: nome.split('/').pop() ?? nome, bytes: dados }));
    }
  };
}
