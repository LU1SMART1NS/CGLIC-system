import type { MotivoVinculoManual } from '../services/vinculoAutomaticoService';

/** GESTOR: falta uma decisão de quem cuida; DADO: algum dado da fonte não fecha; EQUIPE: a equipe já decidiu. */
export type TipoMotivo = 'GESTOR' | 'DADO' | 'EQUIPE';

export interface TextoMotivo {
  titulo: string;
  detalhe: string;
  tipo: TipoMotivo;
}

export const ROTULO_TIPO_MOTIVO: Record<TipoMotivo, string> = {
  GESTOR: 'Decisão de gestor',
  DADO: 'Dado que não fecha',
  EQUIPE: 'Decidido pela equipe'
};

/**
 * Por que o sistema deixou o contrato para a equipe, em português simples. `numeroAta`, `gestorContrato` e
 * `gestorAta` completam a frase quando a tela tem esses dados.
 */
export function textoMotivoManual(
  motivo: MotivoVinculoManual,
  ctx: { numeroAta?: string; gestorContrato?: string; gestorAta?: string } = {}
): TextoMotivo {
  const ata = ctx.numeroAta ? `a Ata ${ctx.numeroAta}` : 'a ata';
  switch (motivo) {
    case 'ATA_SEM_GESTOR':
      return {
        titulo: 'A ata não tem gestor',
        detalhe: ctx.gestorContrato
          ? `Vincular passaria ${ata} para ${ctx.gestorContrato}, que cuida do contrato.`
          : `Vincular faria ${ata} assumir o gestor do contrato.`,
        tipo: 'GESTOR'
      };
    case 'TROCARIA_GESTOR':
      return {
        titulo: 'Trocaria o gestor do contrato',
        detalhe:
          ctx.gestorContrato && ctx.gestorAta
            ? `O contrato é de ${ctx.gestorContrato} e ${ata} é de ${ctx.gestorAta}.`
            : `O contrato tem um gestor e ${ata}, outro.`,
        tipo: 'GESTOR'
      };
    case 'GESTORES_DIFERENTES':
      return { titulo: 'Atas de gestores diferentes', detalhe: 'Os itens do contrato estão em atas de gestores diferentes: escolha quem fica com ele.', tipo: 'GESTOR' };
    case 'ITEM_FORA_DA_ATA':
      return { titulo: 'Item fora da ata', detalhe: 'Algum item do contrato não está em nenhuma ata desta compra e deste fornecedor.', tipo: 'DADO' };
    case 'ITEM_EM_VARIAS_ATAS':
      return { titulo: 'Item em mais de uma ata', detalhe: 'Um item do contrato aparece em mais de uma ata da compra: escolha a ata.', tipo: 'DADO' };
    case 'OUTRO_FORNECEDOR':
      return {
        titulo: 'Fornecedor não confirmado',
        detalhe: 'As atas da mesma compra são de outro fornecedor, ou o nome do fornecedor estrangeiro não bate com o da ata.',
        tipo: 'DADO'
      };
    case 'VALOR_FORA_DO_LIMITE':
      return { titulo: 'Valor acima do limite', detalhe: 'O preço ou a quantidade do contrato passa de 25% acima da ata.', tipo: 'DADO' };
    case 'ITENS_NAO_LIDOS':
      return { titulo: 'Itens do contrato ainda não lidos', detalhe: 'A sincronização ainda não trouxe os itens deste contrato do Contratos.gov.br.', tipo: 'DADO' };
    case 'ITEM_SEM_NUMERO':
      return { titulo: 'Item sem número na fonte', detalhe: 'O Contratos.gov.br não informa o número do item na compra.', tipo: 'DADO' };
    case 'ATA_DESCARTADA':
      return { titulo: 'Ata descartada', detalhe: 'O coordenador descartou a ata sugerida para este contrato.', tipo: 'EQUIPE' };
    case 'VINCULO_DESFEITO':
      return { titulo: 'Vínculo desfeito', detalhe: 'Alguém desvinculou este contrato de um item da ata. Para devolver ao sistema, restaure a sugestão no item.', tipo: 'EQUIPE' };
    case 'NAO_PERTENCE_A_ATA':
      return { titulo: 'Não pertence a ata', detalhe: 'O coordenador marcou que o contrato não veio de ata.', tipo: 'EQUIPE' };
    case 'VINCULO_MANUAL':
    default:
      return { titulo: 'Vínculo feito à mão', detalhe: 'O contrato já tem vínculo feito pela equipe; o sistema não mexe nele.', tipo: 'EQUIPE' };
  }
}

