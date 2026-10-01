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
