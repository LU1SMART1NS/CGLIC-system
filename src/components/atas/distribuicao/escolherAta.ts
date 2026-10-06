import { contemBusca } from './filaComum';
import { isVigente } from './distribuicaoEquipe';
import { sugerirAtas, type FilaAta, type FilaContrato, type MotivoSugestao } from './contratosSemAta';

/**
 * Lista do "Escolher ata": todas as atas do catálogo para o coordenador vincular um contrato cuja ata não foi
 * sugerida (sem pista, pista parcial ou sugestão errada). Primeiro as que têm alguma pista com o contrato, depois as
 * demais; as vigentes antes das encerradas (o contrato costuma durar mais que a ata, então as encerradas também
 * entram); as descartadas para o contrato vão para o fim.
 */

export interface OpcaoAta {
  ata: FilaAta;
  /** Pista com o contrato, pelas mesmas regras das sugestões da Central. */
  motivo?: MotivoSugestao;
  /** O coordenador já descartou esta ata para o contrato. */
  descartada: boolean;
  encerrada: boolean;
}

const ORDEM_MOTIVO: Record<MotivoSugestao, number> = { COMPRA_E_FORNECEDOR: 0, COMPRA: 1, FORNECEDOR: 2 };

/** "00051/2024" → [2024, 51]: as atas mais novas primeiro. */
const anoNumero = (numeroAta: string): [number, number] => {
  const [num, ano] = numeroAta.split('/');
  return [parseInt(ano, 10) || 0, parseInt(num, 10) || 0];
};

export function opcoesDeAta(
  contrato: Pick<FilaContrato, 'idCompra' | 'fornecedorCnpj' | 'fornecedorNome'>,
  atas: FilaAta[],
  opts: { busca?: string; descartadas?: Set<string> } = {}
): OpcaoAta[] {
  const descartadas = opts.descartadas ?? new Set<string>();
  const busca = opts.busca ?? '';
  return atas
    .filter((ata) =>
      contemBusca(
        busca,
        ata.numeroAta,
        ata.numeroAta.replace(/^0+/, ''),
        ata.objeto,
        ata.fornecedorNome,
        ...(ata.fornecedorNomes ?? []),
        ata.numeroCompra && ata.anoCompra ? `${ata.numeroCompra}/${ata.anoCompra}` : ata.numeroCompra,
        ata.gestorNome
      )
    )
    .map((ata) => ({
      ata,
      motivo: sugerirAtas(contrato, [ata]).sugestoes[0]?.motivo,
      descartada: descartadas.has(`${ata.numeroAta}-${ata.uasg}`),
      encerrada: !isVigente(ata.faixa)
    }))
    .sort((a, b) => {
      const [anoA, numA] = anoNumero(a.ata.numeroAta);
      const [anoB, numB] = anoNumero(b.ata.numeroAta);
      return (
        Number(a.descartada) - Number(b.descartada) ||
        (a.motivo ? ORDEM_MOTIVO[a.motivo] : 3) - (b.motivo ? ORDEM_MOTIVO[b.motivo] : 3) ||
        Number(a.encerrada) - Number(b.encerrada) ||
        anoB - anoA ||
        numB - numA
      );
    });
}
