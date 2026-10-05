import React from 'react';
import { ArrowRight, Link2, RotateCcw, UserPlus, XCircle } from 'lucide-react';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { carteiraButton, carteiraSelect, carteiraTableShell } from '../../carteira/carteiraStyles';
import { useConfirmDialog } from '../../../design-system/components/ConfirmDialog';
import { useToast } from '../../../design-system/components/Toast';
import { useConfirmarContratoSemAta, useDesfazerContratoSemAta } from '../../../hooks/useContratosSemAta';
import type { ContratoSemAtaConfirmacao } from '../../../services/contratoSemAtaService';
import { formatDateBR } from '../../../utils/format';
import type { AtaSugerida, FilaSemAta, ItemFila, MotivoSugestao, SituacaoFila } from './contratosSemAta';

const PAGE_SIZE = 10;
const MORE_SIZE = 20;

type Filtro = SituacaoFila | 'TODOS' | 'CONFIRMADOS';

const ROTULO_SITUACAO: Record<SituacaoFila, string> = {
  UNICA: 'Uma ata provável',
  VARIAS: 'Mais de uma ata',
  PARCIAL: 'Pista parcial',
  NENHUMA: 'Sem ata provável'
};

const ROTULO_MOTIVO: Record<MotivoSugestao, string> = {
  COMPRA_E_FORNECEDOR: 'mesma compra e fornecedor',
  COMPRA: 'mesma compra',
  FORNECEDOR: 'mesmo fornecedor'
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface ContratosSemAtaSectionProps {
  fila: FilaSemAta;
  confirmacoes: Record<string, ContratoSemAtaConfirmacao>;
  /** Só o coordenador vincula, confirma "sem ata" e atribui; o leitor só consulta. */
  podeAgir: boolean;
  /** Abre o modal "Vincular Contrato" da Ata 360 para a ata escolhida, já com o contrato. */
  onVincular: (item: ItemFila, ata: AtaSugerida) => void;
  /** Abre o "Para quem atribuo?" só para o contrato. */
  onAtribuir: (item: ItemFila) => void;
}

/**
 * Fila "Contratos sem ata": contratos vigentes que ainda não estão vinculados a item de ata. Pela regra da CGLIC,
 * quem cuida da ata cuida dos contratos dela, então cada contrato precisa ser vinculado à ata (pelo mesmo modal da
 * Ata 360) ou confirmado como "sem ata" — e só então recebe gestor direto.
 */
export const ContratosSemAtaSection: React.FC<ContratosSemAtaSectionProps> = ({ fila, confirmacoes, podeAgir, onVincular, onAtribuir }) => {
  const [filtro, setFiltro] = React.useState<Filtro>('TODOS');
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const [ataEscolhida, setAtaEscolhida] = React.useState<Record<string, string>>({});
  const confirmar = useConfirmarContratoSemAta();
  const desfazer = useDesfazerContratoSemAta();
  const confirmDialog = useConfirmDialog();
  const toast = useToast();

  React.useEffect(() => setVisible(PAGE_SIZE), [filtro]);

  const lista =
    filtro === 'CONFIRMADOS' ? fila.confirmados : filtro === 'TODOS' ? fila.pendentes : fila.pendentes.filter((i) => i.situacao === filtro);
  const shown = lista.slice(0, visible);

  const naoTemAta = async (item: ItemFila) => {
    const ok = await confirmDialog({
      title: 'Contrato sem ata',
      message: (
        <>
          Confirmar que o contrato <strong>{item.numero}</strong> não veio de uma ata de registro de preços? Ele sai desta fila e
          recebe gestor direto. Dá para desfazer em "Confirmados sem ata".
        </>
      ),
      confirmLabel: 'Confirmar e atribuir gestor'
    });
    if (!ok) return;
    try {
      await confirmar.mutateAsync(item.contractKey);
      onAtribuir(item);
    } catch (err: any) {
      toast.error(`Não foi possível confirmar: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const desfazerConfirmacao = async (item: ItemFila) => {
    try {
      await desfazer.mutateAsync(item.contractKey);
    } catch (err: any) {
      toast.error(`Não foi possível desfazer: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const filtros: Array<{ id: Filtro; label: string; count: number }> = [
    { id: 'TODOS', label: 'Todos', count: fila.pendentes.length },
    { id: 'UNICA', label: ROTULO_SITUACAO.UNICA, count: fila.contagem.UNICA },
    { id: 'VARIAS', label: ROTULO_SITUACAO.VARIAS, count: fila.contagem.VARIAS },
    { id: 'PARCIAL', label: ROTULO_SITUACAO.PARCIAL, count: fila.contagem.PARCIAL },
    { id: 'NENHUMA', label: ROTULO_SITUACAO.NENHUMA, count: fila.contagem.NENHUMA },
    { id: 'CONFIRMADOS', label: 'Confirmados sem ata', count: fila.confirmados.length }
  ];

  return (
    <section id="distribuicao-sem-ata" data-testid="distribuicao-sem-ata" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', scrollMarginTop: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          Contratos sem ata <span style={{ color: '#b45309' }}>({fila.pendentes.length})</span>
        </h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Quem cuida da ata cuida dos contratos dela. Vincule cada contrato à sua ata (os itens e a quantidade contratada são
          conferidos no mesmo modal da Ata 360) ou, se ele não veio de ata, confirme e atribua o gestor direto.
        </p>
      </div>

      <div role="tablist" aria-label="Situação" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            data-testid={`sem-ata-filtro-${f.id}`}
            style={{
              ...carteiraButton,
              minHeight: '36px',
              background: filtro === f.id ? '#0c326f' : '#ffffff',
              borderColor: filtro === f.id ? '#0c326f' : '#cbd5e1',
              color: filtro === f.id ? '#ffffff' : '#0c326f'
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      <div style={{ ...carteiraTableShell, padding: '0 0.9rem' }}>
        {shown.length === 0 ? (
          <div style={{ padding: '1rem 0', fontSize: '0.85rem', color: '#64748b' }}>
            {filtro === 'CONFIRMADOS' ? 'Nenhum contrato confirmado como sem ata.' : 'Nenhum contrato nesta situação.'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((item) => {
              const confirmado = filtro === 'CONFIRMADOS';
              const fortes = item.sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR');
              const opcoes = fortes.length > 0 ? fortes : item.sugestoes;
              const escolhida = opcoes.find((s) => `${s.numeroAta}|${s.uasg}` === ataEscolhida[item.contractKey]) ?? opcoes[0];
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
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Gestor: <strong style={{ color: item.gestorNome ? '#0f172a' : '#b45309' }}>{item.gestorNome || 'sem gestor'}</strong>
                      {confirmado && conf && (
                        <> · confirmado sem ata{conf.confirmadoPorNome ? ` por ${conf.confirmadoPorNome}` : ''}{conf.confirmadoEm ? ` em ${formatDateBR(conf.confirmadoEm)}` : ''}</>
                      )}
                    </div>
                  </div>

                  <CarteiraPrazoPill faixa={item.faixa} diasRestantes={item.dias} />

                  {!confirmado && (
                    <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.78rem' }}>
                      {opcoes.length === 0 ? (
                        <span style={{ color: '#94a3b8' }}>Nenhuma ata provável</span>
                      ) : opcoes.length === 1 ? (
                        <span>
                          <strong>Ata {opcoes[0].numeroAta}</strong>{' '}
                          <span style={{ color: '#64748b' }}>· {ROTULO_MOTIVO[opcoes[0].motivo]}{opcoes[0].gestorNome ? ` · gestor ${opcoes[0].gestorNome}` : ''}</span>
                        </span>
                      ) : (
                        <select
                          value={escolhida ? `${escolhida.numeroAta}|${escolhida.uasg}` : ''}
                          onChange={(e) => setAtaEscolhida((prev) => ({ ...prev, [item.contractKey]: e.target.value }))}
                          aria-label={`Ata para o contrato ${item.numero}`}
                          style={{ ...carteiraSelect, maxWidth: '100%' }}
                        >
                          {opcoes.map((s) => (
                            <option key={`${s.numeroAta}|${s.uasg}`} value={`${s.numeroAta}|${s.uasg}`}>
                              Ata {s.numeroAta} · {ROTULO_MOTIVO[s.motivo]}{s.gestorNome ? ` · ${s.gestorNome}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {podeAgir && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {confirmado ? (
                        <>
                          <button type="button" onClick={() => onAtribuir(item)} style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                            <UserPlus size={13} /> Atribuir gestor
                          </button>
                          <button type="button" onClick={() => desfazerConfirmacao(item)} disabled={desfazer.isPending} style={{ ...carteiraButton, color: '#475569' }}>
                            <RotateCcw size={13} /> Desfazer
                          </button>
                        </>
                      ) : (
                        <>
                          {escolhida && (
                            <button
                              type="button"
                              onClick={() => onVincular(item, escolhida)}
                              disabled={!escolhida.temItens}
                              title={escolhida.temItens ? `Vincular à ata ${escolhida.numeroAta}` : 'A ata não tem itens no banco: sincronize as atas antes de vincular.'}
                              data-testid={`sem-ata-vincular-${item.contractKey}`}
                              style={{ ...carteiraButton, background: '#0c326f', borderColor: '#0c326f', color: '#ffffff', opacity: escolhida.temItens ? 1 : 0.5 }}
                            >
                              <Link2 size={13} /> Vincular
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => naoTemAta(item)}
                            disabled={confirmar.isPending}
                            data-testid={`sem-ata-confirmar-${item.contractKey}`}
                            style={{ ...carteiraButton, color: '#475569' }}
                          >
                            <XCircle size={13} /> Não tem ata
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
