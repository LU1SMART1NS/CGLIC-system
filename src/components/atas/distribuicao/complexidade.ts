/**
 * Complexidade de gestão de cada instrumento, em três faixas com regras visíveis, para medir a carga
 * estrutural de cada gestor. Limites calibrados com a carteira vigente real (out/2026): as atas daqui
 * são quase sempre de um fornecedor e um item, e os contratos quase sempre compras de entrega única.
 */
export type NivelComplexidade = 'ALTA' | 'MEDIA' | 'BAIXA';

export interface Complexidade {
  nivel: NivelComplexidade;
  /** Por que caiu nesta faixa, em linguagem do usuário (ex.: "Serviços · 24 meses"). */
  motivo: string;
}

/** Peso de cada faixa na carga equivalente (Baixa = 1, Média = 2, Alta = 3). */
export const PESO_COMPLEXIDADE: Record<NivelComplexidade, number> = { BAIXA: 1, MEDIA: 2, ALTA: 3 };

export const ROTULO_COMPLEXIDADE: Record<NivelComplexidade, string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };

/** Ata: Alta com 6+ itens ou 2+ fornecedores; Baixa com 1 item; Média de 2 a 5 itens (ou sem itens no banco). */
export const ATA_ALTA_MIN_ITENS = 6;
export const ATA_ALTA_MIN_FORNECEDORES = 2;

export function classificarAta(itens: number, fornecedores: number): Complexidade {
  const txtItens = `${itens} ${itens === 1 ? 'item' : 'itens'}`;
  const txtForn = `${fornecedores} ${fornecedores === 1 ? 'fornecedor' : 'fornecedores'}`;
  if (itens === 0) return { nivel: 'MEDIA', motivo: 'Sem itens no banco' };
  if (itens >= ATA_ALTA_MIN_ITENS || fornecedores >= ATA_ALTA_MIN_FORNECEDORES) {
    return { nivel: 'ALTA', motivo: fornecedores >= ATA_ALTA_MIN_FORNECEDORES ? `${txtItens} · ${txtForn}` : txtItens };
  }
  if (itens === 1) return { nivel: 'BAIXA', motivo: txtItens };
  return { nivel: 'MEDIA', motivo: txtItens };
}

/** Meses entre o início e o fim da vigência (`null` sem as duas datas). */
export function mesesDeVigencia(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / (30.44 * 24 * 60 * 60 * 1000));
}

/** Obra e serviço de engenharia pedem medição e fiscalização técnica: Alta em qualquer duração. */
const SEMPRE_ALTA = /obra|engenharia/i;
const COMPRA = /^compras?$/i;

/**
 * Contrato pela categoria do Contratos.gov.br e pela duração da vigência:
 * Alta = serviço/TIC com 12+ meses (execução continuada) ou obra/engenharia; Baixa = compra de até 12 meses
 * (entrega única; a vigência padrão de um ano entra aqui); Média = o resto, inclusive sem categoria ("A definir").
 */
export function classificarContrato(categoria: string | undefined, meses: number | null): Complexidade {
  const cat = (categoria || '').trim();
  const txtMeses = meses === null ? 'vigência sem datas' : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  if (!cat || /a definir/i.test(cat)) return { nivel: 'MEDIA', motivo: `Sem categoria · ${txtMeses}` };
  if (SEMPRE_ALTA.test(cat)) return { nivel: 'ALTA', motivo: `${cat} · ${txtMeses}` };
  if (COMPRA.test(cat)) {
    return meses !== null && meses <= 12
      ? { nivel: 'BAIXA', motivo: `Compra · ${txtMeses}` }
      : { nivel: 'MEDIA', motivo: `Compra · ${txtMeses}` };
  }
  return meses !== null && meses >= 12
    ? { nivel: 'ALTA', motivo: `${cat} · ${txtMeses}` }
    : { nivel: 'MEDIA', motivo: `${cat} · ${txtMeses}` };
}
