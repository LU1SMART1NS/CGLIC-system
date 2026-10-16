/**
 * Converte identificadores oficiais de contratos no PNCP para a URL padrão oficial:
 * Padrão oficial: https://pncp.gov.br/app/contratos/{cnpj}/{ano}/{sequencial}
 * 
 * Regra de Negócio:
 * 1. Se PNCP forneceu numeroControlePncp -> usar o oficial
 * 2. Se PNCP forneceu linkVisualizacao -> usar o oficial
 * 3. Caso contrário -> NÃO fabricar URL (retorna vazio)
 */
export function formatPncpContractUrl(
  numeroControlePncp?: string,
  linkVisualizacao?: string
): string {
  // 1. Se PNCP forneceu numeroControlePncp -> extrai e monta a URL oficial
  const numControle = (numeroControlePncp || '').trim();
  if (numControle) {
    // Trata formato oficial do PNCP: {CNPJ}-2-{SEQUENCIAL}/{ANO} (ex: 00394494000136-2-001456/2026)
    const match = numControle.match(/(\d{14})-2-0*(\d+)\/(\d{4})/);
    if (match) {
      const parsedCnpj = match[1];
      const parsedSeq = String(parseInt(match[2], 10) || match[2].replace(/^0+/, ''));
      const parsedAno = match[3];
      return `https://pncp.gov.br/app/contratos/${parsedCnpj}/${parsedAno}/${parsedSeq}`;
    }

    // Se já for URL no formato novo: https://pncp.gov.br/app/contratos/{cnpj}/{ano}/{sequencial}
    const matchNew = numControle.match(/pncp\.gov\.br\/app\/contratos\/(\d{14})\/(\d{4})\/(\d+)/);
    if (matchNew) {
      const parsedSeq = String(parseInt(matchNew[3], 10) || matchNew[3]);
      return `https://pncp.gov.br/app/contratos/${matchNew[1]}/${matchNew[2]}/${parsedSeq}`;
    }

    // Se for URL no formato antigo: https://pncp.gov.br/app/contratos/{cnpj}-2-{sequencial}/{ano}
    const matchOldUrl = numControle.match(/pncp\.gov\.br\/app\/contratos\/(\d{14})-2-0*(\d+)\/(\d{4})/);
    if (matchOldUrl) {
      const parsedSeq = String(parseInt(matchOldUrl[2], 10) || matchOldUrl[2]);
      return `https://pncp.gov.br/app/contratos/${matchOldUrl[1]}/${matchOldUrl[3]}/${parsedSeq}`;
    }
  }

  // 2. Se PNCP forneceu linkVisualizacao -> valida/formata e usa o oficial
  const rawLink = (linkVisualizacao || '').trim();
  if (rawLink) {
    const matchNew = rawLink.match(/pncp\.gov\.br\/app\/contratos\/(\d{14})\/(\d{4})\/(\d+)/);
    if (matchNew) {
      const parsedSeq = String(parseInt(matchNew[3], 10) || matchNew[3]);
      return `https://pncp.gov.br/app/contratos/${matchNew[1]}/${matchNew[2]}/${parsedSeq}`;
    }

    const matchOldUrl = rawLink.match(/pncp\.gov\.br\/app\/contratos\/(\d{14})-2-0*(\d+)\/(\d{4})/);
    if (matchOldUrl) {
      const parsedSeq = String(parseInt(matchOldUrl[2], 10) || matchOldUrl[2]);
      return `https://pncp.gov.br/app/contratos/${matchOldUrl[1]}/${matchOldUrl[3]}/${parsedSeq}`;
    }

    const matchPattern = rawLink.match(/(\d{14})-2-0*(\d+)\/(\d{4})/);
    if (matchPattern) {
      const parsedSeq = String(parseInt(matchPattern[2], 10) || matchPattern[2]);
      return `https://pncp.gov.br/app/contratos/${matchPattern[1]}/${matchPattern[3]}/${parsedSeq}`;
    }

    if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
      return rawLink;
    }
  }

  // 3. Caso contrário -> NÃO fabricar URL
  return '';
}

/**
 * Retorna a URL oficial da Ata de Registro de Preços no PNCP
 * Padrão oficial: https://pncp.gov.br/app/atas/{cnpj}/{ano}/{seqCompra}/{seqAta}
 */
export function formatPncpAtaUrl(
  linkAtaPncp?: string | null,
  numeroControlePncpAta?: string | null,
  numeroAta?: string | null
): string {
  if (linkAtaPncp && linkAtaPncp.trim().startsWith('http')) {
    return linkAtaPncp.trim();
  }

  const numControle = (numeroControlePncpAta || '').trim();
  if (numControle) {
    // Formato: {CNPJ}-1-{SEQUENCIAL_COMPRA}/{ANO_COMPRA}-{SEQUENCIAL_ATA} (ex: 00394494000136-1-001651/2025-000001)
    const match = numControle.match(/^(\d{14})-1-0*(\d+)\/(\d{4})-0*(\d+)$/);
    if (match) {
      const cnpj = match[1];
      const seqCompra = match[2];
      const ano = match[3];
      const seqAta = match[4];
      return `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${seqCompra}/${seqAta}`;
    }
  }

  // Se for uma das atas conhecidas com mapeamento direto
  if (numeroAta) {
    const cleanNum = numeroAta.split('/')[0].replace(/\D/g, '').replace(/^0+/, '');
    if (cleanNum === '35' && numeroAta.includes('2026')) {
      return 'https://pncp.gov.br/app/atas/00394494000136/2025/1313/12';
    }
  }

  return '';
}

/**
 * PDF da ata assinada no PNCP: o primeiro arquivo da ata (os seguintes são aditivos e apostilamentos).
 * Padrão: https://pncp.gov.br/pncp-api/v1/orgaos/{cnpj}/compras/{ano}/{seqCompra}/atas/{seqAta}/arquivos/1
 */
export function formatPncpAtaPdfUrl(numeroControlePncpAta?: string | null): string {
  const match = (numeroControlePncpAta || '').trim().match(/^(\d{14})-1-0*(\d+)\/(\d{4})-0*(\d+)$/);
  if (!match) return '';
  const [, cnpj, seqCompra, ano, seqAta] = match;
  return `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seqCompra}/atas/${seqAta}/arquivos/1`;
}

/**
 * Retorna a URL oficial do Edital / Compra da Ata no PNCP
 * Padrão oficial: https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seqCompraComZeros}
 */
export function formatPncpCompraUrl(
  linkCompraPncp?: string | null,
  numeroControlePncpCompra?: string | null,
  numeroControlePncpAta?: string | null
): string {
  if (linkCompraPncp && linkCompraPncp.trim().startsWith('http')) {
    return linkCompraPncp.trim();
  }

  const numCompra = (numeroControlePncpCompra || '').trim();
  if (numCompra) {
    // Formato: {CNPJ}-1-{SEQUENCIAL_COMPRA}/{ANO_COMPRA} (ex: 00394494000136-1-001651/2025)
    const match = numCompra.match(/^(\d{14})-1-0*(\d+)\/(\d{4})$/);
    if (match) {
      const cnpj = match[1];
      const seqCompra = match[2].padStart(6, '0');
      const ano = match[3];
      return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seqCompra}`;
    }
  }

  const numAta = (numeroControlePncpAta || '').trim();
  if (numAta) {
    const match = numAta.match(/^(\d{14})-1-0*(\d+)\/(\d{4})-0*(\d+)$/);
    if (match) {
      const cnpj = match[1];
      const seqCompra = match[2].padStart(6, '0');
      const ano = match[3];
      return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seqCompra}`;
    }
  }

  return '';
}
