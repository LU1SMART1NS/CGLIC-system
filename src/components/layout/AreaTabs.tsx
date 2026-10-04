import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { navigationConfig, filterNavigationByRole, findAreaForTabs } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';

/** Filtros da Carteira que valem em mais de uma aba: seguem o usuário ao trocar de aba (mesmos nomes de parâmetro). */
const CARTEIRA_SHARED_PARAMS = ['situacao', 'unidade', 'gestor', 'busca', 'alocacao', 'empenho'];

function sharedSearch(areaId: string, search: string): string {
  if (areaId !== 'carteira') return '';
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  for (const key of CARTEIRA_SHARED_PARAMS) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  const text = next.toString();
  return text ? `?${text}` : '';
}

/**
 * Abas da área no topo das páginas de lista: alternam entre as páginas irmãs do
 * menu chave (ex.: Carteira → Atas · Contratos · Itens). Na Carteira, os filtros em comum seguem junto. Some quando
 * o perfil só vê uma página da área e nas telas de detalhe, que têm abas próprias.
 */
export const AreaTabs: React.FC = () => {
  const { role } = useAuth();
  const { pathname, search } = useLocation();
  const area = useMemo(
    () => findAreaForTabs(filterNavigationByRole(navigationConfig, role), pathname),
    [role, pathname]
  );

  const tabs = area?.children ?? [];
  if (!area || tabs.length < 2) return null;

  // Com abas de mais de um grupo (Configurações: Gestão · Acesso), a primeira linha mostra os grupos
  // e a segunda as páginas do grupo ativo. Com um grupo só, as páginas aparecem direto.
  const groups = Array.from(new Set(tabs.map((t) => t.group).filter((g): g is string => Boolean(g))));
  const grouped = groups.length > 1;
  const activeGroup = grouped ? tabs.find((t) => t.route === pathname)?.group : undefined;

  const renderLink = (tab: (typeof tabs)[number], className: string) => {
    const active = tab.route === pathname;
    return (
      <Link
        key={tab.id}
        to={`${tab.route ?? '/'}${active ? '' : sharedSearch(area.id, search)}`}
        className={className}
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'page' : undefined}
      >
        {tab.label}
      </Link>
    );
  };

  if (!grouped) {
    return (
      <nav aria-label={`Páginas de ${area.label}`} className="area-tabs">
        <div className="area-tabs-list ds-tabs-scroll">{tabs.map((tab) => renderLink(tab, 'area-tab'))}</div>
      </nav>
    );
  }

  const subTabs = tabs.filter((t) => t.group === activeGroup);

  return (
    <nav aria-label={`Páginas de ${area.label}`} className="area-tabs">
      <div className="area-tabs-list ds-tabs-scroll" role="group" aria-label="Grupos">
        {groups.map((group) => {
          const first = tabs.find((t) => t.group === group)!;
          const active = group === activeGroup;
          return (
            <Link
              key={group}
              to={first.route ?? '/'}
              className="area-tab"
              data-active={active ? 'true' : undefined}
              aria-current={active ? 'true' : undefined}
            >
              {group}
            </Link>
          );
        })}
      </div>
      {subTabs.length > 1 && (
        <div className="area-subtabs ds-tabs-scroll" role="group" aria-label={`Páginas de ${activeGroup}`}>
          {subTabs.map((tab) => renderLink(tab, 'area-subtab'))}
        </div>
      )}
    </nav>
  );
};
