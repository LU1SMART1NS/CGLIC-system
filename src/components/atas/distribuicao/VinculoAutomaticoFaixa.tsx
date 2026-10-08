import React from 'react';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { Modal } from '../../../design-system/components/Modal';
import { useRodarVinculoAutomatico, useUltimaExecucaoVinculo } from '../../../hooks/useVinculoAutomatico';
import type { ResumoVinculoAutomatico } from '../../../services/vinculoAutomaticoService';
import { contarVinculosAutomaticos, frasesHerancaGestor } from '../../../utils/vinculoAutomatico';
import { formatDataHoraBR } from '../../../utils/format';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const plural = (n: number, um: string, varios: string) => `${fmt(n)} ${n === 1 ? um : varios}`;

interface VinculoAutomaticoFaixaProps {
  /** Todos os vínculos item × contrato, com a origem. */
  links: Array<{ ataKey: string; contractKey: string; origem?: string }>;
  /** Contratos vigentes que ficaram para a equipe (os da lista abaixo). */
  paraEquipe: number;
  /** Só o coordenador simula e roda na hora. */
  podeRodar: boolean;
}

/**
 * Topo da fila "Contratos sem vínculo": o que o sistema já vinculou sozinho (migration 95), quando rodou pela última
 * vez e, para o coordenador, "Simular agora".
 */
export const VinculoAutomaticoFaixa: React.FC<VinculoAutomaticoFaixaProps> = ({ links, paraEquipe, podeRodar }) => {
  const { data: ultima } = useUltimaExecucaoVinculo();
  const [simulando, setSimulando] = React.useState(false);
  const total = contarVinculosAutomaticos(links);

  return (
    <section
      data-testid="vinculo-automatico-faixa"
      aria-label="Vínculo automático"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem 1.25rem',
        padding: '0.85rem 1rem',
        background: 'var(--color-info-bg)',
        border: '1px solid var(--color-info-border)',
        borderRadius: '8px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0, flex: '1 1 420px' }}>
        <strong style={{ fontSize: '0.92rem', color: 'var(--color-info-text-strong)' }}>Vínculo automático</strong>
        <span style={{ fontSize: '0.8rem', color: '#334155' }}>
          O sistema vincula sozinho o contrato à ata quando a compra, o fornecedor e os itens batem. Roda toda hora.
          {ultima ? ` Última execução: ${formatDataHoraBR(ultima.executadoEm)}.` : ' Ainda não rodou.'}
        </span>
        <span data-testid="vinculo-automatico-numeros" style={{ fontSize: '0.8rem', color: '#0f172a', display: 'flex', flexWrap: 'wrap', gap: '0.2rem 1rem', fontVariantNumeric: 'tabular-nums' }}>
          <span><strong>{fmt(total.vinculos)}</strong> {total.vinculos === 1 ? 'vínculo feito' : 'vínculos feitos'} pelo sistema</span>
          <span><strong>{fmt(total.contratos)}</strong> {total.contratos === 1 ? 'contrato' : 'contratos'}</span>
          <span><strong>{fmt(total.atas)}</strong> {total.atas === 1 ? 'ata' : 'atas'}</span>
          <span>
            <strong>{fmt(paraEquipe)}</strong> {paraEquipe === 1 ? 'contrato vigente ficou' : 'contratos vigentes ficaram'} para a equipe
          </span>
        </span>
      </div>
      {podeRodar && <ActionButton action="simular" size="sm" label="Simular agora" onClick={() => setSimulando(true)} data-testid="vinculo-automatico-simular" />}
      {simulando && <SimularVinculoModal onClose={() => setSimulando(false)} />}
    </section>
  );
};

