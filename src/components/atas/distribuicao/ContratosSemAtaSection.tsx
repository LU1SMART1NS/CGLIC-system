import React from 'react';
import { ArrowRight, RotateCcw, UserPlus, XCircle } from 'lucide-react';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { carteiraButton, carteiraTableShell } from '../../carteira/carteiraStyles';
import { useConfirmDialog } from '../../../design-system/components/ConfirmDialog';
import { useToast } from '../../../design-system/components/Toast';
import { useConfirmarContratoSemAta, useDesfazerContratoSemAta } from '../../../hooks/useContratosSemAta';
import type { ContratoSemAtaConfirmacao } from '../../../services/contratoSemAtaService';
import { formatDateBR } from '../../../utils/format';
import type { ItemFila, MotivoSugestao, PendenciasDistribuicao } from './contratosSemAta';

const PAGE_SIZE = 10;
const MORE_SIZE = 20;

type Aba = 'DECISAO' | 'AGUARDAM' | 'NAO_PERTENCEM';

const ROTULO_MOTIVO: Record<MotivoSugestao, string> = {
  COMPRA_E_FORNECEDOR: 'mesma compra e fornecedor',
  COMPRA: 'mesma compra',
  FORNECEDOR: 'mesmo fornecedor'
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface ContratosSemAtaSectionProps {
  pendencias: PendenciasDistribuicao;
  confirmacoes: Record<string, ContratoSemAtaConfirmacao>;
  /** Só o coordenador atribui e marca "não pertence a ata"; o leitor só consulta. */
  podeAgir: boolean;
  /** Abre o "Para quem atribuo?" só para o contrato. */
  onAtribuir: (item: ItemFila) => void;
}

/** Texto da pista de ata do contrato, em linguagem do coordenador. */
function textoPista(item: ItemFila): React.ReactNode {
  const fortes = item.sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR');
  if (fortes.length > 0) {
    return (
      <>
        {fortes.map((s, i) => (
          <React.Fragment key={s.numeroAta}>
            {i > 0 && ' ou '}
            <strong>Ata {s.numeroAta}</strong>
            <span style={{ color: '#64748b' }}> ({s.gestorNome ? `gestor ${s.gestorNome}` : 'sem gestor'})</span>
          </React.Fragment>
        ))}
        <div style={{ color: '#1e3a8a' }}>
          {fortes.some((s) => s.gestorNome)
            ? 'O gestor vem com o vínculo, feito pelo servidor na Ata 360.'
            : 'Atribua a ata acima: o contrato a acompanha quando for vinculado.'}
        </div>
      </>
    );
  }
  if (item.sugestoes.length > 0) {
    const s = item.sugestoes[0];
    return (
      <>
        Pista parcial: <strong>ata {s.numeroAta}</strong> <span style={{ color: '#64748b' }}>({ROTULO_MOTIVO[s.motivo]})</span>
      </>
    );
  }
  return <span style={{ color: '#94a3b8' }}>Nenhuma ata provável</span>;
}

/**
 * Contratos sem gestor e sem ata: o coordenador decide os que não têm pista forte (atribui direto ou marca "não
 * pertence a ata", que tira o contrato das sugestões de vínculo); os que têm ata provável só aguardam o vínculo.
 */
export const ContratosSemAtaSection: React.FC<ContratosSemAtaSectionProps> = ({ pendencias, confirmacoes, podeAgir, onAtribuir }) => {
  const [aba, setAba] = React.useState<Aba>('DECISAO');
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const confirmar = useConfirmarContratoSemAta();
  const desfazer = useDesfazerContratoSemAta();
  const confirmDialog = useConfirmDialog();
  const toast = useToast();

  React.useEffect(() => setVisible(PAGE_SIZE), [aba]);

  const listas: Record<Aba, ItemFila[]> = {
    DECISAO: pendencias.precisamDecisao,
    AGUARDAM: pendencias.aguardamVinculo,
    NAO_PERTENCEM: pendencias.naoPertencem
  };
  const lista = listas[aba];
  const shown = lista.slice(0, visible);

  const naoPertence = async (item: ItemFila) => {
    const ok = await confirmDialog({
      title: 'Contrato que não pertence a ata',
      message: (
        <>
          Confirmar que o contrato <strong>{item.numero}</strong> não veio de ata de registro de preços? Ele deixa de aparecer nas
          sugestões de vínculo e recebe gestor direto. Dá para desfazer em "Não pertencem a ata".
        </>
      ),
      confirmLabel: 'Confirmar e atribuir gestor'
    });
    if (!ok) return;
    try {
      await confirmar.mutateAsync(item.contractKey);
      onAtribuir(item);
    } catch (err: any) {
      toast.error(`Não foi possível marcar: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const desfazerMarcacao = async (item: ItemFila) => {
    try {
      await desfazer.mutateAsync(item.contractKey);
    } catch (err: any) {
      toast.error(`Não foi possível desfazer: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const abas: Array<{ id: Aba; label: string; count: number; title: string }> = [
    { id: 'DECISAO', label: 'Precisam de decisão', count: pendencias.precisamDecisao.length, title: 'Sem ata provável ou só com pista parcial: atribua direto ou marque que não pertence a ata' },
    { id: 'AGUARDAM', label: 'Aguardam vínculo à ata', count: pendencias.aguardamVinculo.length, title: 'Com ata provável (mesma compra e fornecedor): o gestor vem com o vínculo' },
    { id: 'NAO_PERTENCEM', label: 'Não pertencem a ata', count: pendencias.naoPertencem.length, title: 'Marcados pelo coordenador' }
  ];

  const total = pendencias.precisamDecisao.length + pendencias.aguardamVinculo.length;

  return (
    <section id="distribuicao-sem-ata" data-testid="distribuicao-sem-ata" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', scrollMarginTop: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          Contratos sem gestor e sem ata <span style={{ color: total ? '#b45309' : '#15803d' }}>({total})</span>
        </h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Contratos vigentes que ainda não estão vinculados a uma ata e não têm gestor. Quem tem ata provável recebe o gestor
          quando o servidor vincular; os demais, você atribui direto ou marca que não pertencem a ata.
        </p>
      </div>

      <div role="tablist" aria-label="Situação" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            title={a.title}
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            data-testid={`sem-ata-aba-${a.id}`}
            style={{
              ...carteiraButton,
              minHeight: '36px',
              background: aba === a.id ? '#0c326f' : '#ffffff',
              borderColor: aba === a.id ? '#0c326f' : '#cbd5e1',
              color: aba === a.id ? '#ffffff' : '#0c326f'
            }}
          >
            {a.label} ({a.count})
          </button>
        ))}
      </div>

      <div style={{ ...carteiraTableShell, padding: '0 0.9rem' }}>
        {shown.length === 0 ? (
          <div style={{ padding: '1rem 0', fontSize: '0.85rem', color: '#64748b' }}>Nenhum contrato nesta situação.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((item) => {
              const conf = confirmacoes[item.contractKey];
              return (
                <li
                  key={item.contractKey}
                  data-testid={`sem-ata-item-${item.contractKey}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.65rem 0', borderTop: '1px solid #e2e8f0' }}
                >
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Contrato {item.numero}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.fornecedorNome || '—'}</span>
                    </div>
                    <div title={item.objeto} style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.objeto || '—'}
                    </div>
                    {aba === 'NAO_PERTENCEM' && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                        Gestor: <strong style={{ color: item.gestorNome ? '#0f172a' : '#b45309' }}>{item.gestorNome || 'sem gestor'}</strong>
                        {conf && <> · marcado{conf.confirmadoPorNome ? ` por ${conf.confirmadoPorNome}` : ''}{conf.confirmadoEm ? ` em ${formatDateBR(conf.confirmadoEm)}` : ''}</>}
                      </div>
                    )}
                  </div>

                  <CarteiraPrazoPill faixa={item.faixa} diasRestantes={item.dias} />

                  {aba !== 'NAO_PERTENCEM' && <div style={{ flex: '1 1 220px', minWidth: 0, fontSize: '0.78rem' }}>{textoPista(item)}</div>}

                  {podeAgir && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {aba === 'NAO_PERTENCEM' ? (
                        <>
                          {!item.gestorNome && (
                            <button type="button" onClick={() => onAtribuir(item)} style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                              <UserPlus size={13} /> Atribuir gestor
                            </button>
                          )}
                          <button type="button" onClick={() => desfazerMarcacao(item)} disabled={desfazer.isPending} style={{ ...carteiraButton, color: '#475569' }}>
                            <RotateCcw size={13} /> Desfazer
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => naoPertence(item)}
                            disabled={confirmar.isPending}
                            data-testid={`sem-ata-nao-pertence-${item.contractKey}`}
                            style={{ ...carteiraButton, color: '#475569' }}
                          >
                            <XCircle size={13} /> Não pertence a ata
                          </button>
                          <button
                            type="button"
                            onClick={() => onAtribuir(item)}
                            data-testid={`sem-ata-atribuir-${item.contractKey}`}
                            title={aba === 'AGUARDAM' ? 'O contrato tem ata provável: se for vinculado, passa ao gestor da ata.' : undefined}
                            style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                          >
                            <UserPlus size={13} /> {aba === 'AGUARDAM' ? 'Atribuir assim mesmo' : 'Atribuir'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0', borderTop: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b' }}>
          <span>Mostrando {shown.length} de {plural(lista.length, 'contrato', 'contratos')}</span>
          {shown.length < lista.length && (
            <button type="button" onClick={() => setVisible((v) => v + MORE_SIZE)} style={carteiraButton}>
              Mostrar mais {Math.min(MORE_SIZE, lista.length - shown.length)} <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