/** Contagem dos vínculos do sistema: vínculos (item × contrato), contratos e atas. */
export function contarVinculosAutomaticos(links: Array<{ ataKey: string; contractKey: string; origem?: string }>): {
  vinculos: number;
  contratos: number;
  atas: number;
} {
  const auto = links.filter((l) => l.origem === 'AUTOMATICO');
  return {
    vinculos: auto.length,
    contratos: new Set(auto.map((l) => l.contractKey)).size,
    atas: new Set(auto.map((l) => l.ataKey)).size
  };
}

/** "14 contratos passam a ser de Daniel Espíndola" — uma frase por gestor, do maior para o menor. */
export function frasesHerancaGestor(herdam: Record<string, number>): string[] {
  return Object.entries(herdam)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([g, n]) => `${n} ${n === 1 ? 'contrato sem gestor passa' : 'contratos sem gestor passam'} a ser de ${g}, gestor da ata`);
}

/** Situação da linha na fila "Contratos sem vínculo" da Central. */
export type GrupoFila = 'ATA_PROVAVEL' | 'PARCIAL' | 'SEM_PISTA' | 'NAO_PERTENCE';

/**
 * Frase da coluna "Por que ficou para a equipe". Com o motivo do banco, usa ele; sem (contrato sem ata da mesma compra,
 * vínculo parcial, ou antes da primeira execução), explica pela situação da linha.
 */
export function textoMotivoDaFila(
  motivo: MotivoVinculoManual | undefined,
  grupo: GrupoFila,
  ctx: { numeroAta?: string; gestorContrato?: string; gestorAta?: string; vinculoParcial?: boolean } = {}
): TextoMotivo {
  if (grupo === 'NAO_PERTENCE') return textoMotivoManual('NAO_PERTENCE_A_ATA');
  if (motivo) return textoMotivoManual(motivo, ctx);
  if (ctx.vinculoParcial) {
    return { titulo: 'Vínculo parcial', detalhe: 'Parte dos itens do contrato já está vinculada; falta conferir o resto.', tipo: 'DADO' };
  }
  if (grupo === 'SEM_PISTA') {
    return { titulo: 'Sem ata da mesma compra', detalhe: 'Nenhuma ata do catálogo é da compra deste contrato. Confira a ata ou marque que ele não pertence a ata.', tipo: 'DADO' };
  }
  if (grupo === 'PARCIAL') {
    return { titulo: 'Só uma pista parcial', detalhe: 'Alguma ata é da mesma compra ou do mesmo fornecedor, mas não das duas coisas.', tipo: 'DADO' };
  }
  return { titulo: 'Aguardando o sistema', detalhe: 'O vínculo automático confere este contrato na próxima execução.', tipo: 'DADO' };
}

/** Pergunta do "Desvincular": desvincular grava o par como descartado, e o sistema não o refaz (migration 95). */
export function mensagemDesvincular(numeroContrato: string, numeroItem: string, origem?: string): string {
  const item = numeroItem ? `do item ${numeroItem.replace(/^0+(?=\d)/, '')}` : 'deste item';
  const quem = origem === 'AUTOMATICO' ? 'Este vínculo foi feito pelo sistema. ' : '';
  return `Desvincular o contrato ${numeroContrato} ${item}? ${quem}O sistema não vai refazer este vínculo. Para devolvê-lo, use "Restaurar" nas sugestões descartadas do item.`;
}