/** Linhas do resultado de uma simulação ou execução. */
export const ResumoVinculo: React.FC<{ resumo: ResumoVinculoAutomatico }> = ({ resumo }) => {
  const manuais = Object.values(resumo.manuais).reduce<number>((s, n) => s + (n ?? 0), 0);
  const linhas: Array<[string, number, string?]> = [
    ['Vínculos novos', resumo.novos, 'item da ata com o contrato'],
    ['Contratos que ganham vínculo', resumo.contratosNovos],
    ['Vínculos do sistema com quantidade atualizada pela fonte', resumo.atualizados],
    ['Vínculos do sistema retirados', resumo.retirados, 'a fonte deixou de confirmar'],
    ['Contratos que ficam para a equipe', manuais, 'com ou sem vigência']
  ];
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      {linhas.map(([rotulo, n, sub], i) => (
        <div
          key={rotulo}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '0.75rem', padding: '0.55rem 0.8rem', borderTop: i ? '1px solid #e2e8f0' : undefined, fontSize: '0.84rem' }}
        >
          <span>
            {rotulo}
            {sub && <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>{sub}</span>}
          </span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(n)}</strong>
        </div>
      ))}
    </div>
  );
};

/** "Simular agora": mostra o que a próxima execução faria; "Vincular agora" grava na hora. */
const SimularVinculoModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const simular = useRodarVinculoAutomatico();
  const vincular = useRodarVinculoAutomatico();
  const iniciou = React.useRef(false);
  React.useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    simular.mutate({ simular: true });
  }, [simular]);

  const feito = vincular.data;
  const resumo = feito ?? simular.data;
  const ocupado = simular.isPending || vincular.isPending;
  const heranca = resumo ? frasesHerancaGestor(resumo.herdamGestor) : [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!vincular.isPending}
      size="md"
      title={feito ? 'Vínculo automático feito' : 'Simulação do vínculo automático'}
      subtitle={feito ? undefined : 'Nada foi gravado. É o que a próxima execução faria agora.'}
      testId="vinculo-automatico-modal"
      footer={
        <>
          <ActionButton action="fechar" type="button" onClick={onClose} disabled={vincular.isPending} />
          {!feito && (
            <ActionButton
              action="vincular"
              type="button"
              label="Vincular agora"
              onClick={() => vincular.mutate({ simular: false })}
              disabled={ocupado || !simular.data || simular.data.novos + simular.data.atualizados + simular.data.retirados === 0}
              isLoading={vincular.isPending}
              data-testid="vinculo-automatico-vincular-agora"
            />
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.84rem' }}>
        {simular.isPending && <span style={{ color: '#64748b' }}>Simulando...</span>}
        {(simular.error || vincular.error) && (
          <div role="alert" style={{ color: 'var(--color-danger-text-strong)' }}>
            Não foi possível {vincular.error ? 'vincular' : 'simular'}: {(vincular.error || simular.error)?.message}
          </div>
        )}
        {resumo && (
          <>
            {feito && (
              <div data-testid="vinculo-automatico-feito" style={{ color: 'var(--color-success-text-strong)', fontWeight: 600 }}>
                Feito: {plural(feito.novos, 'vínculo gravado', 'vínculos gravados')} em {plural(feito.contratosNovos, 'contrato', 'contratos')}.
              </div>
            )}
            <ResumoVinculo resumo={resumo} />
            <div
              style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success-text-strong)', borderRadius: '6px', padding: '0.55rem 0.7rem' }}
            >
              <strong>Gestores:</strong> ninguém perde contrato nem ata.{' '}
              {heranca.length > 0 ? `${heranca.join('; ')}.` : 'Nenhum contrato muda de gestor.'}
            </div>
            <div style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', color: 'var(--color-info-text-strong)', borderRadius: '6px', padding: '0.55rem 0.7rem' }}>
              O saldo dos itens passa a descontar a quantidade contratada desses contratos, a mesma que o Contratos.gov.br informa para o item.
            </div>
            {resumo.erros.length > 0 && (
              <div style={{ color: 'var(--color-danger-text-strong)' }}>
                {resumo.erros.map((e) => (
                  <div key={e.contrato}>
                    Contrato {e.contrato}: {e.erro}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
