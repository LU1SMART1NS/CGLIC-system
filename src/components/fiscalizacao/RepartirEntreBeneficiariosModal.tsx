import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useRepartirEntregaEntreBeneficiarios } from '../../hooks/useFiscalizacao';
import { useBeneficiariosEmendas } from '../../hooks/useEmendas';
import type { BeneficiarioEmenda } from '../../services/emendasService';
import { localDoBeneficiario } from '../../services/emendasService';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { casaBusca, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { MOTIVO_MINIMO } from '../../utils/fiscalizacao';
import { etapaDef, nomeDoItem } from '../../utils/fiscalizacaoEntregas';
import { resumoDaRepartição } from '../../utils/fiscalizacaoRepartir';

const MAX_BUSCA = 6;
const seiValido = (s: string) => /^\d{7,10}$/.test(s);
const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const fmt = (n: number) => n.toLocaleString('pt-BR');

interface Parte { beneficiarioId: string; nome: string; sigla: string | null; local: string | null; qtd: string; atual: boolean }

const parteDe = (b: BeneficiarioEmenda): Parte => ({ beneficiarioId: b.id, nome: b.nome, sigla: b.sigla, local: localDoBeneficiario(b), qtd: '', atual: false });

/**
 * Repartir um item entre beneficiários (como o "Repartir" da Reserva nas Emendas): uma linha por órgão com a
 * quantidade; a soma tem que fechar com a quantidade do item. A 1ª parte fica no item de hoje, as outras viram itens
 * novos com a mesma etapa, data prevista e programa. Motivo e SEI uma vez só, no histórico de cada parte.
 * Só item que não veio de emenda (o de emenda já chega repartido pelas linhas do pedido).
 */
export const RepartirEntreBeneficiariosModal: React.FC<{ entrega: EntregaFiscalizacao; onClose: (feito: boolean) => void }> = ({ entrega: e, onClose }) => {
  const toast = useToast();
  const repartir = useRepartirEntregaEntreBeneficiarios();
  const { data: cadastro = [], isLoading } = useBeneficiariosEmendas();
  const [partes, setPartes] = useState<Parte[]>(() => [
    { beneficiarioId: e.beneficiarioId ?? '', nome: e.beneficiarioNome ?? e.beneficiarioTexto ?? 'Beneficiário de hoje', sigla: e.beneficiarioSigla, local: e.municipio && e.uf ? `${e.municipio}/${e.uf}` : e.uf, qtd: String(e.quantidade), atual: true }
  ]);
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [sei, setSei] = useState('');

  const ja = new Set(partes.map((p) => p.beneficiarioId));
  const achados = useMemo(
    () =>
      busca.trim().length < 2
        ? []
        : cadastro
            .filter((b) => b.ativo && !ja.has(b.id) && casaBusca(textoDeBuscaDoBeneficiario(b), busca))
            .sort((a, b) => Number(b.entregaUf === e.uf) - Number(a.entregaUf === e.uf))
            .slice(0, MAX_BUSCA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busca, cadastro, partes, e.uf]
  );

  const r = resumoDaRepartição(partes, e.quantidade);
  const ok = r.fecha && r.comQtd >= 2 && !r.semCadastro && motivo.trim().length >= MOTIVO_MINIMO && seiValido(sei);

  const mudar = (i: number, qtd: string) => setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, qtd: qtd.replace(/\D/g, '') } : p)));
  const incluir = (b: BeneficiarioEmenda) => { setPartes((ps) => [...ps, parteDe(b)]); setBusca(''); };
  const tirar = (i: number) => setPartes((ps) => ps.filter((_, j) => j !== i));

  const salvar = () => {
    repartir.mutate(
      { id: e.id, partes: r.paraGravar, motivo, documentoSei: sei },
      {
        onSuccess: () => { toast.success(`Item repartido em ${r.paraGravar.length} itens.`); onClose(true); },
        onError: (err) => toast.error(`Não foi possível repartir: ${erroDe(err)}`)
      }
    );
  };

  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      size="lg"
      title="Repartir entre beneficiários"
      subtitle={`${fmt(e.quantidade)}× ${nomeDoItem(e)} · Contrato ${e.contratoNumero}`}
      dismissible={!repartir.isPending}
      testId="fisc-repartir"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={repartir.isPending} />
          <ActionButton action="salvar" label={r.comQtd >= 2 ? `Repartir em ${r.comQtd} itens` : 'Repartir'} disabled={!ok} isLoading={repartir.isPending} onClick={salvar} data-testid="fisc-repartir-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div className="reserva-repartir" data-testid="fisc-repartir-partes">
          <span className="reserva-rotulo">Quantas unidades vão para cada beneficiário</span>
          {partes.map((p, i) => (
            <div key={p.beneficiarioId || 'atual'} className="reserva-repartir__linha" style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 28px' }}>
              <span style={{ minWidth: 0 }}>
                <b style={{ fontSize: '0.88rem' }}>{p.nome}</b>
                {p.sigla && <span style={{ color: '#475569', fontWeight: 700, fontSize: '0.8rem' }}> · {p.sigla}</span>}
                <small className="reserva-mudo">{[p.local, p.atual ? 'hoje' : null].filter(Boolean).map((t) => ` · ${t}`).join('')}</small>
              </span>
              <input
                className="reserva-campo reserva-repartir__qtd"
                inputMode="numeric"
                placeholder="0"
                aria-label={`Quantidade para ${p.nome}`}
                value={p.qtd}
                onChange={(ev) => mudar(i, ev.target.value)}
                data-testid={`fisc-repartir-qtd-${i}`}
              />
              {p.atual ? (
                <span />
              ) : (
                <AppButton variant="ghost" size="xs" onClick={() => tirar(i)} aria-label={`Tirar ${p.nome}`} data-testid={`fisc-repartir-tirar-${i}`}>
                  <X size={14} aria-hidden="true" />
                </AppButton>
              )}
            </div>
          ))}
          <div className="reserva-repartir__pe">
            <span className={r.fecha ? 'reserva-ok' : 'reserva-alerta'} data-testid="fisc-repartir-soma">{r.texto}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <AppInput label="Incluir beneficiário" placeholder="Procure no cadastro: nome, sigla ou cidade" value={busca} onChange={(ev) => setBusca(ev.target.value)} disabled={isLoading} data-testid="fisc-repartir-busca" />
          {achados.map((b) => (
            <AppButton
              key={b.id}
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => incluir(b)}
              style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '0.45rem 0.7rem' }}
              data-testid={`fisc-repartir-incluir-${b.id}`}
            >
              <span style={{ display: 'block' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>+ {b.nome}</span>
                {b.sigla && <span style={{ color: '#475569', fontWeight: 700, fontSize: '0.8rem' }}> · {b.sigla}</span>}
                <span style={{ ...carteiraDetalhe, display: 'block', marginTop: '0.1rem' }}>{localDoBeneficiario(b) ?? 'sem cidade no cadastro'}</span>
              </span>
            </AppButton>
          ))}
          {busca.trim().length >= 2 && achados.length === 0 && <span style={carteiraDetalhe}>Nada no cadastro com “{busca.trim()}”.</span>}
        </div>

        <AppTextarea label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: o ofício da DFNSP indicou as vagas do curso por órgão" hint="Fica no histórico de cada parte." data-testid="fisc-repartir-motivo" />
        <AppInput label="Documento SEI" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 37530982" hint="Número do documento que indica a repartição." data-testid="fisc-repartir-sei" />

        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
          {r.semCadastro
            ? 'O beneficiário de hoje não está no cadastro: ligue ao cadastro antes, ou deixe a quantidade dele em 0.'
            : `Cada parte vira um item com a etapa de hoje (${etapaDef(e.etapa).nome}), a mesma data prevista e o mesmo programa; depois, cada um anda sozinho. Para passar tudo a outro órgão, use Trocar beneficiário.`}
        </span>
      </div>
    </Modal>
  );
};
