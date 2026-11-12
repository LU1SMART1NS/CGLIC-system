import type { UnidadeItemRecord } from '../types';

/**
 * Linhas repetidas da consulta 3_consultarUnidadesItem do Compras.gov.br.
 *
 * Desde 09/10/2026 a fonte às vezes devolve cada órgão duas vezes (ex.: ata 00071/2024 da 200331, item 27:
 * 80 linhas para 40 órgãos). As cópias só diferem no codigoPdm (o item ligado a dois PDMs do catálogo).
 * Somadas, elas dobravam o registrado de cada órgão.
 *
 * A chave inclui o fornecedor: no item com dois fornecedores cada órgão tem uma linha por fornecedor (uma
 * delas costuma vir com 0), e essas linhas são de verdade e se somam.
 *
 * Desde 24/10/2026 a fonte também devolve, em alguns itens, cada órgão uma vez com o fornecedor e outra com o
 * fornecedor em branco (" - "), com a mesma quantidade e as mesmas datas (ex.: 00055/2025 da 200331, item 1:
 * SENASP 306 virava 612). A linha em branco que repete a de um fornecedor com nome é cópia e sai.
 */

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const texto = (v: unknown) => String(v ?? '').trim();

export function chaveDaUnidade(u: Partial<UnidadeItemRecord>): string {
  return [digitos(u.codigoUnidade), digitos(u.numeroItem), texto(u.numeroAta), texto(u.fornecedor)].join('|');
}

/** Fornecedor em branco: sem letras nem números (a fonte manda " - "). */
export const fornecedorEmBranco = (v: unknown) => !/[0-9A-Za-zÀ-ÿ]/.test(String(v ?? ''));

/** Campos que precisam ser iguais nas cópias; codigoPdm e descricaoItem vêm do catálogo e podem variar. */
const CAMPOS_CONFERIDOS: ReadonlyArray<keyof UnidadeItemRecord> = [
  'nomeUnidade', 'tipoUnidade', 'quantidadeRegistrada', 'saldoRemanejamentoEmpenho', 'saldoAdesoes',
  'qtdLimiteAdesao', 'qtdLimiteInformadoCompra', 'aceitaAdesao',
  'dataHoraInclusao', 'dataHoraAtualizacao', 'dataHoraExclusao'
];

const valorConferido = (v: unknown) => (v === undefined || v === null || v === '' ? null : typeof v === 'number' ? v : String(v).trim());

export interface UnidadesSemRepeticao<T> {
  /** Uma linha por chave, na ordem em que apareceram (fica a primeira cópia). */
  unidades: T[];
  /** Quantas linhas repetidas e iguais foram tiradas. */
  repetidas: number;
  /** Chaves cujas cópias vieram diferentes (quantidade, datas...): a lista não é confiável. */
  divergentes: string[];
}

export function juntarUnidadesRepetidas<T extends Partial<UnidadeItemRecord>>(linhas: T[]): UnidadesSemRepeticao<T> {
  const primeira = new Map<string, T>();
  const divergentes = new Set<string>();
  let repetidas = 0;
  for (const linha of linhas) {
    const chave = chaveDaUnidade(linha);
    const anterior = primeira.get(chave);
    if (!anterior) {
      primeira.set(chave, linha);
      continue;
    }
    repetidas++;
    if (CAMPOS_CONFERIDOS.some((c) => valorConferido(anterior[c]) !== valorConferido(linha[c]))) divergentes.add(chave);
  }
  // Linha com o fornecedor em branco igual à de um fornecedor com nome (mesmo órgão, item, ata, quantidade e datas):
  // é cópia. Se a quantidade ou as datas forem outras, fica (o banco e a tela somam, como antes).
  const comNome = [...primeira.values()].filter((l) => !fornecedorEmBranco(l.fornecedor));
  const igual = (a: T, b: T) => CAMPOS_CONFERIDOS.every((c) => valorConferido(a[c]) === valorConferido(b[c]));
  const unidades = [...primeira.values()].filter((l) => {
    if (!fornecedorEmBranco(l.fornecedor)) return true;
    const copia = comNome.some(
      (n) => digitos(n.codigoUnidade) === digitos(l.codigoUnidade) && digitos(n.numeroItem) === digitos(l.numeroItem) && texto(n.numeroAta) === texto(l.numeroAta) && igual(n, l)
    );
    if (copia) repetidas++;
    return !copia;
  });
  return { unidades, repetidas, divergentes: [...divergentes] };
}
