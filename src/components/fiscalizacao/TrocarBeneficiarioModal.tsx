import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useTrocarBeneficiarioEntrega } from '../../hooks/useFiscalizacao';
import { useBeneficiariosEmendas } from '../../hooks/useEmendas';
import type { BeneficiarioEmenda } from '../../services/emendasService';
import { localDoBeneficiario } from '../../services/emendasService';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { casaBusca, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { MOTIVO_MINIMO } from '../../utils/fiscalizacao';
import { nomeDoItem, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';

const MAX_BUSCA = 8;
const seiValido = (s: string) => /^\d{7,10}$/.test(s);
const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' };

const Opcao: React.FC<{ b: BeneficiarioEmenda; marcado: boolean; onEscolher: () => void; testId: string }> = ({ b, marcado, onEscolher, testId }) => (
  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.55rem 0.7rem', border: `1px solid ${marcado ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: marcado ? 'var(--primary-soft, #eef4ff)' : 'var(--bg-card)', cursor: 'pointer' }}>
    <input type="radio" name="fisc-trocar-benef" checked={marcado} onChange={onEscolher} style={{ accentColor: 'var(--primary)', marginTop: 3, width: 16, height: 16 }} data-testid={testId} />
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.nome}</span>
      {b.sigla && <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}> · {b.sigla}</span>}
      <span style={{ ...carteiraDetalhe, display: 'block', marginTop: '0.1rem' }}>
        {[localDoBeneficiario(b), b.razaoSocial && b.razaoSocial !== b.nome ? b.razaoSocial : null].filter(Boolean).join(' · ') || 'sem cidade no cadastro'}
      </span>
    </span>
  </label>
);

/**
 * Trocar o beneficiário de um item que não veio de emenda (planilha da SFC ou incluído à mão). Escolhe outro do
 * cadastro, com motivo e número SEI; a troca fica no histórico do item. Item de emenda troca no Pedido 360.
 */
export const TrocarBeneficiarioModal: React.FC<{ entrega: EntregaFiscalizacao; onClose: (feito: boolean) => void }> = ({ entrega: e, onClose }) => {
  const toast = useToast();
  const trocar = useTrocarBeneficiarioEntrega();
  const { data: cadastro = [], isLoading } = useBeneficiariosEmendas();
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [sei, setSei] = useState('');

  const atual = rotuloDoBeneficiario(e);
  const achados = useMemo(
    () =>
      busca.trim().length < 2
        ? []
        : cadastro
            .filter((b) => b.ativo && b.id !== e.beneficiarioId && casaBusca(textoDeBuscaDoBeneficiario(b), busca))
            // Os da mesma UF do item primeiro.
            .sort((a, b) => Number(b.entregaUf === e.uf) - Number(a.entregaUf === e.uf))
            .slice(0, MAX_BUSCA),
    [busca, cadastro, e.beneficiarioId, e.uf]
  );
  // O escolhido continua à vista mesmo depois de mudar a busca.
  const escolhidoFora = escolhido && !achados.some((b) => b.id === escolhido) ? cadastro.find((b) => b.id === escolhido) : undefined;
  const ok = Boolean(escolhido) && motivo.trim().length >= MOTIVO_MINIMO && seiValido(sei);

  const salvar = () => {
    if (!escolhido) return;
    const novo = cadastro.find((b) => b.id === escolhido);
    trocar.mutate(
      { id: e.id, beneficiarioId: escolhido, motivo, documentoSei: sei },
      {
        onSuccess: () => { toast.success(`O item agora é de ${novo?.nome ?? 'outro beneficiário'}.`); onClose(true); },
        onError: (err) => toast.error(`Não foi possível trocar: ${erroDe(err)}`)
      }
    );
  };

  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      size="lg"
      title="Trocar o beneficiário"
      subtitle={`${e.quantidade.toLocaleString('pt-BR')}× ${nomeDoItem(e)} · Contrato ${e.contratoNumero}`}
      dismissible={!trocar.isPending}
      testId="fisc-trocar-benef"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={trocar.isPending} />
          <ActionButton action="salvar" label="Trocar" disabled={!ok} isLoading={trocar.isPending} onClick={salvar} data-testid="fisc-trocar-benef-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ padding: '0.65rem 0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-subtle, #f8fafc)' }} data-testid="fisc-trocar-benef-atual">
          <div style={rotulo}>Hoje</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {e.beneficiarioNome ?? atual.principal}
            {e.beneficiarioSigla && <span style={{ color: '#475569' }}> · {e.beneficiarioSigla}</span>}
          </div>
          <div style={carteiraDetalhe}>
            {[e.municipio && e.uf ? `${e.municipio}/${e.uf}` : e.uf, e.beneficiarioId ? null : 'sem cadastro', e.beneficiarioTexto ? `na planilha: “${e.beneficiarioTexto}”` : null].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <AppInput label="Novo beneficiário" placeholder="Procure no cadastro: nome, sigla ou cidade" value={busca} onChange={(ev) => setBusca(ev.target.value)} disabled={isLoading} data-testid="fisc-trocar-benef-busca" />
          {escolhidoFora && <Opcao b={escolhidoFora} marcado onEscolher={() => setEscolhido(escolhidoFora.id)} testId="fisc-trocar-benef-escolhido" />}
          {achados.map((b) => <Opcao key={b.id} b={b} marcado={escolhido === b.id} onEscolher={() => setEscolhido(b.id)} testId={`fisc-trocar-benef-opcao-${b.id}`} />)}
          {busca.trim().length >= 2 && achados.length === 0 && <span style={carteiraDetalhe}>Nada no cadastro com “{busca.trim()}”.</span>}
          {busca.trim().length < 2 && !escolhido && <span style={carteiraDetalhe}>Digite ao menos 2 letras. Não está no cadastro? Peça o cadastro em Emendas › Beneficiários.</span>}
        </div>

        <AppTextarea label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: a planilha da SFC trouxe a Força Nacional, mas o curso é do GAVOP" hint="Fica no histórico do item." data-testid="fisc-trocar-benef-motivo" />
        <AppInput label="Documento SEI" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 37530982" hint="Número do documento que pede ou registra a troca." data-testid="fisc-trocar-benef-sei" />
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>A troca vale só para este item. Para trocar só parte das unidades, use Entrega parcial antes.</span>
      </div>
    </Modal>
  );
};
