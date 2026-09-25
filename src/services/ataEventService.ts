/**
 * Serviço Puro de Domínio de Gestão de Eventos e Ciclos de Atas (SaldoARP — Fase 6.5)
 *
 * Funções Puras e Determinísticas:
 * 1. Identidade Canônica de Eventos de Ata (Idempotência e linhagem);
 * 2. Classificação de Fato Formal e Natureza de Ata;
 * 3. Construtor Canônico de Evento de Ata (com validação estrita de não-acréscimo);
 * 4. Avaliação Assistida de Prorrogação de Vigência da Ata (Art. 84, Lei 14.133/2021);
 * 5. Utilitários Puros de Interpretação Regulatória da Ata de Registro de Preços.
 */

import type {
  AtaEvent,
  AtaEventType,
  AtaEventNature,
  AtaEventImpact,
  AtaEventOficialidade,
  AtaEventSource,
  AtaProrrogationEvaluation,
  AtaProrrogationStatus
} from '../types/ataEvents';

/**
 * 1. Gera chave canônica e determinística de identidade de um evento de Ata.
 * Formato: ATA::{numeroAta}::{uasgGerenciadora}::{tipoEvento}::{identificadorOficial}::{cicloRef}
 */
export function generateAtaEventId(params: {
  numeroAta: string;
  uasgGerenciadora: string;
  tipoEvento: AtaEventType;
  identificadorOficial: string;
  cicloRef?: string;
}): string {
  const sanitize = (s: string) =>
    (s || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .toUpperCase();

  const ata = sanitize(params.numeroAta);
  const uasg = sanitize(params.uasgGerenciadora);
  const tipo = sanitize(params.tipoEvento);
  const idOficial = sanitize(params.identificadorOficial || 'REGISTRO');
  const ciclo = sanitize(params.cicloRef || 'CICLO_INICIAL');

  return `ATA::${ata}::${uasg}::${tipo}::${idOficial}::${ciclo}`;
}

/**
 * 2. Classifica a natureza, instrumento formal, impacto e oficialidade de um evento de Ata.
 *
 * REGRA LEGAL: VEDAÇÃO ABSOLUTA DE ACRÉSCIMO EM ATA DE REGISTRO DE PREÇOS
 * (Dec. 11.462/2023, art. 23).
 */
export function classifyAtaEvent(params: {
  tipoOuDescricao?: string;
  isRemanejamento?: boolean;
  isReequilibrio?: boolean;
  isReajuste?: boolean;
  isRepactuacao?: boolean;
  isProrrogacao?: boolean;
  isApostilamento?: boolean;
  isEncerramentoEscopo?: boolean;
  isEncerramentoVigencia?: boolean;
}): {
  tipoEvento: AtaEventType;
  naturezaInstrumento: AtaEventNature;
  impacto: AtaEventImpact;
  oficialidade: AtaEventOficialidade;
} {
  const desc = (params.tipoOuDescricao || '').toLowerCase();

  // Verificação de segurança ontológica: acréscimo é vedado na Ata
  if (desc.includes('acréscimo') || desc.includes('aditamento de quantitativo') || desc.includes('acrescimo')) {
    throw new Error(
      'VIOLACAO_REGULATORIA_ATA: É expressamente vedado o acréscimo de quantitativos em Ata de Registro de Preços (Lei 14.133/2021 c/c Dec. 11.462/2023, art. 23). Acréscimos contratuais são exclusivos de contratos administrativos decorrentes (art. 125).'
    );
  }

  // A) Encerramento por Vigência
  if (params.isEncerramentoVigencia || desc.includes('encerramento vigência') || desc.includes('expiração') || desc.includes('fim de vigência')) {
    return {
      tipoEvento: 'ENCERRAMENTO_VIGENCIA',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO_ATA',
      impacto: 'EXTINGUE_ATA',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // B) Encerramento por Escopo (Saldo esgotado)
  if (params.isEncerramentoEscopo || desc.includes('esgotamento de saldo') || desc.includes('encerramento escopo') || desc.includes('consumo integral')) {
    return {
      tipoEvento: 'ENCERRAMENTO_ESCOPO',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO_ATA',
      impacto: 'EXTINGUE_ATA',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // C) Remanejamento entre órgãos
  if (params.isRemanejamento || desc.includes('remanejamento') || desc.includes('remaneja') || desc.includes('transferência de cota')) {
    return {
      tipoEvento: 'REMANEJAMENTO',
      naturezaInstrumento: 'TERMO_REMANEJAMENTO',
      impacto: 'REMANEJA_QUANTITATIVO',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // D) Prorrogação de Vigência (Art. 84)
  if (params.isProrrogacao || desc.includes('prorroga') || desc.includes('renovação de vigência') || desc.includes('aditivo de vigência')) {
    return {
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO_ATA',
      impacto: 'ALTERA_VIGENCIA_ATA',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // E) Reequilíbrio Econômico-Financeiro (Revisão extraordinária)
  if (params.isReequilibrio || desc.includes('reequilíbrio') || desc.includes('reequilibrio') || desc.includes('revisão de preços') || desc.includes('álea extraordinária')) {
    return {
      tipoEvento: 'REEQUILIBRIO',
      naturezaInstrumento: 'TERMO_ADITIVO_ATA',
      impacto: 'ALTERA_PRECO_REGISTRADO',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // F) Repactuação de Mão de Obra
  if (params.isRepactuacao || desc.includes('repactua') || desc.includes('cct') || desc.includes('convenção coletiva') || desc.includes('dissídio')) {
    return {
      tipoEvento: 'REPACTUACAO',
      naturezaInstrumento: 'TERMO_ADITIVO_ATA',
      impacto: 'ALTERA_PRECO_REGISTRADO',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // G) Reajuste por Índice
  if (params.isReajuste || desc.includes('reajuste') || desc.includes('ipca') || desc.includes('inpc') || desc.includes('índice')) {
    return {
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO_ATA',
      impacto: 'ALTERA_PRECO_REGISTRADO',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // H) Apostilamento em geral
  if (params.isApostilamento || desc.includes('apostil') || desc.includes('apostila') || desc.includes('retificação cadastral')) {
    return {
      tipoEvento: 'APOSTILAMENTO',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO_ATA',
      impacto: 'ATUALIZA_DADOS_ATA',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // I) Celebração Inicial
  if (desc.includes('celebração') || desc.includes('assinatura') || desc.includes('publicação da ata') || desc.includes('inicial')) {
    return {
      tipoEvento: 'CELEBRACAO',
      naturezaInstrumento: 'ATA_INICIAL',
      impacto: 'SEM_IMPACTO_FINANCEIRO_TEMPORAL',
      oficialidade: 'FATO_OFICIAL'
    };
  }

  // Default: Apostilamento administrativo
  return {
    tipoEvento: 'APOSTILAMENTO',
    naturezaInstrumento: 'TERMO_APOSTILAMENTO_ATA',
    impacto: 'SEM_IMPACTO_FINANCEIRO_TEMPORAL',
    oficialidade: 'FATO_OFICIAL'
  };
}

/**
 * 3. Construtor Puro e Validado de AtaEvent
 */
export function buildAtaEvent(params: {
  numeroAta: string;
  anoAta: number;
  uasgGerenciadora: string;
  tipoEvento: AtaEventType;
  naturezaInstrumento: AtaEventNature;
  oficialidade?: AtaEventOficialidade;
  identificadorOficial: string;
  descricao: string;
  numeroSequencial?: number | string;
  dataAssinatura?: string;
  dataPublicacao?: string;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  impacto?: AtaEventImpact;
  vigenciaAnterior?: string;
  vigenciaPosterior?: string;
  saldoDisponivelAnterior?: number;
  saldoDisponivelPosterior?: number;
  fonteOrigem?: AtaEventSource;
  processoSeiNumero?: string;
  linkPncp?: string;
  cicloRef?: string;
  rawOfficialData?: any;
}): AtaEvent {
  const id = generateAtaEventId({
    numeroAta: params.numeroAta,
    uasgGerenciadora: params.uasgGerenciadora,
    tipoEvento: params.tipoEvento,
    identificadorOficial: params.identificadorOficial,
    cicloRef: params.cicloRef
  });

  // Determina impacto default caso não informado
  let impactoFinal = params.impacto;
  if (!impactoFinal) {
    switch (params.tipoEvento) {
      case 'PRORROGACAO':
        impactoFinal = 'ALTERA_VIGENCIA_ATA';
        break;
      case 'REAJUSTE':
      case 'REPACTUACAO':
      case 'REEQUILIBRIO':
        impactoFinal = 'ALTERA_PRECO_REGISTRADO';
        break;
      case 'REMANEJAMENTO':
        impactoFinal = 'REMANEJA_QUANTITATIVO';
        break;
      case 'ENCERRAMENTO_ESCOPO':
      case 'ENCERRAMENTO_VIGENCIA':
        impactoFinal = 'EXTINGUE_ATA';
        break;
      default:
        impactoFinal = 'SEM_IMPACTO_FINANCEIRO_TEMPORAL';
    }
  }

  return {
    id,
    numeroAta: params.numeroAta.trim(),
    anoAta: Number(params.anoAta),
    uasgGerenciadora: params.uasgGerenciadora.trim(),
    tipoEvento: params.tipoEvento,
    naturezaInstrumento: params.naturezaInstrumento,
    oficialidade: params.oficialidade || 'FATO_OFICIAL',
    identificadorOficial: params.identificadorOficial.trim(),
    descricao: params.descricao.trim(),
    numeroSequencial: params.numeroSequencial,
    dataAssinatura: params.dataAssinatura,
    dataPublicacao: params.dataPublicacao,
    dataVigenciaInicio: params.dataVigenciaInicio,
    dataVigenciaFim: params.dataVigenciaFim,
    impacto: impactoFinal,
    vigenciaAnterior: params.vigenciaAnterior,
    vigenciaPosterior: params.vigenciaPosterior,
    saldoDisponivelAnterior: params.saldoDisponivelAnterior,
    saldoDisponivelPosterior: params.saldoDisponivelPosterior,
    fonteOrigem: params.fonteOrigem || 'SaldoARP',
    processoSeiNumero: params.processoSeiNumero,
    linkPncp: params.linkPncp,
    capturedAt: new Date().toISOString(),
    rawOfficialData: params.rawOfficialData
  };
}

/**
 * 4. Avaliação Assistida de Prorrogação de Vigência da Ata (Art. 84 da Lei 14.133/2021)
 *
 * Requisitos cumulativos:
 * 1. Pesquisa de preços atestando vantajosidade;
 * 2. Concordância formal expressa do fornecedor;
 * 3. Existência de saldo de quantitativo disponível OU previsão em edital de renovação de cotas;
 * 4. Prazo total acumulado de vigência limitado a 2 anos (1 ano + até 1 ano).
 */
export function evaluateAtaProrrogationReadiness(params: {
  numeroAta: string;
  uasgGerenciadora: string;
  vigenciaAtual: string; // YYYY-MM-DD
  saldoDisponivelTotal: number;
  pesquisaPrecoVantajosa?: boolean;
  fornecedorConcordou?: boolean;
  editalPreveRenovacaoQuantitativos?: boolean;
}): AtaProrrogationEvaluation {
  const {
    numeroAta,
    uasgGerenciadora,
    vigenciaAtual,
    saldoDisponivelTotal,
    pesquisaPrecoVantajosa,
    fornecedorConcordou,
    editalPreveRenovacaoQuantitativos = false
  } = params;

  const alertas: string[] = [];
  const recomendacoes: string[] = [];
  let status: AtaProrrogationStatus = 'PRONTA';
  let apta = true;

  // Cálculo assistivo de vigência sugerida (+ 1 ano exato)
  let novaVigenciaSugerida: string | undefined = undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(vigenciaAtual)) {
    const parts = vigenciaAtual.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    novaVigenciaSugerida = d.toISOString().split('T')[0];
  }

  // 1. Análise de Vantajosidade Econômica
  if (pesquisaPrecoVantajosa === false) {
    status = 'PRECO_DESVANTAJOSO';
    apta = false;
    alertas.push(
      'A pesquisa de mercado indicou que os preços registrados não são mais vantajosos perante o mercado atual.'
    );
    recomendacoes.push(
      'Negociar a redução dos preços registrados com o fornecedor detentor da ata ou instaurar novo certame licitatório.'
    );
  } else if (pesquisaPrecoVantajosa === undefined) {
    status = 'PENDENTE_PESQUISA_PRECO';
    apta = false;
    alertas.push(
      'Pendente juntada aos autos de pesquisa de mercado comprovando a vantajosidade dos preços registrados.'
    );
    recomendacoes.push(
      'Realizar pesquisa de preços atualizada nos moldes da IN SEGES/ME nº 65/2021 ou regulamento setorial.'
    );
  }

  // 2. Análise de Concordância do Fornecedor
  if (fornecedorConcordou === false) {
    status = 'IMPEDIDA';
    apta = false;
    alertas.push(
      'O fornecedor detentor da ata recusou formalmente a prorrogação da vigência da Ata de Registro de Preços.'
    );
    recomendacoes.push(
      'Convocar os fornecedores remanescentes constantes no cadastro de reserva da licitação.'
    );
  } else if (fornecedorConcordou === undefined && status === 'PRONTA') {
    status = 'PENDENTE_CONCORDANCIA_FORNECEDOR';
    apta = false;
    alertas.push(
      'Pendente de formalização a anuência prévia do fornecedor detentor do registro de preços.'
    );
    recomendacoes.push(
      'Encaminhar ofício de consulta ao fornecedor com prazo para resposta formal.'
    );
  }

  // 3. Análise de Saldo e Previsão Editalícia (Parecer 75/2024/DECOR/CGU/AGU)
  const temSaldo = saldoDisponivelTotal > 0;
  if (!temSaldo && !editalPreveRenovacaoQuantitativos) {
    status = 'SALDO_ESGOTADO_SEM_PREVISAO_EDITAL';
    apta = false;
    alertas.push(
      'O saldo total de quantitativos da Ata está zerado e o instrumento convocatório original não previu expressamente a renovação de cotas para a prorrogação; sem previsão no edital a prorrogação de ata exaurida é vedada.'
    );
    recomendacoes.push(
      'Conforme orientação da AGU (Parecer 75/2024), sem previsão no edital a prorrogação de ata exaurida é vedada por violação ao princípio da vinculação ao instrumento convocatório.'
    );
  } else if (!temSaldo && editalPreveRenovacaoQuantitativos) {
    alertas.push(
      'Atenção: Saldo atual exaurido, porém o edital prevê expressamente a renovação integral dos quantitativos registrados no ato de prorrogação.'
    );
    recomendacoes.push(
      'Certificar no processo administrativo a aplicação da cláusula editalícia de renovação de cotas.'
    );
  }

  // Determinação dos badges e orientações visuais
  let badge: { color: 'verde' | 'amarelo' | 'vermelho'; label: string; orientacao: string };

  switch (status) {
    case 'PRONTA':
      badge = {
        color: 'verde',
        label: 'Apta para Prorrogação',
        orientacao: 'Todos os requisitos legais e materiais atendidos. Proceder à minuta do aditivo e análise jurídica.'
      };
      recomendacoes.push(
        'Elaborar minuta do Termo Aditivo de Prorrogação e submeter à aprovação da Assessoria Jurídica.'
      );
      break;

    case 'PENDENTE_PESQUISA_PRECO':
      badge = {
        color: 'amarelo',
        label: 'Pendente Pesquisa de Preços',
        orientacao: 'Comprovar a vantajosidade dos preços antes de lavrar o termo aditivo.'
      };
      break;

    case 'PENDENTE_CONCORDANCIA_FORNECEDOR':
      badge = {
        color: 'amarelo',
        label: 'Pendente Anuência',
        orientacao: 'Aguardando manifestação formal tempestiva do fornecedor detentor.'
      };
      break;

    case 'SALDO_ESGOTADO_SEM_PREVISAO_EDITAL':
      badge = {
        color: 'vermelho',
        label: 'Saldo Zerado sem Previsão',
        orientacao: 'Impossível prorrogar ata com saldo exaurido sem previsão editalícia de novas cotas.'
      };
      break;

    case 'PRECO_DESVANTAJOSO':
      badge = {
        color: 'vermelho',
        label: 'Preço Desvantajoso',
        orientacao: 'Preços registrados descolados do mercado. Vedada a prorrogação sem renegociação.'
      };
      break;

    case 'IMPEDIDA':
    default:
      badge = {
        color: 'vermelho',
        label: 'Prorrogação Impedida',
        orientacao: 'Há impedimento formal intransponível sem a participação de cadastro de reserva.'
      };
      break;
  }

  return {
    numeroAta,
    uasgGerenciadora,
    vigenciaAtual,
    novaVigenciaSugerida,
    status,
    aptaParaProrrogacao: apta,
    pesquisaPrecoVantajosa,
    fornecedorConcordou,
    saldoDisponivelTotal,
    editalPreveRenovacaoQuantitativos,
    fundamentacaoLegal: 'Lei nº 14.133/2021, Art. 84 c/c Decreto nº 11.462/2023 e Parecer nº 75/2024/DECOR/CGU/AGU',
    badge,
    alertas,
    recomendacoes,
    // Assistência, não decisão jurídica (o gestor sempre pode registrar despacho motivado)
    podeProsseguirComJustificativa: true
  };
}
