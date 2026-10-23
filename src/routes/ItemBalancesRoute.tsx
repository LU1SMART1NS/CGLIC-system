import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBackTarget } from '../hooks/useDetailOrigin';
import { ItemBalances } from '../components/ItemBalances';
import { InstrumentPageState } from '../components/instrument360/InstrumentPageState';
import { useSelection } from '../context/SelectionContext';
import { useAuth } from '../context/AuthContext';
import { semContratos } from '../types/rbac';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { buildAtaPath, uasgFromAtaKey, useAta } from '../hooks/useAta';
import { UASG_LINK_LEGADO } from '../config/unidadesGestoras';
import { carteiraDaAta, chaveGestaoDaArp } from '../utils/ataIdentidade';
import { EscopoNaoConferido, escopoNaoConferido } from '../components/instrument360/EscopoNaoConferido';

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
  const uasg = uasgFromAtaKey(ataKey) || UASG_LINK_LEGADO;

  const { arp, itens, isLoading, isError, error, refetch } = useAta(ataKey, uasg);
  const item = itens.find((i) => Number(i.numeroItem) === Number(numeroItem) || i.numeroItem === numeroItem) || null;

  // A exportação para Excel (menu lateral) pré-seleciona a Ata aberta.
  const { setSelectedArp } = useSelection();
  React.useEffect(() => {
    if (arp) setSelectedArp(arp);
  }, [arp, setSelectedArp]);

  // Mesmo escopo da Ata 360: o perfil "gestor" só abre itens das Atas atribuídas a ele.
  const { role } = useAuth();
  const { ataKeys: assignedAtaKeys, isLoading: loadingScope, leituras: leiturasDoEscopo } = useAssignedManagementScope(arp ? carteiraDaAta(arp) : uasg);
  const isScopedRole = role === 'gestor';

  // O gestor de saldos (e o de emendas) chega ao item pela carteira de Itens e volta para lá.
  const ataPath = arp ? buildAtaPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, 'itens') : '/atas';
  const back = useBackTarget(
    semContratos(role)
      ? { path: '/itens', label: 'Voltar para Carteira' }
      : arp
        ? { path: ataPath, label: 'Voltar para a ata' }
        : { path: '/atas', label: 'Voltar para Carteira' }
  );
  // "Abrir ata" sobe um nível: a ata herda a origem de quem veio antes do item.
  const abrirAta = () => navigate(ataPath, { state: back.upState });

  if (isLoading || (isScopedRole && loadingScope)) {
    return <InstrumentPageState kind="loading" title="Carregando item da ata..." />;
  }

  // As atas não carregaram: não é "Ata não encontrada".
  if (isError && !arp) {
    return (
      <InstrumentPageState
        kind="error"
        title="Falha ao carregar a ata do item"
        message={error instanceof Error ? error.message : 'Não foi possível ler a ata no banco.'}
        onRetry={() => void refetch()}
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  // A leitura das atribuições falhou: não dá para saber se a ata é do gestor. A faixa, e não "Acesso não autorizado".
  if (arp && !assignedAtaKeys?.includes(chaveGestaoDaArp(arp)) && escopoNaoConferido(isScopedRole, leiturasDoEscopo)) {
    return <EscopoNaoConferido leituras={leiturasDoEscopo ?? []} oQueConferir="a ata deste item está atribuída a você" backLabel={back.label} onBack={back.back} />;
  }

  if (arp && isScopedRole && !assignedAtaKeys?.includes(chaveGestaoDaArp(arp))) {
    return (
      <InstrumentPageState
        kind="forbidden"
        title="Acesso não autorizado"
        message="Esta Ata não está atribuída a você. Seu perfil de gestor só permite ver os itens das Atas onde você é o gestor titular."
        backLabel="Voltar para Atas"
        onBack={() => navigate('/atas')}
      />
    );
  }

  if (!arp || !item) {
    return (
      <InstrumentPageState
        kind="notFound"
        title={arp ? 'Item não encontrado' : 'Ata não encontrada'}
        message={
          arp
            ? `A Ata ${arp.numeroAtaRegistroPreco} não tem o item ${numeroItem} sincronizado.`
            : `Não há Ata sincronizada com a chave ${ataKey || 'informada'}.`
        }
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  return <ItemBalances arp={arp} item={item} onBack={back.back} backLabel={back.label} onOpenAta={semContratos(role) ? undefined : abrirAta} />;
};
