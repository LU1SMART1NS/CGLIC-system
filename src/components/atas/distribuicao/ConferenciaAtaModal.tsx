import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Link2, Loader2, MinusCircle, X } from 'lucide-react';
import { AppButton, Modal } from '../../../design-system';
import { useToast } from '../../../design-system/components/Toast';
import { useDescartarAta } from '../../../hooks/useDescartesAtaContrato';
import { buildAtaPath } from '../../../hooks/useAta';
import { useVinculoEmMassa } from '../../../hooks/useVinculoEmMassa';
import { fetchContractItemQuantities } from '../../../services/contractItemsService';
import type { PlanoVinculo } from '../../../services/vinculoEmMassaService';
import { formatDateBR } from '../../../utils/format';
import { normalizeItemKey } from '../../../utils/itemKeyUtils';
import type { FilaAta, ItemFila } from './contratosSemAta';
import { efeitoGestorDoVinculo, preverVinculo, type ItemDaAta } from './vinculoEmMassa';

interface ConferenciaAtaModalProps {
  contrato: ItemFila;
  /** Ata a conferir (dados completos); se faltar no catálogo, só o número é mostrado. */
  ata: FilaAta;
  /** Itens da ata no banco (a lista para marcar). */
  itensDaAta: ItemDaAta[];
  /** Só o coordenador vincula e descarta. */
  podeAgir: boolean;
  onClose: () => void;
}

type Sinal = 'SIM' | 'NAO' | 'NEUTRO';

