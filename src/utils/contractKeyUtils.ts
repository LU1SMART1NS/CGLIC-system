/**
 * Módulo Canônico de Identidade de Contrato Administrativo (SaldoARP 3.0)
 *
 * CONTEXTO (auditoria FASE 0.1/0.2 do módulo Contratos):
 * antes desta implementação existiam QUATRO fórmulas diferentes de identidade
 * de contrato espalhadas em contractService.ts, contractManagementService.ts
 * e useContractDetails.ts (mais uma quinta, `getCanonicalContractKey` em
 * api.ts, que serve a um propósito DIFERENTE — ver nota abaixo). Elas
 * produziam valores distintos para o MESMO contrato e, pior, derivavam o
 * ano incorretamente a partir de `data_assinatura` em ~6% dos casos reais
 * (ex.: "00052/2018" assinado em 2019-01-23 virava ano 2019 ao invés de
 * 2018 — comprovado sobre os 1032 contratos reais da UG 200331).
 *
 * Esta é a ÚNICA função de derivação da identidade de GESTÃO de contrato
 * (contract_key usada por contract_managers / contract_task_plans) do
 * SaldoARP. Nenhum outro módulo deve montar essa chave inline
 * (`${uasg}-${numero}-${ano}`) nem reaproveitar `ano` derivado de datas
 * quando o `numero` já contém essa informação.
 *
 * NOTA IMPORTANTE — o que esta função NÃO substitui:
 * `getCanonicalContractKey` (src/services/api.ts) continua existindo e é
 * INTENCIONALMENTE preservada. Ela resolve um problema diferente: casar/
 * comparar números de contrato entre PNCP/Contratos.gov.br no contexto de
 * item de ARP (ItemBalances.tsx, 20+ chamadas), sem UASG e sem ser usada
 * como chave primária de nada. Misturar as duas responsabilidades seria
 * um refactor não solicitado e arriscado; portanto elas permanecem
 * deliberadamente separadas.
 *
 * Regra arquitetural (mesmo espírito de itemKeyUtils.normalizeItemKey):
 * - PK técnica no banco: contract_managers.contract_key / contract_task_plans.contract_key (VARCHAR)
 * - Business Key: contract_key = `${uasg}-${numeroCanonico}-${ano}`
 *
 * O ano é SEMPRE derivado do próprio `numero` do contrato quando possível.
 * NUNCA se deriva o ano de data_assinatura/vigencia_inicio quando o número
 * já contém essa informação — essa era a causa raiz do bug de identidade.
 */

import { normalizeUasg } from './itemKeyUtils';

export type ContractKeyTipo = 'CONTRATO' | 'NE' | 'FALLBACK' | 'INVALIDO';

export interface ContractKeyResolution {
  /** Chave canônica final, ex.: "200331-00012-2016". Vazia quando tipo === 'INVALIDO'. */
  key: string;
  /** UASG normalizada (apenas dígitos, default '200331' quando ausente/vazia). */
  uasg: string;
  /** Componente "número" já canonicalizado (5 dígitos, ou "NE" + 5 dígitos). Vazio se INVALIDO. */
  numero: string;
  /** Ano de 4 dígitos como string. Vazio se INVALIDO. */
  ano: string;
  /**
   * 'CONTRATO' — formato administrativo padrão NNNNN/AAAA (ou N/AA), ano determinístico
   *              extraído do próprio `numero`.
   * 'NE'       — nota de empenho direta AAAANEnnnnnn, ano determinístico (prefixo da própria NE).
   *              NUNCA tratada como contrato administrativo "00000/AAAA": a NE preserva sua
   *              própria identidade (prefixo "NE" + sequência), pois misturar os dois
   *              formatos destruiria a distinção entre execução direta por NE e contrato
   *              administrativo formal.
   * 'FALLBACK' — não foi possível derivar o ano a partir do `numero`. Usou-se `fallbackDateRaw`
   *              (uma data ISO ou um ano de 4 dígitos informado pelo chamador) SOMENTE como
   *              último recurso. NÃO determinístico — o mesmo `numero` pode gerar chaves
   *              diferentes se o fallback mudar. O `numero` original é preservado (sanitizado),
   *              nunca reformatado/adivinhado.
   * 'INVALIDO' — não foi possível derivar nenhuma chave (nem número reconhecível, nem
   *              fallback utilizável). `key` é uma string vazia — o chamador deve tratar
   *              esse caso explicitamente (ex.: descartar o registro), nunca usar '' como
   *              se fosse uma chave válida.
   */
  tipo: ContractKeyTipo;
  /** true somente para 'CONTRATO' e 'NE' — o ano veio do próprio número, não de um fallback externo. */
  deterministico: boolean;
}

// Formato 2 (ver ContractKeyTipo.NE): nota de empenho direta, ex. "2021NE000171".
const REGEX_NE = /^(\d{4})NE(\d+)$/i;

// Formato 1 (ver ContractKeyTipo.CONTRATO): contrato administrativo padrão.
// Aceita de 1 a 5 dígitos de número (com ou sem zeros à esquerda) e ano de
// 2 ou 4 dígitos. Ex.: "00012/2016", "110/2020", "5/2025", "12/16".
const REGEX_CONTRATO = /^0*(\d{1,5})\/(\d{2}|\d{4})$/;

