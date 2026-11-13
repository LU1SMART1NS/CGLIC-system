import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { AppInput } from '../../design-system/components/FormFields';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { BeneficiarioModal } from '../emendas/BeneficiarioModal';
import { useEntregasFiscalizacao, useLigarItensAoBeneficiario } from '../../hooks/useFiscalizacao';
import { useBeneficiariosEmendas } from '../../hooks/useEmendas';
import type { BeneficiarioEmenda } from '../../services/emendasService';
import { localDoBeneficiario } from '../../services/emendasService';
import { casaBusca, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { escolhaInicial, gruposSemCadastro, nomeParaCadastro, sugestoesDoCadastro, type GrupoSemCadastro } from '../../utils/fiscalizacaoBeneficiarioLigacao';
import { qtdTexto } from '../../utils/fiscalizacaoResumo';

const MAX_BUSCA = 6;

const OpcaoDoCadastro: React.FC<{ b: BeneficiarioEmenda; marcado: boolean; selo?: 'igual' | 'parecido'; onEscolher: () => void; testId: string }> = ({ b, marcado, selo, onEscolher, testId }) => (
  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.55rem 0.7rem', border: `1px solid ${marcado ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: marcado ? 'var(--primary-soft, #eef4ff)' : 'var(--bg-card)', cursor: 'pointer' }}>
    <input type="radio" name="fisc-ligar-benef" checked={marcado} onChange={onEscolher} style={{ accentColor: 'var(--primary)', marginTop: 3, width: 16, height: 16 }} data-testid={testId} />
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.nome}</span>
        {b.sigla && <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>· {b.sigla}</span>}
        {selo === 'igual' && <StatusBadge label="Mesmo nome" variant="success" size="sm" dot={false} />}
        {selo === 'parecido' && <StatusBadge label="Parecido" variant="neutral" size="sm" dot={false} />}
      </span>
      <span style={{ ...carteiraDetalhe, display: 'block', marginTop: '0.1rem' }}>
        {[localDoBeneficiario(b), b.razaoSocial && b.razaoSocial !== b.nome ? b.razaoSocial : null].filter(Boolean).join(' · ') || 'sem cidade no cadastro'}
      </span>
    </span>
  </label>
);

/**
 * Ligar o beneficiário escrito na planilha a um cadastro (migration 272). Um nome por vez (o mesmo nome e a mesma UF
 * em todos os contratos); "Pular" passa para o próximo. O nome escrito vira outra grafia do cadastro.
 * `contractKey`: só os nomes com itens neste contrato. `foco`: só o nome deste item (janela do item, Beneficiário 360).
 * `onLigado`: depois de ligar, com o cadastro escolhido.
 */
export const LigarBeneficiarioModal: React.FC<{ contractKey?: string; foco?: string; onClose: () => void; onLigado?: (beneficiarioId: string) => void }> = ({ contractKey, foco, onClose, onLigado }) => {
  const toast = useToast();
  const { data: todas = [], isLoading } = useEntregasFiscalizacao(null);
  const { data: cadastro = [] } = useBeneficiariosEmendas();
  const ligar = useLigarItensAoBeneficiario();
  const [pulados, setPulados] = useState<string[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);

  const grupos = useMemo(() => {
    const gs = gruposSemCadastro(todas).filter((g) => !contractKey || g.es.some((e) => e.contractKey === contractKey));
    return foco ? gs.filter((g) => g.es.some((e) => e.id === foco)) : gs;
  }, [todas, contractKey, foco]);
  const restantes = grupos.filter((g) => !pulados.includes(g.chave));
  const g: GrupoSemCadastro | undefined = restantes[0];
  const sugestoes = g ? sugestoesDoCadastro(g.texto, g.uf, cadastro) : [];
  const escolhido = g ? escolhas[g.chave] ?? escolhaInicial(sugestoes) : null;
  const mostrados = new Set(sugestoes.map((s) => s.b.id));
  const naBusca =
    !g || busca.trim().length < 2
      ? []
      : cadastro
          .filter((b) => b.ativo && !mostrados.has(b.id) && casaBusca(textoDeBuscaDoBeneficiario(b), busca))
          .sort((a, b) => Number(b.entregaUf === g.uf) - Number(a.entregaUf === g.uf))
          .slice(0, MAX_BUSCA);
  // Escolhido pela busca ou pelo cadastro novo: continua visível mesmo depois de limpar a busca.
  const escolhidoFora = escolhido && !sugestoes.some((s) => s.b.id === escolhido) && !naBusca.some((b) => b.id === escolhido) ? cadastro.find((b) => b.id === escolhido) : undefined;

  const escolher = (id: string) => g && setEscolhas((x) => ({ ...x, [g.chave]: id }));
  const proximo = () => { setBusca(''); };
  const pular = () => { if (g) setPulados((p) => [...p, g.chave]); proximo(); };
  const gravar = async () => {
    if (!g || !escolhido) return;
    const b = cadastro.find((x) => x.id === escolhido);
    try {
      await ligar.mutateAsync({ ids: g.es.map((e) => e.id), beneficiarioId: escolhido });
      toast.success(`${qtdTexto(g.es.length, 'item ligado', 'itens ligados')} a ${b?.nome ?? 'o cadastro'}.`);
      proximo();
      if (onLigado) onLigado(escolhido);
      else if (restantes.length <= 1) onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ligar ao cadastro.');
    }
  };

  if (cadastrando && g) {
    return (
      <BeneficiarioModal
        beneficiario={null}
        lista={cadastro}
        inicial={{ nome: nomeParaCadastro(g.texto), entregaUf: g.uf ?? '' }}
        onAbrir={(b) => { escolher(b.id); setCadastrando(false); }}
        onSalvo={(id) => { escolher(id); setCadastrando(false); }}
        onClose={() => setCadastrando(false)}
      />
    );
  }

  const contratos = g ? [...new Set(g.es.map((e) => e.contratoNumero))] : [];
  const nesteContrato = g && contractKey ? g.es.filter((e) => e.contractKey === contractKey).length : 0;
  const total = grupos.length;
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Ligar ao cadastro de beneficiários"
      subtitle={total > 1 ? `${qtdTexto(restantes.length, 'nome sem cadastro a ligar', 'nomes sem cadastro a ligar')}${contractKey ? ' neste contrato' : ''}${pulados.length ? ` · ${qtdTexto(pulados.length, 'pulado', 'pulados')}` : ''}` : 'Escolha o beneficiário do cadastro que recebe estes itens.'}
      testId="fisc-ligar-benef"
      footer={
        !g ? (
          <ActionButton action="fechar" onClick={onClose} />
        ) : (
          <>
            <ActionButton action="cancelar" onClick={onClose} />
            {restantes.length > 1 && <AppButton variant="secondary" onClick={pular} data-testid="fisc-ligar-benef-pular">Pular este nome</AppButton>}
            <ActionButton action="salvar" label={`Ligar ${qtdTexto(g.es.length, 'item', 'itens')}`} disabled={!escolhido} isLoading={ligar.isPending} onClick={() => void gravar()} data-testid="fisc-ligar-benef-salvar" />
          </>
        )
      }
    >
      {isLoading ? (
        <span style={carteiraDetalhe}>Carregando…</span>
      ) : !g ? (
        <span style={carteiraDetalhe} data-testid="fisc-ligar-benef-fim">{total ? 'Os nomes que sobraram foram pulados: continuam na lista para depois.' : 'Todos os beneficiários já estão ligados ao cadastro.'}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ padding: '0.65rem 0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-subtle, #f8fafc)' }} data-testid="fisc-ligar-benef-escrito">
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nome no item</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{g.texto}{g.uf && <span style={{ color: '#64748b', fontWeight: 600 }}> · {g.uf}</span>}</div>
            <div style={carteiraDetalhe}>
              {qtdTexto(g.es.length, 'item', 'itens')} em {qtdTexto(contratos.length, 'contrato', 'contratos')}
              {contractKey && nesteContrato < g.es.length ? ` (${nesteContrato} neste contrato; a escolha vale para todos)` : ''} · {contratos.slice(0, 4).join(', ')}{contratos.length > 4 ? ` e mais ${contratos.length - 4}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sugestoes.length ? `Do cadastro${g.uf ? `, em ${g.uf}` : ''}` : 'Nenhum nome parecido no cadastro'}</div>
            {sugestoes.map((s) => <OpcaoDoCadastro key={s.b.id} b={s.b} selo={s.igual ? 'igual' : 'parecido'} marcado={escolhido === s.b.id} onEscolher={() => escolher(s.b.id)} testId={`fisc-ligar-benef-sug-${s.b.id}`} />)}
            {escolhidoFora && <OpcaoDoCadastro b={escolhidoFora} marcado onEscolher={() => escolher(escolhidoFora.id)} testId="fisc-ligar-benef-escolhido" />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <AppInput label="Procurar outro no cadastro" placeholder="Nome, sigla ou cidade" value={busca} onChange={(ev) => setBusca(ev.target.value)} data-testid="fisc-ligar-benef-busca" />
            {naBusca.map((b) => <OpcaoDoCadastro key={b.id} b={b} marcado={escolhido === b.id} onEscolher={() => escolher(b.id)} testId={`fisc-ligar-benef-busca-${b.id}`} />)}
            {busca.trim().length >= 2 && naBusca.length === 0 && <span style={carteiraDetalhe}>Nada no cadastro com “{busca.trim()}”.</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={carteiraDetalhe}>Não está no cadastro?</span>
            <AppButton size="xs" variant="link" onClick={() => setCadastrando(true)} data-testid="fisc-ligar-benef-novo">Cadastrar novo beneficiário</AppButton>
          </div>
          <span style={carteiraDetalhe}>
            Ao ligar, “{g.texto}” passa a ser outra grafia do beneficiário escolhido: o mesmo nome em outro item já chega ligado.
          </span>
        </div>
      )}
    </Modal>
  );
};
