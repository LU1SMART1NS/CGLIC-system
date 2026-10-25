import React from 'react';
import { isUasgCglic } from '../../config/unidadesGestoras';
import { useGruposDasUasgsLeitura } from '../../hooks/useGruposGti';
import { resumirFatias, type FatiasDaAta, type GrupoDaFatia } from '../../config/gruposGti';
import type { QuantitativosDoItem } from '../../services/quantitativosService';
import type { UnidadeItemRecord } from '../../types';

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/**
 * Interesse por GTI do item: quantidade registrada dos órgãos participantes, somada pelo grupo confirmado de cada UASG
 * (migration 139). Ficam fora a SENASP, a gerenciadora e as adesões. Com a ata assinada informada, vale a lista dela;
 * sem ela, a lista de órgãos do Compras.gov.br.
 */
export function useInteresseGti(input: { unidades: UnidadeItemRecord[]; quantitativos: QuantitativosDoItem; ataDaCglic: boolean }): {
  fatias: FatiasDaAta;
  /** A leitura dos grupos das UASGs, para a faixa "não carregou". */
  consulta: ReturnType<typeof useGruposDasUasgsLeitura>['consulta'];
} {
  const { unidades, quantitativos: q, ataDaCglic } = input;
  const linhas = React.useMemo(
    () =>
      q.informado
        ? q.orgaos.map((o) => ({ uasg: o.uasg, conta: !o.ehSenasp, registrado: o.quantidadeRegistrada ?? 0 }))
        : unidades.map((u) => {
            const uasg = digitos(u.codigoUnidade);
            const gerenciadora = u.tipoUnidade === 'GERENCIADORA' || (ataDaCglic && isUasgCglic(uasg));
            return { uasg, conta: !isUasgCglic(uasg) && !gerenciadora, registrado: Number(u.quantidadeRegistrada) || 0 };
          }),
    [q.informado, q.orgaos, unidades, ataDaCglic]
  );
  const { grupos, consulta } = useGruposDasUasgsLeitura(linhas.map((l) => l.uasg));
  const fatias = React.useMemo(() => {
    const porGrupo = new Map<GrupoDaFatia, { quantidade: number; orgaos: number }>();
    for (const l of linhas) {
      if (!l.conta) continue;
      const g = grupos.get(l.uasg) ?? 'A_CONFIRMAR';
      const atual = porGrupo.get(g) ?? { quantidade: 0, orgaos: 0 };
      porGrupo.set(g, { quantidade: atual.quantidade + Math.max(0, l.registrado), orgaos: atual.orgaos + 1 });
    }
    return resumirFatias([...porGrupo].map(([grupo, v]) => ({ grupo, ...v })));
  }, [linhas, grupos]);
  return { fatias, consulta };
}
