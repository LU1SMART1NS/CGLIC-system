import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { navigationConfig, filterNavigationByRole, findAreaForTabs } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';

/**
 * Abas da área no topo das páginas de lista: alternam entre as páginas irmãs do
 * menu chave (ex.: Carteira → Atas · Contratos · Por unidade interna). Some quando
 * o perfil só vê uma página da área e nas telas de detalhe, que têm abas próprias.
 */
export const AreaTabs: React.FC = () => {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const area = useMemo(
    () => findAreaForTabs(filterNavigationByRole(navigationConfig, role), pathname),
    [role, pathname]
  );

  const tabs = area?.children ?? [];
  if (!area || tabs.length < 2) return null;

  return (
    <nav aria-label={`Páginas de ${area.label}`} className="area-tabs">
      <div className="area-tabs-list ds-tabs-scroll">
        {tabs.map((tab) => {
          const active = tab.route === pathname;
          return (
            <Link
              key={tab.id}
              to={tab.route ?? '/'}
              className="area-tab"
              data-active={active ? 'true' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
