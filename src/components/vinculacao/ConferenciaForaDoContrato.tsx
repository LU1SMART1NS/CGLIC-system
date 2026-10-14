import React from 'react';
import { ActionButton, AppButton, AppSelect, AppTextarea, Modal, NoticeBar } from '../../design-system';
import {
  ROTULO_DO_TIPO,
  TIPO_SUGERIDO,
  type EmpenhoForaDoContrato,
  type TipoDeCorrecao
} from '../../services/empenhosForaDoContratoService';
import { abrirContratosGov, conferenciaDaNota, type ContratoDaConferencia } from './vinculacaoEmpenhos';

const OBS_MAX = 500;

const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };
const caso: React.CSSProperties = {
  fontSize: '0.86rem',
  lineHeight: 1.45,
  padding: '0.5rem 0.7rem',
  borderLeft: '3px solid var(--primary)',
  background: 'var(--surface-2, #f8fafc)',
  borderRadius: '0 6px 6px 0'
};

/**
 * Conferência de uma nota citada fora do contrato, aberta na própria linha: o que aconteceu (uma frase), o que
 * fazer no Contratos.gov.br (um caso por linha) e os dados da nota e da fatura em letra menor.
 */
export const PainelDaConferencia: React.FC<{
  linha: EmpenhoForaDoContrato;
  contrato: ContratoDaConferencia;
  podeMarcar: boolean;
  onVouCorrigir: () => void;
}> = ({ linha, contrato, podeMarcar, onVouCorrigir }) => {
  const c = conferenciaDaNota(linha, contrato);
  return (
    <div
      data-testid={`vinc-ne-contrato-conferencia-${linha.chave}`}
      aria-label={`Conferência da nota ${linha.numeroEmpenho}`}
      style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        whiteSpace: 'normal'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={rotulo}>O que aconteceu</span>
        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, fontWeight: 600, maxWidth: '75ch' }}>{c.frase}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={rotulo}>O que fazer no Contratos.gov.br</span>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {c.fazer.map((f) => (
            <li key={f.se} style={caso}>
              <strong>{f.se}</strong> {f.faca}
            </li>
          ))}
        </ul>
      </div>
      {linha.situacao === 'CORRECAO_NAO_CHEGOU' && linha.correcao && (
        <NoticeBar tone="warning" testId="vinc-ne-contrato-nao-chegou">
          {linha.correcao.porNome || 'Alguém'} marcou que ia corrigir em {new Date(linha.correcao.em).toLocaleDateString('pt-BR')}, e a correção ainda não chegou
          pela sincronização. Confira no Contratos.gov.br.
        </NoticeBar>
      )}
      <div
        style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.15rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.65rem'
        }}
      >
        {c.dados.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <AppButton variant="outline" size="sm" onClick={abrirContratosGov} title="Abre o portal em outra aba">
          Abrir o Contratos.gov.br
        </AppButton>
        {podeMarcar && linha.situacao !== 'CORRIGINDO' && (
          <AppButton variant="primary" size="sm" onClick={onVouCorrigir} data-testid={`vinc-ne-contrato-vou-corrigir-${linha.chave}`}>
            Vou corrigir no Contratos.gov.br
          </AppButton>
        )}
      </div>
    </div>
  );
};

/** Janela "Corrigir no Contratos.gov.br": o gestor escolhe o que vai corrigir e marca a linha. */
export const VouCorrigirDialog: React.FC<{
  linha: EmpenhoForaDoContrato;
  contrato: ContratoDaConferencia;
  isLoading: boolean;
  erro?: string;
  onMarcar: (tipo: TipoDeCorrecao, observacao: string) => void;
  onFechar: () => void;
}> = ({ linha, contrato, isLoading, erro, onMarcar, onFechar }) => {
  const [tipo, setTipo] = React.useState<TipoDeCorrecao>(TIPO_SUGERIDO[linha.veredito]);
  const [obs, setObs] = React.useState('');
  const c = conferenciaDaNota(linha, contrato);
  const longa = obs.trim().length > OBS_MAX;
  return (
    <Modal
      isOpen
      onClose={onFechar}
      dismissible={!isLoading}
      title="Corrigir no Contratos.gov.br"
      subtitle={`Contrato ${contrato.numero}${contrato.fornecedorNome ? ` · ${contrato.fornecedorNome}` : ''}`}
      size="md"
      testId="vinc-ne-contrato-vou-corrigir-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={isLoading} />
          <AppButton
            variant="primary"
            onClick={() => onMarcar(tipo, obs.trim())}
            disabled={isLoading || longa}
            isLoading={isLoading}
            data-testid="vinc-ne-contrato-vou-corrigir-confirmar"
          >
            Marcar e abrir o Contratos.gov.br
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{c.frase}</p>
        <NoticeBar tone="info">O sistema não corrige a fatura. Você corrige no Contratos.gov.br; a sincronização traz o resultado e a linha sai da fila sozinha.</NoticeBar>
        <AppSelect label="O que você vai corrigir" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeCorrecao)} data-testid="vinc-ne-contrato-tipo">
          {(Object.keys(ROTULO_DO_TIPO) as TipoDeCorrecao[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_TIPO[t]}
            </option>
          ))}
        </AppSelect>
        <AppTextarea
          label="Observação (opcional)"
          hint={`A linha passa para "Corrigindo na fonte" com seu nome e a data, e o Contratos.gov.br abre em outra aba. Se a correção não chegar em 7 dias, a linha volta para "A conferir" com um aviso. Até ${OBS_MAX} caracteres.`}
          error={longa ? `A observação tem no máximo ${OBS_MAX} caracteres.` : undefined}
          value={obs}
          rows={3}
          onChange={(e) => setObs(e.target.value)}
          data-testid="vinc-ne-contrato-observacao"
        />
        {erro && (
          <NoticeBar tone="danger" testId="vinc-ne-contrato-vou-corrigir-erro">
            {erro}
          </NoticeBar>
        )}
      </div>
    </Modal>
  );
};