/**
 * Expande ano de 2 dígitos para o século XXI (20XX).
 *
 * REGRA ADOTADA EXPLICITAMENTE: o SaldoARP opera exclusivamente sobre atas,
 * contratos e empenhos da faixa 2000–2099. Um `numero` como "12/16" é
 * SEMPRE interpretado como 2016, nunca 1916 — não há (e não haverá) suporte
 * a contratos do século XX nesta base. Esta é a mesma convenção já usada em
 * itemKeyUtils.normalizeAtaNumber e na implementação anterior de
 * getCanonicalContractKey (api.ts); aqui ela é apenas centralizada e
 * documentada explicitamente, como pedido na auditoria.
 */
function expandAno2Digitos(ano: string): string {
  return ano.length === 2 ? `20${ano}` : ano;
}

/**
 * Extrai um ano de 4 dígitos de uma data ISO ("2019-01-23...") OU de um ano
 * isolado já em formato de 4 dígitos ("2019"). Não aceita anos de 2 dígitos
 * aqui — a expansão de século (expandAno2Digitos) é uma regra exclusiva do
 * formato NNNNN/AAAA do número do contrato, não deve ser aplicada a um
 * valor de fallback ambíguo vindo de fora.
 */
function extractAnoDeDataOuAno(raw?: string | number | null): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(\d{4})/);
  return match ? match[1] : null;
}

/**
 * Sanitiza o `numero` original para uso no ramo FALLBACK. Não tentamos
 * adivinhar agrupamentos de dígitos (isso seria heurística excessiva e foi
 * explicitamente pedido para ser evitado) — apenas removemos caracteres não
 * alfanuméricos, colocamos em maiúsculas e limitamos o tamanho para caber
 * com folga no VARCHAR(100) da coluna contract_key.
 */
function sanitizeFallbackNumero(numero: string): string {
  const clean = numero.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.slice(0, 24) || 'INDETERMINADO';
}

/**
 * Deriva a identidade canônica e estável de GESTÃO de um contrato
 * administrativo (contract_key usada por contract_managers e
 * contract_task_plans).
 *
 * @param uasg UASG do contrato (ex.: "200331"). Ausente/vazia -> default '200331'
 *   (mesma convenção de itemKeyUtils.normalizeUasg, reaproveitada aqui).
 * @param numeroRaw Número do contrato exatamente como retornado pela fonte
 *   (Contratos.gov.br `numero` ou Compras.gov.br `numeroContrato`). Ambas as
 *   fontes usam o MESMO formato na prática — confirmado sobre 1032 contratos
 *   reais da UG 200331: 97,2% em "NNNNN/AAAA", 2,8% em "AAAANEnnnnnn", 0%
 *   sem derivação determinística.
 * @param fallbackDateRaw Usado SOMENTE quando o ano não puder ser derivado do
 *   `numero`. Aceita uma data ISO (ex.: "2019-01-23", "data_assinatura") ou um
 *   ano isolado de 4 dígitos (ex.: um `contract.ano` já resolvido por outra
 *   chamada). NUNCA tem prioridade sobre o `numero` quando este já contém o ano.
 */
export function resolveContractKey(
  uasg: string | number | undefined | null,
  numeroRaw: string | undefined | null,
  fallbackDateRaw?: string | number | null
): ContractKeyResolution {
  const uasgNorm = normalizeUasg(uasg);
  const numero = String(numeroRaw ?? '').trim();

  if (!numero) {
    return { key: '', uasg: uasgNorm, numero: '', ano: '', tipo: 'INVALIDO', deterministico: false };
  }

  // Formato 2: Nota de Empenho direta (AAAANEnnnnnn).
  const neMatch = numero.match(REGEX_NE);
  if (neMatch) {
    const ano = neMatch[1];
    const seq = parseInt(neMatch[2], 10);
    const numeroCanonico = `NE${String(seq).padStart(5, '0')}`;
    return {
      key: `${uasgNorm}-${numeroCanonico}-${ano}`,
      uasg: uasgNorm,
      numero: numeroCanonico,
      ano,
      tipo: 'NE',
      deterministico: true
    };
  }

  // Formato 1: contrato administrativo padrão NNNNN/AAAA (ou N/AA).
  const contratoMatch = numero.match(REGEX_CONTRATO);
  if (contratoMatch) {
    const numeroInt = parseInt(contratoMatch[1], 10);
    const ano = expandAno2Digitos(contratoMatch[2]);
    const numeroCanonico = String(numeroInt).padStart(5, '0');
    return {
      key: `${uasgNorm}-${numeroCanonico}-${ano}`,
      uasg: uasgNorm,
      numero: numeroCanonico,
      ano,
      tipo: 'CONTRATO',
      deterministico: true
    };
  }

  // Fallback: o número não permite derivar o ano deterministicamente.
  // Usamos a data/ano informado apenas como último recurso, e marcamos o
  // resultado como NÃO determinístico para que o chamador possa reagir a
  // essa condição em vez de tratá-la como uma identidade normal.
  const anoFallback = extractAnoDeDataOuAno(fallbackDateRaw);
  if (anoFallback) {
    const numeroCanonico = sanitizeFallbackNumero(numero);
    return {
      key: `${uasgNorm}-${numeroCanonico}-${anoFallback}`,
      uasg: uasgNorm,
      numero: numeroCanonico,
      ano: anoFallback,
      tipo: 'FALLBACK',
      deterministico: false
    };
  }

  // Nem o número nem uma data/ano utilizável permitem montar uma chave.
  // Não inventamos silenciosamente — retornamos INVALIDO explicitamente.
  return { key: '', uasg: uasgNorm, numero: '', ano: '', tipo: 'INVALIDO', deterministico: false };
}
