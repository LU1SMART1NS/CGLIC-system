// Itens da planilha (carga de 11/11/2026) ainda sem item da ata: grupos para conferir e a sugestão de item.
import type { EntregaFiscalizacao, ItemDaAtaDoContrato } from '../services/fiscalizacaoService';

/** Mesmo texto escrito de jeitos diferentes: sem acento, minúsculas, só letras e números. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Item da planilha que ainda não tem item da ata. */
export const semItemDaAta = (e: EntregaFiscalizacao) => !e.itemKey;

export interface GrupoALigar {
  /** contrato + texto da planilha normalizado */
  chave: string;
  contractKey: string;
  contratoNumero: string;
  /** Como foi escrito na planilha (a grafia mais comum). */
  texto: string;
  es: EntregaFiscalizacao[];
}

/** Agrupa por contrato e texto da planilha: uma escolha liga todos os itens do grupo. Os maiores primeiro. */
export function gruposALigar(es: EntregaFiscalizacao[]): GrupoALigar[] {
  const m = new Map<string, GrupoALigar>();
  for (const e of es.filter(semItemDaAta)) {
    const texto = e.itemTexto ?? e.itemNome ?? '';
    const chave = `${e.contractKey}|${normalizar(texto)}`;
    const g = m.get(chave) ?? { chave, contractKey: e.contractKey, contratoNumero: e.contratoNumero, texto, es: [] };
    g.es.push(e);
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.es.length - a.es.length || a.texto.localeCompare(b.texto, 'pt-BR'));
}

/**
 * Sugestão (não liga sozinho): o único item do contrato cujo nome curto ou descrição contém o texto da planilha, ou cujo
 * nome curto aparece dentro dele. O que a regra automática liga (contrato com um item; nome curto igual) já chega ligado.
 */
export function sugestaoDeItem(texto: string, itens: ItemDaAtaDoContrato[]): string | null {
  const t = normalizar(texto);
  if (!t) return null;
  const casam = itens.filter((i) => {
    const nc = normalizar(i.nome);
    const de = normalizar(i.descricao);
    return (de && de.includes(t)) || (nc && (nc.includes(t) || t.includes(nc)));
  });
  return casam.length === 1 ? casam[0].itemKey : null;
}
