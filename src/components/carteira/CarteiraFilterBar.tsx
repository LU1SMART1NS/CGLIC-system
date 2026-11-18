import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterButton, type CarteiraFilterOption } from './CarteiraFilterButton';
import { SEM_GESTOR, TODOS_GESTORES } from './carteiraGestor';

interface CarteiraFilterBarProps {
  busca: string;
  searchPlaceholder: string;
  onChangeBusca: (value: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Texto à direita (ex.: "Exibindo 3 de 10 contratos"). */
  counter: string;
  /** Prefixo dos data-testid (`arp`, `contracts`). */
  testIdPrefix: string;
  /** Os seletores próprios de cada carteira. */
  children?: React.ReactNode;
}

/** Pausa na digitação antes de aplicar a busca: cada letra não refiltra a lista nem regrava o endereço. */
const ESPERA_DA_BUSCA_MS = 250;

/**
 * Campo de busca que mostra cada letra na hora e só avisa a tela depois de uma pausa (ou no Enter / ao sair do campo).
 * Antes, cada letra regravava a URL e refiltrava a carteira inteira (atas e todos os itens), e a digitação travava.
 * Um valor novo vindo de fora (ex.: "Limpar" ou um link já filtrado) substitui o que está no campo.
 */
const CampoDeBusca: React.FC<{ busca: string; placeholder: string; onChangeBusca: (value: string) => void; testId: string }> = ({
  busca,
  placeholder,
  onChangeBusca,
  testId
}) => {
  const [texto, setTexto] = useState(busca);
  const ultimoAvisado = useRef(busca);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = useRef(onChangeBusca);
  useEffect(() => {
    avisar.current = onChangeBusca;
  });

  useEffect(() => {
    if (busca === ultimoAvisado.current) return;
    ultimoAvisado.current = busca;
    if (espera.current) clearTimeout(espera.current);
    setTexto(busca);
  }, [busca]);

  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  const aplicar = (valor: string) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    if (valor === ultimoAvisado.current) return;
    ultimoAvisado.current = valor;
    avisar.current(valor);
  };

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={texto}
      onChange={(e) => {
        const valor = e.target.value;
        setTexto(valor);
        if (espera.current) clearTimeout(espera.current);
        espera.current = setTimeout(() => aplicar(valor), ESPERA_DA_BUSCA_MS);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') aplicar(texto);
      }}
      onBlur={() => aplicar(texto)}
      data-testid={testId}
      style={{
        width: '100%',
        padding: '0.4rem 0.7rem 0.4rem 2rem',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        background: '#f8fafc',
        fontSize: '0.8rem',
        color: '#0f172a',
        outline: 'none'
      }}
    />
  );
};

/** Barra de filtros comum às carteiras de Atas e de Contratos: busca, seletores, "Limpar" e contador. */
export const CarteiraFilterBar: React.FC<CarteiraFilterBarProps> = ({
  busca,
  searchPlaceholder,
  onChangeBusca,
  hasActiveFilters,
  onResetFilters,
  counter,
  testIdPrefix,
  children
}) => (
  <div className="carteira-filter-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
    <div className="carteira-filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
      <div className="carteira-filter-search" style={{ position: 'relative', minWidth: 0, flex: '1 1 260px', maxWidth: '400px' }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
        <CampoDeBusca
          busca={busca}
          placeholder={searchPlaceholder}
          onChangeBusca={onChangeBusca}
          testId={`${testIdPrefix}-filter-search`}
        />
      </div>

      {children}

      {hasActiveFilters && (
        <ActionButton
          action="limpar"
          type="button"
          size="sm"
          onClick={onResetFilters}
          data-testid={`${testIdPrefix}-reset-filters-btn`}
        />
      )}
    </div>

    <div className="carteira-filter-counter" style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{counter}</div>
  </div>
);

interface CarteiraGestorSelectProps {
  value: string;
  gestores: string[];
  onChange: (value: string) => void;
  testId: string;
}

/** Opções do filtro de gestor: "Sem gestor" e os nomes; um gestor vindo da URL que não está na lista continua selecionável. */
export function gestorFilterOptions(value: string, gestores: string[]): CarteiraFilterOption[] {
  const nomes = value !== TODOS_GESTORES && value !== SEM_GESTOR && !gestores.includes(value) ? [value, ...gestores] : gestores;
  return [{ value: SEM_GESTOR, label: 'Sem gestor' }, ...nomes.map((nome) => ({ value: nome, label: nome }))];
}

/** Filtro de gestor das carteiras, em botão. */
export const CarteiraGestorSelect: React.FC<CarteiraGestorSelectProps> = ({ value, gestores, onChange, testId }) => {
  return (
    <CarteiraFilterButton
      label="Gestor"
      value={value}
      emptyValue={TODOS_GESTORES}
      options={gestorFilterOptions(value, gestores)}
      onChange={onChange}
      testId={testId}
    />
  );
};

/** Contador à direita da barra: "Exibindo X de Y" com filtro ativo, senão só o total. */
export function carteiraCounter(totalFiltered: number, total: number, hasActiveFilters: boolean, singular: string, plural: string): string {
  return hasActiveFilters || totalFiltered !== total
    ? `Exibindo ${totalFiltered} de ${total} ${plural}`
    : `${total} ${total === 1 ? singular : plural}`;
}
