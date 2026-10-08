import React from 'react';
import { Link } from 'react-router-dom';
import { ActionButton, AlertCard, AppButton, Modal } from '../../design-system';
import { useDepartments } from '../../hooks/useDepartments';
import { useItemAllocations } from '../../hooks/useItemAllocations';
import { useSaveAllocations } from '../../hooks/useSaveAllocations';
import { AllocationUnavailableNotice } from '../item-balances/AllocationsTab';
import { formatNumber } from '../item-balances/itemBalanceUtils';
import type { InternalAllocation } from '../../types';

export interface ItemParaAlocar {
  numeroAta: string;
  uasg: string;
  numeroItem: string;
  descricao?: string;
  /** Quantitativo SENASP do item: o teto da soma das alocações. */
  quantitativoSenasp: number;
}

interface AlocarUnidadeModalProps {
  /** Item a alocar; nulo fecha a janela. */
  item: ItemParaAlocar | null;
  onFechar: () => void;
  onAlocado?: () => void;
}

const norm = (s: string) => s.trim().toLowerCase();
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 700, color: '#334155' };

/**
 * "Alocar quantitativo" fora do Item 360 (fila "Itens às unidades"): a mesma regra da aba Alocação interna, com as
 * alocações atuais do item e a gravação versionada (save_allocations_atomic). Escolher uma unidade já alocada
 * edita a quantidade dela.
 */
export const AlocarUnidadeModal: React.FC<AlocarUnidadeModalProps> = ({ item, onFechar, onAlocado }) =>
  item ? <JanelaAlocar key={`${item.numeroAta}-${item.uasg}-${item.numeroItem}`} item={item} onFechar={onFechar} onAlocado={onAlocado} /> : null;

const JanelaAlocar: React.FC<{ item: ItemParaAlocar; onFechar: () => void; onAlocado?: () => void }> = ({ item, onFechar, onAlocado }) => {
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments();
  const { data: estado, isLoading: alocacoesLoading } = useItemAllocations(item.numeroAta, item.uasg, item.numeroItem);
  const salvar = useSaveAllocations();
  const alocacoes = React.useMemo(() => estado?.allocations ?? [], [estado]);
  const [unidade, setUnidade] = React.useState('');
  const [qtd, setQtd] = React.useState<string>('');
  const [erro, setErro] = React.useState<string | null>(null);

  // Primeira unidade ainda sem alocação, quando as listas chegam.
  React.useEffect(() => {
    if (unidade || departments.length === 0 || alocacoesLoading) return;
    const alocadas = new Set(alocacoes.map((a) => norm(a.unitName)));
    const livre = departments.find((d) => !alocadas.has(norm(d.sigla)));
    setUnidade((livre ?? departments[0]).sigla);
  }, [departments, alocacoes, alocacoesLoading, unidade]);

  const existente = alocacoes.find((a) => norm(a.unitName) === norm(unidade));
  React.useEffect(() => {
    setQtd(existente ? String(existente.allocatedQty) : '');
    setErro(null);
  }, [existente?.id, existente?.allocatedQty]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAlocado = alocacoes.reduce((s, a) => s + a.allocatedQty, 0);
  const outras = totalAlocado - (existente?.allocatedQty ?? 0);
  const disponivel = Math.max(0, item.quantitativoSenasp - outras);
  const catalogoVazio = !departmentsLoading && departments.length === 0;
  const carregando = departmentsLoading || alocacoesLoading;

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const n = Number(qtd);
    if (!unidade.trim()) return setErro('Selecione uma unidade interna.');
    if (!Number.isFinite(n) || n <= 0) return setErro('A quantidade alocada deve ser um número maior que zero.');
    if (outras + n > item.quantitativoSenasp) {
      return setErro(`Limite excedido: o quantitativo SENASP deste item é ${formatNumber(item.quantitativoSenasp)}. Dá para alocar no máximo ${formatNumber(disponivel)} a esta unidade.`);
    }
    const lista: InternalAllocation[] = existente
      ? alocacoes.map((a) => (a.id === existente.id ? { ...a, allocatedQty: n } : a))
      : [...alocacoes, { id: Date.now().toString(), unitName: unidade.trim(), allocatedQty: n, empenhadaQty: 0 }];
    try {
      await salvar.mutateAsync({ itemKey: `${item.numeroAta}-${item.uasg}-${item.numeroItem}`, allocations: lista, expectedVersion: estado?.version });
      onAlocado?.();
      onFechar();
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        setErro('As alocações deste item mudaram por outro usuário. Feche e abra de novo antes de salvar.');
      } else if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        setErro('Só o coordenador e o gestor de saldos alocam quantitativo.');
      } else {
        setErro(err?.message || 'Não foi possível gravar a alocação.');
      }
    }
  };

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title={existente ? `Editar a alocação de ${existente.unitName}` : 'Alocar quantitativo'}
      subtitle={`Ata ${item.numeroAta} · item ${item.numeroItem}${item.descricao ? ` · ${item.descricao}` : ''}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="alocar-unidade-modal"
      footer={
        <>
          <ActionButton action={catalogoVazio ? 'fechar' : 'cancelar'} type="button" size="sm" onClick={onFechar} disabled={salvar.isPending} />
          {!catalogoVazio && (
            <AppButton type="submit" form="alocar-unidade-form" variant="primary" size="sm" isLoading={salvar.isPending} disabled={salvar.isPending || carregando} data-testid="alocar-unidade-salvar">
              {existente ? 'Salvar' : 'Alocar'}
            </AppButton>
          )}
        </>
      }
    >
      {catalogoVazio ? (
        <AllocationUnavailableNotice catalogEmpty />
      ) : (
        <form id="alocar-unidade-form" onSubmit={(e) => void confirmar(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {erro && <AlertCard severity="CRITICA" title={erro} testId="alocar-unidade-erro" />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.25rem', fontSize: '0.82rem', color: '#334155' }}>
            <span>
              Quantitativo SENASP <strong>{formatNumber(item.quantitativoSenasp)}</strong>
            </span>
            <span>
              Já alocado <strong>{formatNumber(totalAlocado)}</strong>
              {alocacoes.length > 0 && <span style={{ color: '#64748b' }}> ({alocacoes.map((a) => `${a.unitName} ${formatNumber(a.allocatedQty)}`).join(' · ')})</span>}
            </span>
            <span>
              Disponível para esta unidade <strong>{formatNumber(disponivel)}</strong>
            </span>
          </div>
          <label style={labelStyle}>
            Unidade interna
            <select
              className="form-input"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              required
              disabled={carregando || salvar.isPending}
              data-testid="alocar-unidade-select"
              style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
            >
              {departments.map((d) => {
                const ja = alocacoes.some((a) => norm(a.unitName) === norm(d.sigla));
                return (
                  <option key={d.id} value={d.sigla}>
                    {d.sigla} — {d.nomeCompleto}
                    {ja ? ' (já alocada: editar)' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          <label style={labelStyle}>
            Quantidade
            <input
              type="number"
              className="form-input"
              min="1"
              max={Math.max(disponivel, 1)}
              placeholder="Ex: 50"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              required
              disabled={carregando || salvar.isPending}
              data-testid="alocar-unidade-qtd"
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
            />
          </label>
          <Link to="/admin/departamentos" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
            Gerenciar Unidades Internas
          </Link>
        </form>
      )}
    </Modal>
  );
};
