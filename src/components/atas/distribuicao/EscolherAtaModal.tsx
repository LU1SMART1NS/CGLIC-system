import React from 'react';
import { Search } from 'lucide-react';
import { AppInput, Modal } from '../../../design-system';
import { formatDateBR } from '../../../utils/format';
import type { FilaAta, ItemFila, MotivoSugestao } from './contratosSemAta';
import { opcoesDeAta, type OpcaoAta } from './escolherAta';

/** Quantas atas mostrar de uma vez: a busca refina o resto. */
const LIMITE = 50;

const ROTULO_MOTIVO: Record<MotivoSugestao, string> = {
  COMPRA_E_FORNECEDOR: 'Mesma compra e fornecedor',
  COMPRA: 'Mesma compra',
  FORNECEDOR: 'Mesmo fornecedor'
};

const Selo: React.FC<{ tom: 'ok' | 'aviso' | 'neutro'; children: React.ReactNode }> = ({ tom, children }) => (
  <span
    style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      padding: '0.1rem 0.45rem',
      borderRadius: '999px',
      whiteSpace: 'nowrap',
      color: tom === 'ok' ? 'var(--color-success-text)' : tom === 'aviso' ? 'var(--color-warning-text)' : '#64748b',
      background: tom === 'ok' ? 'var(--color-success-bg, #ecfdf5)' : tom === 'aviso' ? 'var(--color-warning-bg, #fffbeb)' : '#f1f5f9'
    }}
  >
    {children}
  </span>
);

const LinhaAta: React.FC<{ opcao: OpcaoAta; onEscolher: () => void }> = ({ opcao, onEscolher }) => {
  const { ata, motivo, descartada, encerrada } = opcao;
  const detalhes = [
    ata.fornecedorNome,
    ata.numeroCompra && ata.anoCompra ? `Compra ${ata.numeroCompra}/${ata.anoCompra}` : undefined,
    ata.vigenciaFim ? `${encerrada ? 'Encerrada em' : 'Vigente até'} ${formatDateBR(ata.vigenciaFim)}` : undefined,
    ata.gestorNome ? `Gestor: ${ata.gestorNome}` : 'Sem gestor'
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        onClick={onEscolher}
        data-testid={`escolher-ata-${ata.numeroAta}-${ata.uasg}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
          width: '100%',
          textAlign: 'left',
          padding: '0.6rem 0.75rem',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #e2e8f0',
          cursor: 'pointer',
          opacity: descartada ? 0.7 : 1
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--primary, #0c326f)', fontSize: '0.88rem' }}>Ata {ata.numeroAta}</span>
          {motivo && <Selo tom={motivo === 'COMPRA_E_FORNECEDOR' ? 'ok' : 'aviso'}>{ROTULO_MOTIVO[motivo]}</Selo>}
          {encerrada && <Selo tom="neutro">Encerrada</Selo>}
          {descartada && <Selo tom="neutro">Descartada para este contrato</Selo>}
          {ata.itens === 0 && <Selo tom="aviso">Sem itens no banco</Selo>}
        </span>
        {ata.objeto && (
          <span title={ata.objeto} style={{ fontSize: '0.8rem', color: '#0f172a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {ata.objeto}
          </span>
        )}
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{detalhes.join(' · ')}</span>
      </button>
    </li>
  );
};

interface EscolherAtaModalProps {
  contrato: ItemFila;
  atas: FilaAta[];
  /** Chaves "NÚMERO-UASG" das atas descartadas para este contrato. */
  descartadas: Set<string>;
  onEscolher: (ata: FilaAta) => void;
  onClose: () => void;
}

/**
 * "Escolher ata": para o contrato cuja ata não foi sugerida. A ata escolhida abre a mesma conferência das sugestões
 * (itens da ata, confirmação pela API e vínculo), então a escolha manual passa pela mesma checagem.
 */
export const EscolherAtaModal: React.FC<EscolherAtaModalProps> = ({ contrato, atas, descartadas, onEscolher, onClose }) => {
  const [busca, setBusca] = React.useState('');
  const opcoes = React.useMemo(() => opcoesDeAta(contrato, atas, { busca, descartadas }), [contrato, atas, busca, descartadas]);
  const comPista = opcoes.filter((o) => o.motivo && !o.descartada).length;
  const visiveis = opcoes.slice(0, LIMITE);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      testId="escolher-ata"
      title={`Escolher ata do contrato ${contrato.numero}`}
      subtitle={contrato.fornecedorNome ? `Fornecedor: ${contrato.fornecedorNome}` : 'Escolha a ata e confira os itens antes de vincular'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <AppInput
            autoFocus
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número da ata, objeto, fornecedor, compra ou gestor..."
            aria-label="Buscar ata"
            data-testid="escolher-ata-busca"
            style={{ paddingLeft: '2.1rem' }}
          />
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b' }} data-testid="escolher-ata-resumo">
          {opcoes.length === 0
            ? 'Nenhuma ata encontrada.'
            : `${opcoes.length} ${opcoes.length === 1 ? 'ata' : 'atas'}${comPista > 0 ? `, ${comPista} com pista` : ''}. As que têm pista com o contrato aparecem primeiro.`}
        </div>
        {visiveis.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {visiveis.map((o) => (
              <LinhaAta key={`${o.ata.numeroAta}-${o.ata.uasg}`} opcao={o} onEscolher={() => onEscolher(o.ata)} />
            ))}
          </ul>
        )}
        {opcoes.length > LIMITE && (
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Mostrando {LIMITE} de {opcoes.length}. Refine a busca para encontrar as demais.</div>
        )}
      </div>
    </Modal>
  );
};
