import React from 'react';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';

export const TODAS_UASGS = '';
export const TODOS_OS_GESTORES = '';

/**
 * Filtros da Visão Geral, no padrão das carteiras e guardados no endereço: UASG para todos os perfis e, para o
 * coordenador e a consulta, o gestor (o painel passa a mostrar a carteira dele, com o mesmo recorte que ele vê).
 */
export const PainelFiltros: React.FC<{
  uasg: string;
  onUasg: (uasg: string) => void;
  /** Ausente: o perfil não escolhe gestor (o gestor já vê só a carteira dele; o gestor de saldos não tem carteira). */
  gestor?: { valor: string; nomes: string[]; onChange: (nome: string) => void };
  onLimpar: () => void;
}> = ({ uasg, onUasg, gestor, onLimpar }) => {
  const ativos = uasg !== TODAS_UASGS || Boolean(gestor && gestor.valor !== TODOS_OS_GESTORES);
  return (
    <div className="pn-filtros" role="group" aria-label="Filtros do painel" data-testid="painel-filtros">
      <CarteiraFilterButton
        label="UASG"
        value={uasg}
        emptyValue={TODAS_UASGS}
        options={UASGS_CGLIC.map((u) => ({ value: u, label: u }))}
        onChange={onUasg}
        testId="painel-filtro-uasg"
      />
      {gestor && (
        <CarteiraFilterButton
          label="Gestor"
          value={gestor.valor}
          emptyValue={TODOS_OS_GESTORES}
          options={gestor.nomes.map((nome) => ({ value: nome, label: nome }))}
          onChange={gestor.onChange}
          testId="painel-filtro-gestor"
        />
      )}
      {ativos && (
        <ActionButton action="limparFiltros" size="sm" onClick={onLimpar} data-testid="painel-filtros-limpar" />
      )}
    </div>
  );
};
