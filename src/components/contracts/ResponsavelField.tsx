import React from 'react';
import { useUsers } from '../../hooks/useUsers';

export interface ResponsavelValue {
  /** Vazio = herda o gestor (contrato ou Ata). */
  nome: string;
  userId?: string;
}

const HERDAR = '__herdar__';
const OUTRO = '__outro__';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.35rem 0.5rem',
  fontSize: '0.8rem',
  borderRadius: '4px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff'
};

export const ResponsavelField: React.FC<{
  id: string;
  value: ResponsavelValue;
  onChange: (value: ResponsavelValue) => void;
  gestorNome?: string;
  /** Ex.: "gestor do contrato", "gestor da Ata". */
  gestorLabel: string;
}> = ({ id, value, onChange, gestorNome, gestorLabel }) => {
  const { data: users = [] } = useUsers();
  const activeUsers = users.filter((u) => u.ativo);
  const matchedUser = value.nome
    ? activeUsers.find((u) => (value.userId && u.id === value.userId) || u.nome === value.nome)
    : undefined;
  const [customMode, setCustomMode] = React.useState(Boolean(value.nome) && !matchedUser);

  const selected = !value.nome && !customMode ? HERDAR : customMode ? OUTRO : matchedUser?.id ?? OUTRO;

  const handleSelect = (option: string) => {
    if (option === HERDAR) {
      setCustomMode(false);
      onChange({ nome: '' });
    } else if (option === OUTRO) {
      setCustomMode(true);
      onChange({ nome: '' });
    } else {
      const user = activeUsers.find((u) => u.id === option);
      setCustomMode(false);
      if (user) onChange({ nome: user.nome, userId: user.id });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <select id={id} value={selected} onChange={(e) => handleSelect(e.target.value)} style={fieldStyle}>
        <option value={HERDAR}>
          {gestorNome ? `${capitalize(gestorLabel)}: ${gestorNome}` : `Sem responsável (${gestorLabel} não definido)`}
        </option>
        {activeUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
        <option value={OUTRO}>Outro (digitar nome)…</option>
      </select>
      {customMode && (
        <input
          type="text"
          aria-label="Nome do responsável"
          value={value.nome}
          onChange={(e) => onChange({ nome: e.target.value })}
          placeholder="Nome do servidor"
          autoFocus
          style={fieldStyle}
        />
      )}
    </div>
  );
};
