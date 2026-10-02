/** Partes de uma chave de item "00059/2025-200331-00001" (ata, UASG gerenciadora, item). */
export function parseItemKey(itemKey: string): { numeroAta: string; uasg: string; numeroItem: string } | null {
  const m = /^(\d{5}\/\d{4})-(\d{6})-(\d{5})$/.exec((itemKey || '').trim());
  return m ? { numeroAta: m[1], uasg: m[2], numeroItem: m[3] } : null;
}

/** Texto curto do item para tabelas: "Ata 00059/2025 · Item 1". */
export function formatItemKeyLabel(itemKey: string): string {
  const p = parseItemKey(itemKey);
  return p ? `Ata ${p.numeroAta} · Item ${parseInt(p.numeroItem, 10)}` : itemKey;
}
