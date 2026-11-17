/**
 * Leitura do "Relatório Ata de Registro de Preços" do Contratos.gov.br (PDF), texto extraído pelo unpdf.
 *
 * Por que existe (17/11/2026): a consulta 3 do Compras.gov.br (3_consultarUnidadesItem) deixou de publicar
 * remanejamentos que o Contratos.gov.br já mostra (ata 00027/2026 item 15: 14 un. da PM-ES para a SENASP). A API do
 * Contratos.gov.br não tem rota de atas; o relatório em PDF é a única fonte. A leitura não inventa nada: o que não
 * for reconhecido vira aviso e o item fica de fora.
 *
 * Partes usadas do texto:
 * - "Unidade Gerenciadora 200331 - …" (UASG da ata) e "nº 00027/2026" (número da ata);
 * - "Relatório gerado através do Contratos.gov.br em 17/11/2026 11:35:58" (data do relatório, hora de Brasília);
 * - por item, "DETALHAMENTO DO ITEM 00015", "Quantidade homologada: 455" e a tabela "UNIDADE(S) ITEM 00015":
 *   "Código Unidade Tipo Qtd. registrada Qtd. disponível" em linhas que podem quebrar no nome do órgão e na página.
 */

export interface UnidadeDoRelatorio {
  uasg: string;
  nome: string;
  /** Como no relatório: "Gerenciadora", "Participante"… */
  tipo: string;
  quantidade: number;
  /** "Qtd. disponível para remanejamento/empenho". */
  saldo: number;
}

export interface ItemDoRelatorio {
  numeroItem: number;
  homologado: number | null;
  unidades: UnidadeDoRelatorio[];
  /** Soma do registrado dos órgãos. */
  somaRegistrada: number;
}

export interface RelatorioAtaContratos {
  numeroAta: string;
  uasg: string;
  /** "2026-11-17T11:35:58" (hora de Brasília, sem fuso, como as datas do Compras.gov.br). */
  geradoEm: string;
  itens: ItemDoRelatorio[];
  avisos: string[];
}

export class RelatorioInvalidoError extends Error {}

/** "1.485.000" → 1485000; "14,00" → 14. */
export function numeroBR(texto: string): number {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  if (!/^-?\d+(\.\d+)?$/.test(limpo) || !Number.isFinite(n)) throw new RelatorioInvalidoError(`Número ilegível no relatório: "${texto}".`);
  return n;
}

// Linhas que se repetem em toda página e não fazem parte das tabelas.
const LINHA_DE_PAGINA = [
  /Relatório gerado através do Contratos\.gov\.br/i,
  /^Relatório Ata de Registro de Preços\s*$/i,
  /^Unidade Gerenciadora \d{6}\b/i
];

const TIPOS = 'Gerenciadora|Participante|Não participante|Nao participante|Carona';
const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;
const LINHA_ORGAO = new RegExp(String.raw`(?:^|\s)(\d{6}) (.+?) (${TIPOS}) (${NUM}) (${NUM})(?=\s+\d{6} |\s*$)`, 'giu');

function linhasSemRodape(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !LINHA_DE_PAGINA.some((r) => r.test(l)));
}

function lerOrgaos(bloco: string): UnidadeDoRelatorio[] {
  // Cabeçalho da tabela, que se repete a cada página.
  const semCabecalho = bloco
    .replace(/Código\s+Unidade\s+Tipo da\s+unidade\s+Qtd\.\s+registrada\s+Qtd\. disponível para\s+remanejamento\/empenho/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const unidades: UnidadeDoRelatorio[] = [];
  for (const m of semCabecalho.matchAll(LINHA_ORGAO)) {
    unidades.push({ uasg: m[1], nome: m[2].trim(), tipo: m[3], quantidade: numeroBR(m[4]), saldo: numeroBR(m[5]) });
  }
  return unidades;
}

export function lerRelatorioAtaContratos(texto: string): RelatorioAtaContratos {
  if (!/Relatório Ata de Registro de Preços/i.test(texto) || !/Contratos\.gov\.br/i.test(texto)) {
    throw new RelatorioInvalidoError('O arquivo não é o "Relatório Ata de Registro de Preços" do Contratos.gov.br.');
  }
  const uasg = texto.match(/Unidade Gerenciadora (\d{6})\b/i)?.[1];
  const numeroAta = texto.match(/\bnº\s*(\d{5}\/\d{4})\b/i)?.[1];
  const data = texto.match(/gerado através do Contratos\.gov\.br em (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/i);
  if (!uasg || !numeroAta || !data) {
    throw new RelatorioInvalidoError('Não foi possível ler o número da ata, a UASG ou a data do relatório.');
  }
  const geradoEm = `${data[3]}-${data[2]}-${data[1]}T${data[4]}:${data[5]}:${data[6]}`;

  const corpo = linhasSemRodape(texto).join('\n');
  const partes = corpo.split(/^DETALHAMENTO DO ITEM (\d{1,5})\s*$/gim);
  const itens: ItemDoRelatorio[] = [];
  const avisos: string[] = [];
  for (let i = 1; i < partes.length; i += 2) {
    const numeroItem = Number(partes[i]);
    const secao = partes[i + 1] ?? '';
    const hom = secao.match(/Quantidade\s+homologada:\s*(\S+)/i)?.[1];
    const homologado = hom ? numeroBR(hom) : null;
    const inicio = secao.search(/^UNIDADE\(S\) ITEM \d+/im);
    if (inicio < 0) {
      avisos.push(`Item ${numeroItem}: o relatório não traz a tabela de órgãos; fica de fora.`);
      continue;
    }
    const resto = secao.slice(inicio).replace(/^UNIDADE\(S\) ITEM \d+\s*$/im, '');
    const fim = resto.search(/^(ADES[ÕO]ES?\(S\) ITEM|EMPENHO\(S\) ITEM|CONTRATO\(S\) ITEM)/im);
    const unidades = lerOrgaos(fim >= 0 ? resto.slice(0, fim) : resto);
    if (unidades.length === 0) {
      avisos.push(`Item ${numeroItem}: nenhum órgão reconhecido na tabela; fica de fora.`);
      continue;
    }
    if (new Set(unidades.map((u) => u.uasg)).size !== unidades.length) {
      avisos.push(`Item ${numeroItem}: o mesmo órgão aparece duas vezes na tabela; fica de fora.`);
      continue;
    }
    const somaRegistrada = unidades.reduce((s, u) => s + u.quantidade, 0);
    if (homologado !== null && somaRegistrada > homologado) {
      avisos.push(`Item ${numeroItem}: soma registrada (${somaRegistrada}) passa do homologado (${homologado}).`);
    }
    itens.push({ numeroItem, homologado, unidades, somaRegistrada });
  }
  if (itens.length === 0) {
    throw new RelatorioInvalidoError(avisos[0] ?? 'O relatório não tem o detalhamento de nenhum item.');
  }
  return { numeroAta, uasg, geradoEm, itens, avisos };
}
