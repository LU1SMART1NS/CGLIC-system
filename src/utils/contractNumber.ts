/**
 * Número de exibição do contrato ("00065/2021"), resistente às variações das
 * fontes: número que já traz o ano ("00065/2021"), ano repetido
 * ("00065/2021/2021") e número colado ao ano ("000652021").
 */
export function formatContractNumber(contract: {
  numero?: string | number | null;
  ano?: string | number | null;
  numeroFormatado?: string | null;
}): string {
  const numero = String(contract.numero ?? '').trim();
  const ano = String(contract.ano ?? '').trim();

  const collapse = (value: string) => value.replace(/(\/\d{4})(\/\d{4})+$/, (_, first) => first);

  if (numero.includes('/')) return collapse(numero);
  if (numero && ano) return `${numero}/${ano}`;
  return collapse(String(contract.numeroFormatado ?? numero).trim());
}

/** "001602026" -> "00160/2026"; mantém o que já vier com barra ou fora do padrão. */
export const formatNumeroContrato = (num: string, ano?: string | number): string => {
  const raw = (num || '').trim();
  if (!raw || raw.includes('/') || /\D/.test(raw)) return raw;
  const anoStr = String(ano ?? '').replace(/\D/g, '');
  if (anoStr.length === 4 && raw.length > 4 && raw.endsWith(anoStr)) return `${raw.slice(0, -4)}/${anoStr}`;
  if (raw.length > 4 && /^20\d{2}$/.test(raw.slice(-4))) return `${raw.slice(0, -4)}/${raw.slice(-4)}`;
  return anoStr.length === 4 ? `${raw}/${anoStr}` : raw;
};

/** Número de exibição de um contrato do catálogo, mesmo quando `numero` e `numeroFormatado` vêm sem barra. */
export const displayContractNumber = (c: { numero?: string | number | null; ano?: string | number | null; numeroFormatado?: string | null }): string => {
  const numero = String(c.numero ?? '').trim();
  if (numero) return formatNumeroContrato(numero, c.ano ?? undefined);
  return formatNumeroContrato(String(c.numeroFormatado ?? '').trim(), c.ano ?? undefined);
};

/** "200330-00067-2021" -> "00067/2021"; devolve a entrada se não for uma chave "UASG-número-ano". */
export const formatContractKey = (key: string): string => {
  const m = String(key ?? '').trim().match(/^\d{6}-(\d+)-(\d{4})$/);
  return m ? `${m[1]}/${m[2]}` : String(key ?? '').trim();
};
