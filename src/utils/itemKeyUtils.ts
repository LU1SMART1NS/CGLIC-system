/**
 * Módulo Canônico de Identidade e Normalização de item_key (SaldoARP 3.0)
 * 
 * Regra Arquitetural:
 * - PK Técnica: itens_ata.id (UUID)
 * - Business Key: item_key = `${numeroAta}-${uasg}-${Pad5(numeroItem)}`
 */

/**
 * Normaliza e sanitiza o número do item para exatamente 5 dígitos com zeros à esquerda.
 * Ex: 1 -> "00001", "001" -> "00001", "00001" -> "00001", "Item 2" -> "00002"
 */
export function normalizeItemNumber(itemNum: string | number | undefined | null): string {
  if (itemNum === undefined || itemNum === null) return '00001';
  const digitsOnly = String(itemNum).replace(/\D/g, '');
  const parsed = parseInt(digitsOnly, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return '00001';
  }
  return String(parsed).padStart(5, '0');
}

/**
 * Normaliza a UASG / Unidade Gerenciadora para dígitos limpos (padrão 6 dígitos: 200331)
 */
export function normalizeUasg(uasg?: string | number | null): string {
  if (!uasg) return '200331';
  const clean = String(uasg).replace(/\D/g, '').trim();
  return clean || '200331';
}

/**
 * Normaliza o número da Ata de Registro de Preços.
 * Ex: "00037/2026" -> "00037/2026", "37/2026" -> "00037/2026"
 */
export function normalizeAtaNumber(numeroAta?: string | null): string {
  if (!numeroAta) return '';
  const trimmed = numeroAta.trim();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    const numDigits = parts[0].replace(/\D/g, '');
    const yearDigits = parts[1].replace(/\D/g, '');
    const parsedNum = parseInt(numDigits, 10);
    if (!isNaN(parsedNum) && yearDigits) {
      const fullYear = yearDigits.length === 2 ? `20${yearDigits}` : yearDigits;
      return `${String(parsedNum).padStart(5, '0')}/${fullYear}`;
    }
  }
  return trimmed;
}

/**
 * Gera a Chave de Negócio (Business Key) determinística universal do Item.
 * Formato canônico: `${numeroAta}-${uasg}-${numeroItemPad5}`
 * Exemplo: "00037/2026-200331-00001"
 */
export function normalizeItemKey(
  numeroAta: string | undefined | null,
  uasg: string | number | undefined | null,
  itemNum: string | number | undefined | null
): string {
  const cleanAta = normalizeAtaNumber(numeroAta);
  const cleanUasg = normalizeUasg(uasg);
  const cleanItem = normalizeItemNumber(itemNum);
  return `${cleanAta}-${cleanUasg}-${cleanItem}`;
}

/**
 * Desconverte uma chave de negócio com segurança em seus componentes atômicos.
 */
export function parseItemKey(key: string): {
  numeroAta: string;
  uasg: string;
  itemNum: string;
  itemNumInteger: number;
} {
  if (!key) {
    return {
      numeroAta: '',
      uasg: '200331',
      itemNum: '00001',
      itemNumInteger: 1
    };
  }

  const parts = key.trim().split('-');
  if (parts.length >= 3) {
    const rawItem = parts.pop()!;
    const rawUasg = parts.pop()!;
    const rawAta = parts.join('-');
    const cleanItem = normalizeItemNumber(rawItem);
    return {
      numeroAta: normalizeAtaNumber(rawAta),
      uasg: normalizeUasg(rawUasg),
      itemNum: cleanItem,
      itemNumInteger: parseInt(cleanItem, 10)
    };
  }

  // Fallback para chaves parciais legadas
  const rawItem = parts[parts.length - 1] || '1';
  const cleanItem = normalizeItemNumber(rawItem);
  return {
    numeroAta: normalizeAtaNumber(parts[0] || ''),
    uasg: '200331',
    itemNum: cleanItem,
    itemNumInteger: parseInt(cleanItem, 10)
  };
}
