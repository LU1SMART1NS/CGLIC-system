import React, { useState } from 'react';
import { InfoHint } from '../../design-system/components/InfoHint';
import { AppButton } from '../../design-system/components/AppButton';
import { useToast } from '../../design-system/components/Toast';
import { useRemoverEmendaDoPedido, useSalvarValorOficio } from '../../hooks/useEmendas';
import { AppInput } from '../../design-system/components/FormFields';
import { formatCurrency } from '../../utils/format';
import { lerValorBR, mascaraValorBR } from '../../utils/mascaras';
import { numeroDaEmendaEmTexto } from '../../utils/emendasPedidos';
import { dataBR } from '../../utils/emendasKits';
import { carteiraDetalhe, carteiraSubtitle } from '../carteira/carteiraStyles';
import type { PedidoEmenda } from '../../services/emendasService';
import { LigarEmendaModal } from './LigarEmendaModal';
import { pedidoEmTexto } from '../../utils/emendasNomeDoPedido';

const linha: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0.4rem 0.55rem', borderRadius: 6, border: '1px solid var(--color-border, #e2e8f0)' };

/**
 * Emendas do pedido (migration 211): a conferida com o ofício e as outras que completaram o pedido (a sobra de uma emenda
 * antiga do mesmo parlamentar). As notas de qualquer uma entram nos itens. A outra emenda só sai sem nota dela nos itens.
 */
export const EmendasDoPedido: React.FC<{ p: PedidoEmenda; podeGerir: boolean }> = ({ p, podeGerir }) => {
  const [adicionando, setAdicionando] = useState(false);
  const [tirando, setTirando] = useState<string | null>(null);
  const [editandoOficio, setEditandoOficio] = useState(false);
  const remover = useRemoverEmendaDoPedido();
  const toast = useToast();
  if (!p.siopEmenda) return null;

  const tirar = async (id: string, texto: string) => {
    try {
      await remover.mutateAsync({ id, versao: p.versao });
      toast.success(`Emenda ${texto} tirada do ${pedidoEmTexto(p)}.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTirando(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid={`emendas-pedido-emendas-${p.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ ...carteiraDetalhe, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.outrasEmendas.length ? 'Emendas do pedido' : 'Emenda do pedido'}</span>
        <span style={{ flex: 1 }} />
        {podeGerir && p.etapa !== 'CANCELADO' && (
          <AppButton size="xs" variant="link" onClick={() => setAdicionando(true)} data-testid={`emendas-pedido-emenda-adicionar-${p.id}`}>
            + Adicionar emenda
          </AppButton>
        )}
      </div>
      <div style={linha}>
        <span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>
            {p.siopEmendaAno ? `${p.siopEmendaAno} · ` : ''}
            {numeroDaEmendaEmTexto(p.siopEmenda)}
          </b>
          <span style={{ ...carteiraSubtitle, display: 'block' }}>conferida com o ofício{p.siopGnd ? ` · ${p.siopGnd}` : ''}</span>
          <span style={{ ...carteiraSubtitle, display: 'block' }} data-testid={`emendas-pedido-valor-oficio-${p.id}`}>
            {p.oficioValor != null ? (
              <>
                Valor do ofício <b>{formatCurrency(p.oficioValor)}</b>
                {p.oficioValorDocumentoSei ? ` · SEI ${p.oficioValorDocumentoSei}` : ''}
                {p.oficioValorRetificador ? ' (retificador)' : ''}
              </>
            ) : (
              <b style={{ color: 'var(--color-warning-text, #8a5300)' }}>Valor do ofício a informar</b>
            )}
          </span>
        </span>
        {podeGerir && p.etapa !== 'CANCELADO' && !editandoOficio && (
          <AppButton size="xs" variant="link" onClick={() => setEditandoOficio(true)} data-testid={`emendas-pedido-oficio-editar-${p.id}`}>
            {p.oficioValor != null ? 'Alterar' : 'Informar'}
          </AppButton>
        )}
      </div>
      {editandoOficio && <ValorDoOficio p={p} onClose={() => setEditandoOficio(false)} />}
      {p.outrasEmendas.map((o) => {
        const texto = `${o.ano} · ${numeroDaEmendaEmTexto(o.numero)}`;
        return (
          <div key={o.id} style={{ ...linha, borderStyle: 'dashed' }} data-testid={`emendas-pedido-emenda-outra-${o.numero}`}>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{texto}</b>
              <span style={{ ...carteiraSubtitle, display: 'block' }}>
                outra emenda · ligada {o.criadoPorNome ? `por ${o.criadoPorNome} ` : ''}em {dataBR(o.criadoEm.slice(0, 10))}
                {o.documentoSei ? ` · SEI ${o.documentoSei}` : ''}
              </span>
            </span>
            {o.observacao && <InfoHint label="Ver a observação da ligação" content={o.observacao} testId={`emendas-pedido-emenda-observacao-${o.numero}`} />}
            {podeGerir &&
              (tirando === o.id ? (
                <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <span style={carteiraDetalhe}>Tirar?</span>
                  <AppButton size="xs" variant="ghostDanger" onClick={() => void tirar(o.id, texto)} isLoading={remover.isPending} data-testid={`emendas-pedido-emenda-tirar-sim-${o.numero}`}>
                    Sim
                  </AppButton>
                  <AppButton size="xs" variant="link" onClick={() => setTirando(null)} disabled={remover.isPending}>
                    Não
                  </AppButton>
                </span>
              ) : (
                <AppButton size="xs" variant="link" onClick={() => setTirando(o.id)} data-testid={`emendas-pedido-emenda-tirar-${o.numero}`}>
                  Tirar
                </AppButton>
              ))}
          </div>
        );
      })}
      {adicionando && <LigarEmendaModal pedido={p} onClose={() => setAdicionando(false)} />}
    </div>
  );
};

/** Valor do ofício do pedido já conferido (migration 231): o que ficou a informar, ou o retificador que mudou o valor. */
const ValorDoOficio: React.FC<{ p: PedidoEmenda; onClose: () => void }> = ({ p, onClose }) => {
  const salvar = useSalvarValorOficio();
  const toast = useToast();
  const [valor, setValor] = useState(p.oficioValor != null ? p.oficioValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const [sei, setSei] = useState(p.oficioValorDocumentoSei ?? p.oficioDocumentoSei ?? '');
  const [retificador, setRetificador] = useState(p.oficioValorRetificador ?? false);
  const lido = lerValorBR(valor);
  const seiLimpo = sei.replace(/\D/g, '');
  const ok = lido != null && lido > 0 && /^[0-9]{7,10}$/.test(seiLimpo);
  const gravar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ok) return;
    try {
      await salvar.mutateAsync({ id: p.id, versao: p.versao, valor: lido!, documentoSei: seiLimpo, retificador });
      toast.success(`Valor do ofício do ${pedidoEmTexto(p)} gravado.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <form onSubmit={gravar} style={{ ...linha, flexWrap: 'wrap', alignItems: 'flex-end' }} data-testid={`emendas-pedido-oficio-form-${p.id}`}>
      <div style={{ flex: '1 1 10rem' }}>
        <AppInput label="Valor do ofício (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(mascaraValorBR(e.target.value, valor))} data-testid="emendas-pedido-oficio-valor" />
      </div>
      <div style={{ flex: '1 1 8rem' }}>
        <AppInput label="Documento SEI do ofício" inputMode="numeric" hint="Só números, 7 a 10 dígitos." value={sei} onChange={(e) => setSei(e.target.value)} data-testid="emendas-pedido-oficio-sei" />
      </div>
      <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.82rem' }}>
        <input type="checkbox" checked={retificador} onChange={(e) => setRetificador(e.target.checked)} /> Retificador
      </label>
      <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
        <AppButton size="xs" variant="link" type="button" onClick={onClose} disabled={salvar.isPending}>
          Cancelar
        </AppButton>
        <AppButton size="xs" type="submit" disabled={!ok} isLoading={salvar.isPending} data-testid="emendas-pedido-oficio-salvar">
          Salvar
        </AppButton>
      </span>
    </form>
  );
};
