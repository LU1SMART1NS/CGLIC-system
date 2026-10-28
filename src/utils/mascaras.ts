/**
 * Máscaras dos campos digitados (aplicadas a cada tecla, no onChange). Cada uma devolve o texto que o
 * campo mostra; a leitura para gravar fica nas funções `ler…`/`…Valido`.
 */

/** Processo SEI montado enquanto se digita: 08020.012345/2025-11 (17 dígitos; o que passar disso é cortado). */
export function mascaraProcessoSei(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 17);
  let s = d.slice(0, 5);
  if (d.length > 5) s += `.${d.slice(5, 11)}`;
  if (d.length > 11) s += `/${d.slice(11, 15)}`;
  if (d.length > 15) s += `-${d.slice(15)}`;
  return s;
}

export function processoSeiValido(texto: string): boolean {
  return texto.replace(/\D/g, '').length === 17;
}

/** Documento SEI: só dígitos, até 10. */
export function mascaraDocumentoSei(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 10);
}

export function documentoSeiValido(texto: string): boolean {
  return /^\d{7,10}$/.test(texto.trim());
}

/**
 * Valor em reais com milhar e vírgula: 1.200.000,50. Aceita colar "R$ 1.200.000,00", "1200000" ou "1200000.50"
 * (ponto seguido de 1 ou 2 dígitos no fim, ou digitado por último, vale como vírgula). Com `anterior`, apagar um
 * caractere não transforma o ponto do milhar em vírgula ("1.200" → "1.20" vira "120").
 */
export function mascaraValorBR(texto: string, anterior = ''): string {
  let limpo = texto.replace(/[^\d.,]/g, '');
  const apagando = texto.length < anterior.length;
  if (!limpo.includes(',') && !apagando) {
    const ultimoPonto = limpo.lastIndexOf('.');
    const depois = ultimoPonto >= 0 ? limpo.slice(ultimoPonto + 1) : '';
    const gruposDeMilhar = /^\d{1,3}(\.\d{3})+$/.test(limpo);
    if (ultimoPonto >= 0 && depois.length <= 2 && !gruposDeMilhar) {
      limpo = `${limpo.slice(0, ultimoPonto)},${depois}`;
    }
  }
  const virgula = limpo.indexOf(',');
  const inteiro = (virgula >= 0 ? limpo.slice(0, virgula) : limpo).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const centavos = virgula >= 0 ? limpo.slice(virgula + 1).replace(/\D/g, '').slice(0, 2) : null;
  if (!inteiro && centavos === null) return '';
  const comMilhar = (inteiro || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return centavos === null ? comMilhar : `${comMilhar},${centavos}`;
}

/** "1.200.000,5" → 1200000.5; vazio ou inválido → null. */
export function lerValorBR(texto: string): number | null {
  if (!texto.trim()) return null;
  const n = Number(texto.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** CNPJ montado enquanto se digita: 00.000.000/0000-00 (14 dígitos). */
export function mascaraCnpj(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 14);
  let s = d.slice(0, 2);
  if (d.length > 2) s += `.${d.slice(2, 5)}`;
  if (d.length > 5) s += `.${d.slice(5, 8)}`;
  if (d.length > 8) s += `/${d.slice(8, 12)}`;
  if (d.length > 12) s += `-${d.slice(12)}`;
  return s;
}

/** CEP: 00000-000. */
export function mascaraCep(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Telefone com DDD: (61) 9999-0000 ou (61) 99999-0000. O hífen anda para a posição do celular no 11º dígito;
 * "+55" colado na frente é tirado.
 */
export function mascaraTelefone(texto: string): string {
  let d = texto.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  const corte = resto.length === 9 ? 5 : 4;
  return `${ddd}${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Percentual com vírgula: até 2 dígitos inteiros e 5 decimais (o PNCP publica índices como 4,72491). Ponto vira vírgula. */
export function mascaraPercentual(texto: string): string {
  const limpo = texto.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const virgula = limpo.indexOf(',');
  const inteiro = (virgula >= 0 ? limpo.slice(0, virgula) : limpo).slice(0, 2);
  if (virgula < 0) return inteiro;
  return `${inteiro || '0'},${limpo.slice(virgula + 1).replace(/,/g, '').slice(0, 5)}`;
}

/**
 * Ordem bancária no formato do Tesouro: 2026OB800123 (ano + OB + 6 dígitos). O "OB" entra sozinho depois do ano;
 * com `anterior`, apagar o "B" volta ao ano em vez de recolocar o "OB".
 */
export function mascaraOrdemBancaria(texto: string, anterior = ''): string {
  const d = texto.replace(/\D/g, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length === 4 && texto.length < anterior.length) return d.slice(0, 3);
  return `${d.slice(0, 4)}OB${d.slice(4)}`;
}

export function ordemBancariaValida(texto: string): boolean {
  return /^\d{4}OB\d{6}$/.test(texto.trim());
}
