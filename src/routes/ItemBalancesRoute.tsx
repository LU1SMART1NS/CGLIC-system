import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { ItemBalances } from '../components/ItemBalances';
import { useSelection } from '../context/SelectionContext';
import { useAuth } from '../context/AuthContext';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { buildAtaPath, uasgFromAtaKey, useAta } from '../hooks/useAta';

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  padding: '2.5rem',
  textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.6rem 1.25rem',
  backgroundColor: '#0c326f',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer'
};

/**
 * Detalhe (saldo) de um item da Ata em /atas/detalhe/:ataKey/itens/:numeroItem.
 * A Ata e o item vêm do endereço (não mais de estado em memória), então a
 * página sobrevive a recarregar e pode ser compartilhada por link.
 */
export const ItemBalancesRoute: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ ataKey: string; numeroItem: string }>();
  const ataKey = params.ataKey ? decodeURIComponent(params.ataKey) : undefined;
  const numeroItem = params.numeroItem ? decodeURIComponent(params.numeroItem) : '';
  const uasg = uasgFromAtaKey(ataKey) || '200331';

  const { arp, itens, isLoading } = useAta(ataKey, uasg);
  const item = itens.find((i) => Number(i.numeroItem) === Number(numeroItem) || i.numeroItem === numeroItem) || null;

  // A exportação para Excel (menu lateral) pré-seleciona a Ata aberta.
  const { setSelectedArp } = useSelection();
  React.useEffect(() => {
    if (arp) setSelectedArp(arp);
  }, [arp, setSelectedArp]);

  // Mesmo escopo da Ata 360: o perfil "gestor" só abre itens das Atas atribuídas a ele.
  const { role } = useAuth();
  const { ataKeys: assignedAtaKeys, isLoading: loadingScope } = useAssignedManagementScope(uasg);
  const isScopedRole = role === 'gestor';

  const voltarParaAta = () => (arp ? navigate(buildAtaPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, 'itens')) : navigate('/atas'));

  if (isLoading || (isScopedRole && loadingScope)) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={cardStyle}>
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#0c326f', margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Carregando item da ata...</h2>
        </div>
      </div>
    );
  }

  if (arp && isScopedRole && !assignedAtaKeys?.includes(arp.numeroAtaRegistroPreco)) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ ...cardStyle, border: '1px solid #fecaca' }}>
          <AlertCircle size={32} color="#dc2626" style={{ margin: '0 auto 0.75rem auto' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991b1b', margin: '0 0 0.5rem 0' }}>Acesso não autorizado</h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 auto 1.5rem auto', maxWidth: '500px' }}>
            Esta Ata não está atribuída a você. Seu perfil de gestor só permite ver os itens das Atas onde você é o gestor titular.
          </p>
          <button type="button" onClick={() => navigate('/atas')} style={primaryButton}>
            <ArrowLeft size={16} /> Voltar para Atas
          </button>
        </div>
      </div>
    );
  }

  if (!arp || !item) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            {arp ? 'Item não encontrado' : 'Ata não encontrada'}
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 auto 1.5rem auto', maxWidth: '550px' }}>
            {arp
              ? `A Ata ${arp.numeroAtaRegistroPreco} não tem o item ${numeroItem} sincronizado.`
              : `Não há Ata sincronizada com a chave ${ataKey || 'informada'}.`}
          </p>
          <button type="button" onClick={voltarParaAta} style={primaryButton}>
            <ArrowLeft size={16} /> {arp ? 'Voltar para a ata' : 'Voltar para Atas'}
          </button>
        </div>
      </div>
    );
  }

  return <ItemBalances arp={arp} item={item} onBack={voltarParaAta} />;
};