const SinalLinha: React.FC<{ sinal: Sinal; children: React.ReactNode }> = ({ sinal, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', fontSize: '0.84rem', color: sinal === 'NAO' ? '#64748b' : '#0f172a' }}>
    {sinal === 'SIM' ? (
      <CheckCircle2 size={15} color="#15803d" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
    ) : (
      <MinusCircle size={15} color="#94a3b8" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
    )}
    <span>{children}</span>
  </div>
);

const Campo: React.FC<{ rotulo: string; children: React.ReactNode; limitar?: boolean }> = ({ rotulo, children, limitar }) => (
  <div style={{ fontSize: '0.84rem' }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{rotulo}</div>
    <div
      title={limitar && typeof children === 'string' ? children : undefined}
      style={{ color: '#0f172a', ...(limitar ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}) }}
    >
      {children || '—'}
    </div>
  </div>
);

/**
 * Conferência da ata provável de um contrato, sem sair da Central: lado a lado, o que bate (fornecedor, compra e,
 * sobretudo, os itens que a API oficial confirma) e as ações Vincular e "Esta não é a ata". É o único lugar de vincular
 * pela Central: os itens confirmados pela API vêm marcados e os demais itens da ata podem ser marcados à mão.
 */
export const ConferenciaAtaModal: React.FC<ConferenciaAtaModalProps> = ({ contrato, ata, itensDaAta, podeAgir, onClose }) => {
  const toast = useToast();
  const lote = useVinculoEmMassa();
  const descartar = useDescartarAta();
  const sugerida = contrato.sugestoes.find((s) => s.numeroAta === ata.numeroAta && s.uasg === ata.uasg);
  const motivo = sugerida?.motivo;

  const consulta = useQuery({
    queryKey: ['contract-item-quantities', `${contrato.contract.uasg}-${contrato.contract.numero}-${contrato.contract.ano}`] as const,
    queryFn: () => fetchContractItemQuantities(contrato.contract),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: itensDaAta.length > 0
  });
  const previsao = preverVinculo({
    numeroAta: ata.numeroAta,
    uasg: ata.uasg,
    atasProvaveis: 1,
    itensDaAta,
    apiQuantidades: consulta.data,
    apiCarregando: consulta.isLoading,
    apiErro: consulta.isError
  });
  const efeito = efeitoGestorDoVinculo(contrato.gestorNome, ata.gestorNome);

  // Itens marcados: começa pelos que a API confirma (uma vez, quando a consulta responde); o coordenador ajusta.
  const api = consulta.data;
  const confirmado = (numeroItem: string) => Boolean(api?.has(parseInt(numeroItem, 10)));
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const iniciou = React.useRef(false);
  React.useEffect(() => {
    if (iniciou.current || (consulta.isLoading && itensDaAta.length > 0)) return;
    iniciou.current = true;
    setMarcados(new Set(itensDaAta.filter((i) => confirmado(i.numeroItem)).map((i) => i.numeroItem)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta.isLoading, api, itensDaAta]);
  const alternar = (numeroItem: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(numeroItem)) novo.delete(numeroItem);
      else novo.add(numeroItem);
      return novo;
    });
  const itensMarcados = itensDaAta.filter((i) => marcados.has(i.numeroItem));
  const algumConfirmado = itensMarcados.some((i) => confirmado(i.numeroItem));
  const ocupado = lote.estado.rodando || descartar.isPending;

  const vincular = async () => {
    if (itensMarcados.length === 0) return;
    const plano: PlanoVinculo = {
      contractKey: contrato.contractKey,
      numero: contrato.numero,
      contract: contrato.contract,
      numeroAta: ata.numeroAta,
      uasg: ata.uasg,
      itens: itensMarcados.map((i) => ({
        itemKey: normalizeItemKey(ata.numeroAta, ata.uasg, i.numeroItem),
        numeroItem: i.numeroItem,
        valorUnitario: i.valorUnitario,
        quantidade: api?.get(parseInt(i.numeroItem, 10)) ?? null
      }))
    };
    const [resultado] = await lote.executar([plano]);
    if (resultado?.ok) {
      toast.success(`Contrato ${contrato.numero} vinculado à ata ${ata.numeroAta}.`);
      onClose();
    } else {
      toast.error(`Não foi possível vincular: ${resultado?.erro || 'erro desconhecido'}`);
    }
  };

  const naoEhEstaAta = async () => {
    try {
      await descartar.mutateAsync({ contractKey: contrato.contractKey, ataKey: `${ata.numeroAta}-${ata.uasg}` });
      toast.success(`Ata ${ata.numeroAta} descartada para o contrato ${contrato.numero}.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível descartar a ata.');
    }
  };

  const verAtaCompleta = () => window.open(buildAtaPath(ata.numeroAta, ata.uasg), '_blank', 'noopener');

  const fornecedorBate = motivo === 'FORNECEDOR' || motivo === 'COMPRA_E_FORNECEDOR';
  const compraBate = motivo === 'COMPRA' || motivo === 'COMPRA_E_FORNECEDOR';

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      testId="conferencia-ata"
      title={`Contrato ${contrato.numero} ↔ Ata ${ata.numeroAta}`}
      subtitle="Confira se o contrato pertence a esta ata"
      footer={
        <>
          <AppButton variant="outline" size="sm" icon={<ExternalLink size={13} />} onClick={verAtaCompleta} title="Abrir a Ata 360 em outra aba, só para consulta">
            Ver ata completa
          </AppButton>
          {podeAgir && (
            <>
              <AppButton variant="outline" size="sm" icon={<X size={13} />} onClick={naoEhEstaAta} disabled={ocupado} title="Esta ata não é a deste contrato: deixa de ser sugerida" data-testid="conferencia-descartar">
                Esta não é a ata
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                icon={lote.estado.rodando ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                onClick={vincular}
                disabled={ocupado || itensMarcados.length === 0 || consulta.isLoading}
                title={itensMarcados.length === 0 ? 'Marque os itens que o contrato cobre' : 'Vincular o contrato aos itens marcados'}
                data-testid="conferencia-vincular"
              >
                {itensMarcados.length > 0 && !algumConfirmado ? 'Vincular mesmo assim' : 'Vincular'}
              </AppButton>
            </>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
          <section aria-label="Contrato" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Contrato {contrato.numero}</strong>
            <Campo rotulo="Fornecedor">{contrato.fornecedorNome}</Campo>
            <Campo rotulo="Vigência">{contrato.contract.dataVigenciaFim ? `até ${formatDateBR(contrato.contract.dataVigenciaFim)}` : undefined}</Campo>
            <Campo rotulo="Objeto" limitar>{contrato.objeto}</Campo>
            <Campo rotulo="Gestor">{contrato.gestorNome || 'sem gestor'}</Campo>
          </section>
          <section aria-label="Ata" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Ata {ata.numeroAta}</strong>
            <Campo rotulo="Fornecedor">{ata.fornecedorNome}</Campo>
            <Campo rotulo="Vigência">{ata.vigenciaFim ? `até ${formatDateBR(ata.vigenciaFim)}` : undefined}</Campo>
            <Campo rotulo="Objeto" limitar>{ata.objeto}</Campo>
            <Campo rotulo="Gestor">{ata.gestorNome || 'sem gestor'}</Campo>
          </section>
        </div>

        <section aria-label="O que bate" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.7rem 0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }} data-testid="conferencia-sinais">
          <SinalLinha sinal={fornecedorBate ? 'SIM' : 'NAO'}>{fornecedorBate ? 'Mesmo fornecedor' : 'Fornecedor diferente'}</SinalLinha>
          <SinalLinha sinal={compraBate ? 'SIM' : 'NAO'}>{compraBate ? 'Mesma compra' : 'Compra diferente'}</SinalLinha>
          {previsao.status === 'CONFERINDO' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', color: '#64748b' }}>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Conferindo os itens na API oficial...
            </div>
          ) : previsao.status === 'PRONTO' ? (
            <SinalLinha sinal="SIM">
              A API oficial confirma {previsao.itens.length === 1 ? '1 item do contrato' : `${previsao.itens.length} itens do contrato`} nesta ata
            </SinalLinha>
          ) : (
            <SinalLinha sinal="NAO">{previsao.motivo}</SinalLinha>
          )}
          <SinalLinha sinal="NEUTRO">{efeito.texto}</SinalLinha>
        </section>

        {itensDaAta.length > 0 && (
          <section aria-label="Itens cobertos pelo contrato" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }} data-testid="conferencia-itens">
            <div>
              <strong style={{ fontSize: '0.88rem' }}>Itens cobertos por este contrato</strong>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Os itens que a API oficial lista no contrato já vêm marcados. Marque outros só se tiver certeza.</div>
            </div>
            {itensDaAta.map((i) => {
              const ok = confirmado(i.numeroItem);
              const qtd = api?.get(parseInt(i.numeroItem, 10));
              const marcado = marcados.has(i.numeroItem);
              return (
                <label
                  key={i.numeroItem}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.75rem', border: `1px solid ${marcado ? '#bfdbfe' : '#e2e8f0'}`, background: marcado ? '#eff6ff' : '#ffffff', borderRadius: '8px', cursor: podeAgir ? 'pointer' : 'default' }}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(i.numeroItem)} disabled={!podeAgir || ocupado} data-testid={`conferencia-item-${i.numeroItem}`} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0c326f' }}>Item {i.numeroItem}</span>
                    {!ok && marcado && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#b45309' }}>não confirmado pela API</span>}
                    {i.descricao && (
                      <span title={i.descricao} style={{ display: 'block', fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {i.descricao}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>Qtd contratada</span>
                    <span style={{ fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums', color: ok ? '#0f172a' : '#94a3b8' }}>
                      {ok && qtd != null ? qtd.toLocaleString('pt-BR') : 'N/D'}
                    </span>
                  </span>
                </label>
              );
            })}
          </section>
        )}
      </div>
    </Modal>
  );
};
