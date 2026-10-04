import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, UserPlus } from 'lucide-react';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { carteiraButton } from '../../carteira/carteiraStyles';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import { buildAtaPath } from '../../../hooks/useAta';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import type { DistribuicaoItem, DistribuicaoLinha } from './distribuicaoEquipe';
import { ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';

const ETIQUETA_COMPLEXIDADE: Record<NivelComplexidade, { color: string; bg: string }> = {
  ALTA: { color: '#ffffff', bg: '#0c326f' },
  MEDIA: { color: '#0c326f', bg: '#dbe6f7' },
  BAIXA: { color: '#475569', bg: '#f1f5f9' }
};

const PAGE_SIZE = 10;
const MORE_SIZE = 20;

const itemId = (item: DistribuicaoItem) => `${item.tipo}:${item.chave}`;
const toTarget = (item: DistribuicaoItem): ManagerTarget =>
  item.tipo === 'ATA' ? { tipo: 'ATA', ataKey: item.chave } : { tipo: 'CONTRATO', contractKey: item.chave };

function itemPath(item: DistribuicaoItem): string {
  if (item.tipo === 'CONTRATO') return `/contratos/${encodeURIComponent(item.chave)}`;
  return item.uasg ? buildAtaPath(item.numero, item.uasg) : `/atas?${new URLSearchParams({ busca: item.numero, situacao: 'TODOS' })}`;
}

interface DistribuicaoItensProps {
  linha: DistribuicaoLinha;
  /** Só o admin transfere; para os demais a lista é de consulta. */
  canAssign: boolean;
  /** Abre o "Para quem atribuo?" para os itens marcados; `done` limpa a marcação depois de salvar. */
  onTransfer: (targets: ManagerTarget[], done: () => void) => void;
}

/**
 * Atas e contratos vigentes de um gestor, os mais urgentes primeiro. Marcar itens e transferir
 * só eles (o gestor da ata se propaga aos contratos vinculados, como nas carteiras).
 */
export const DistribuicaoItens: React.FC<DistribuicaoItensProps> = ({ linha, canAssign, onTransfer }) => {
  const navigate = useNavigate();
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const isSemGestor = linha.gestorNome === null;

  const shown = linha.itens.slice(0, visible);
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(itemId(i)));

  const toggle = (item: DistribuicaoItem) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const id = itemId(item);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of shown) {
        if (allShownSelected) next.delete(itemId(item));
        else next.add(itemId(item));
      }
      return next;
    });

  const transferSelected = () => {
    const targets = linha.itens.filter((i) => selected.has(itemId(i))).map(toTarget);
    onTransfer(targets, () => setSelected(new Set()));
  };

  if (linha.itens.length === 0) {
    return <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Nenhuma ata ou contrato vigente.</div>;
  }

  return (
    // A tabela é mais larga que a tela (rola na horizontal): a lista fica presa à esquerda e do tamanho da área
    // visível (100cqw = largura do contêiner de rolagem, menos o recuo da célula), senão prazo e "Abrir" ficam fora da vista.
    <div
      data-testid="distribuicao-itens"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'sticky', left: 0, width: 'calc(100cqw - 3.75rem)', maxWidth: '100%', boxSizing: 'border-box' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', minHeight: '32px' }}>
        {canAssign ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', fontWeight: 700, color: '#475569', cursor: 'pointer', minHeight: '44px' }}>
            <input type="checkbox" checked={allShownSelected} onChange={toggleShown} data-testid="distribuicao-selecionar-visiveis" />
            Selecionar os {shown.length} exibidos
          </label>
        ) : (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Mais urgentes primeiro</span>
        )}
        {canAssign && selected.size > 0 && (
          <button
            type="button"
            onClick={transferSelected}
            data-testid="distribuicao-transferir-selecionados"
            style={{ ...carteiraButton, color: '#ffffff', background: '#0c326f', borderColor: '#0c326f' }}
          >
            {isSemGestor ? <UserPlus size={13} /> : <ArrowLeftRight size={13} />}{' '}
            {isSemGestor ? 'Atribuir' : 'Transferir'} {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
          </button>
        )}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {shown.map((item) => {
          const checked = selected.has(itemId(item));
          return (
            <li
              key={itemId(item)}
              data-testid={`distribuicao-item-${itemId(item)}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0', borderTop: '1px solid #e2e8f0', background: checked ? '#eff6ff' : undefined }}
            >
              {canAssign && (
                <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item)}
                    aria-label={`Selecionar ${item.tipo === 'ATA' ? 'ata' : 'contrato'} ${item.numero}`}
                  />
                </label>
              )}
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.03em' }}>
                    {item.tipo === 'ATA' ? 'Ata' : 'Contrato'}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{item.numero}</span>
                  <span
                    title={`Complexidade ${ROTULO_COMPLEXIDADE[item.complexidade.nivel]}: ${item.complexidade.motivo}`}
                    data-testid={`distribuicao-complexidade-${itemId(item)}`}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '0.05rem 0.4rem',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      ...ETIQUETA_COMPLEXIDADE[item.complexidade.nivel]
                    }}
                  >
                    {ROTULO_COMPLEXIDADE[item.complexidade.nivel]}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.complexidade.motivo}
                  </span>
                </div>
                <div
                  title={item.objeto}
                  style={{ fontSize: '0.78rem', color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {item.objeto || '—'}
                </div>
              </div>
              <CarteiraPrazoPill faixa={item.faixa} diasRestantes={item.dias} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {item.urgentes === 0 && item.acompanhar === 0 ? (
                  <span style={{ color: '#94a3b8' }}>Sem pendências</span>
                ) : (
                  <>
                    {item.urgentes > 0 && (
                      <span style={{ color: '#b91c1c' }}>{item.urgentes} {item.urgentes === 1 ? 'urgente' : 'urgentes'}</span>
                    )}
                    {item.urgentes > 0 && item.acompanhar > 0 && <span style={{ color: '#94a3b8' }}> · </span>}
                    {item.acompanhar > 0 && <span style={{ color: '#b45309' }}>{item.acompanhar} a acompanhar</span>}
                  </>
                )}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: '64px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrencyCompact(item.valor)}</span>
              <button type="button" onClick={() => navigate(itemPath(item))} style={carteiraButton}>
                Abrir <ArrowRight size={13} />
              </button>
            </li>
          );
        })}
      </ul>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.78rem', color: '#64748b' }}>
        <span>Mostrando {shown.length} de {linha.itens.length}</span>
        {shown.length < linha.itens.length && (
          <button type="button" onClick={() => setVisible((v) => v + MORE_SIZE)} data-testid="distribuicao-mostrar-mais" style={carteiraButton}>
            Mostrar mais {Math.min(MORE_SIZE, linha.itens.length - shown.length)}
          </button>
        )}
      </div>
    </div>
  );
};
