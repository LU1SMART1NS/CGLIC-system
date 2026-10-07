/**
 * Limite do art. 75, II da Lei 14.133/2021 (dispensa para outros serviços e compras), atualizado todo ano por decreto
 * pelo IPCA-E (art. 182 da lei). Usado na IN SEGES 77/2022, art. 7º, § 2º: até este valor, os prazos de liquidação e
 * de pagamento caem pela metade. Os valores vêm da tabela limites_lei_14133_art75 (o coordenador cadastra o ano novo
 * em Regras de Alertas); a lista abaixo é a reserva enquanto o banco não responde.
 */
export interface LimiteArt75II {
  ano: number;
  valor: number;
  decreto: string;
}

export const LIMITES_ART_75_II_PADRAO: LimiteArt75II[] = [
  { ano: 2024, valor: 59906.02, decreto: 'Decreto 11.871/2023' },
  { ano: 2025, valor: 62725.59, decreto: 'Decreto 12.343/2024' },
  { ano: 2026, valor: 65492.11, decreto: 'Decreto 12.807/2025' }
];

let limitesEmVigor: LimiteArt75II[] = [...LIMITES_ART_75_II_PADRAO];

/** Aplica os limites lidos do banco (lista vazia mantém a reserva). */
export function aplicarLimitesArt75II(lista: LimiteArt75II[]): void {
  limitesEmVigor = lista.length > 0 ? [...lista].sort((a, b) => a.ano - b.ano) : [...LIMITES_ART_75_II_PADRAO];
}

export function listarLimitesArt75II(): LimiteArt75II[] {
  return [...limitesEmVigor];
}

/**
 * Limite em vigor no ano da data informada. Ano sem valor cadastrado usa o último conhecido e avisa
 * (`desatualizado`), para o coordenador cadastrar o decreto novo.
 */
export function limiteArt75II(dataISO?: string | null): LimiteArt75II & { desatualizado: boolean } {
  const ano = Number((dataISO ?? '').slice(0, 4)) || new Date().getFullYear();
  const ordenados = [...limitesEmVigor].sort((a, b) => a.ano - b.ano);
  const exato = ordenados.find((l) => l.ano === ano);
  if (exato) return { ...exato, desatualizado: false };
  const anteriores = ordenados.filter((l) => l.ano < ano);
  if (anteriores.length > 0) return { ...anteriores[anteriores.length - 1], desatualizado: true };
  return { ...ordenados[0], desatualizado: false };
}
