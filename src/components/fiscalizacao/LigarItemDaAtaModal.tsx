import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero } from '../carteira/carteiraStyles';
import { useEntregasFiscalizacao, useItensDaAtaDoContrato, useLigarItensAoItemDaAta } from '../../hooks/useFiscalizacao';
import type { ItemDaAtaDoContrato } from '../../services/fiscalizacaoService';
import { rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { gruposALigar, sugestaoDeItem, type GrupoALigar } from '../../utils/fiscalizacaoLigacao';
import { numero, qtdTexto } from '../../utils/fiscalizacaoResumo';

const DEPOIS = '';

const quemRecebe = (g: GrupoALigar) => {
  const nomes = [...new Set(g.es.map((e) => rotuloDoBeneficiario(e).principal))];
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', ');
};

const OpcaoDoItem: React.FC<{ i: ItemDaAtaDoContrato; nome: string; marcado: boolean; sugerido: boolean; onEscolher: () => void; testId: string }> = ({ i, nome, marcado, sugerido, onEscolher, testId }) => {
  const descricao = i.descricao ?? '';
  return (
    <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.55rem 0.7rem', border: `1px solid ${marcado ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: marcado ? 'var(--primary-soft, #eef4ff)' : 'var(--bg-card)', cursor: 'pointer' }}>
      <input type="radio" name={nome} checked={marcado} onChange={onEscolher} style={{ accentColor: 'var(--primary)', marginTop: 3, width: 16, height: 16 }} data-testid={testId} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={carteiraIdentificacao}>{i.numero}</span>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>· Ata {i.ata}</span>
          {sugerido && <StatusBadge label="Sugestão" variant="info" size="sm" dot={false} />}
        </span>
        {i.nome && <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginTop: '0.1rem' }}>{i.nome}</span>}
        {/* A descrição inteira: nos veículos a diferença entre os itens costuma estar no fim do texto. */}
        {descricao && <span style={{ display: 'block', fontSize: '0.8rem', color: '#334155', marginTop: '0.15rem', lineHeight: 1.35 }}>{descricao}</span>}
      </span>
      {i.contratado != null && (
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={carteiraNumero}>{numero(i.contratado)}</span>
          <span style={{ ...carteiraDetalhe, display: 'block', marginTop: 0 }}>contratado</span>
        </span>
      )}
    </label>
  );
};

/**
 * Ligar os itens da planilha ao item da ata (migration 268). Os itens são agrupados pelo texto escrito na planilha: uma
 * escolha liga todos os itens do grupo. Sugestão só quando um único item do contrato bate com o texto; "Deixar para
 * depois" mantém o grupo na fila. Contrato sem item da ata: avisa que a ligação começa em Vinculação › Contratos à ata.
 */
export const LigarItemDaAtaModal: React.FC<{ contractKey: string; contratoNumero: string; foco?: string; onClose: () => void }> = ({ contractKey, contratoNumero, foco, onClose }) => {
  const toast = useToast();
  const { data: es = [] } = useEntregasFiscalizacao(contractKey);
  const itensQ = useItensDaAtaDoContrato(contractKey);
  const ligar = useLigarItensAoItemDaAta();
  const itens = useMemo(() => itensQ.data ?? [], [itensQ.data]);
  const grupos = useMemo(() => {
    const gs = gruposALigar(es);
    // O grupo do item que abriu a janela vem primeiro.
    return foco ? [...gs.filter((g) => g.es.some((e) => e.id === foco)), ...gs.filter((g) => !g.es.some((e) => e.id === foco))] : gs;
  }, [es, foco]);
  const sugestoes = useMemo(() => new Map(grupos.map((g) => [g.chave, sugestaoDeItem(g.texto, itens)])), [grupos, itens]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const escolha = (g: GrupoALigar) => escolhas[g.chave] ?? sugestoes.get(g.chave) ?? DEPOIS;
  const aLigar = grupos.filter((g) => escolha(g) !== DEPOIS);
  const nItens = aLigar.reduce((t, g) => t + g.es.length, 0);

  const gravar = async () => {
    try {
      for (const g of aLigar) await ligar.mutateAsync({ ids: g.es.map((e) => e.id), itemKey: escolha(g) });
      toast.success(`${qtdTexto(nItens, 'item ligado', 'itens ligados')} ao item da ata no contrato ${contratoNumero}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ligar os itens.');
    }
  };

  const semAta = !itensQ.isLoading && itens.length === 0;
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Ligar ao item da ata · contrato ${contratoNumero}`}
      subtitle="Para cada nome escrito na planilha, escolha o item da ata. A escolha vale para todos os itens com esse nome no contrato."
      testId="fisc-ligar-item"
      footer={
        semAta ? (
          <ActionButton action="fechar" onClick={onClose} />
        ) : (
          <>
            <ActionButton action="cancelar" onClick={onClose} />
            <ActionButton action="salvar" label={nItens ? `Ligar ${qtdTexto(nItens, 'item', 'itens')}` : 'Ligar'} disabled={!nItens} isLoading={ligar.isPending} onClick={() => void gravar()} data-testid="fisc-ligar-item-salvar" />
          </>
        )
      }
    >
      {semAta ? (
        <NoticeBar tone="warning" testId="fisc-ligar-item-sem-ata">
          O contrato {contratoNumero} ainda não está ligado a nenhum item de ata. A ligação começa em Vinculação › Contratos à ata; no dia seguinte, os itens da planilha com o nome igual ao do item se ligam sozinhos, e os outros voltam para cá.
        </NoticeBar>
      ) : grupos.length === 0 ? (
        <span style={carteiraDetalhe}>Todos os itens deste contrato já estão ligados ao item da ata.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {grupos.map((g, n) => {
            const sug = sugestoes.get(g.chave);
            const nome = `grupo-${n}`;
            return (
              <section key={g.chave} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid={`fisc-ligar-grupo-${n}`}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Escrito na planilha</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {numero(g.es.reduce((t, e) => t + e.quantidade, 0))}× {g.texto}
                  </div>
                  <div style={carteiraDetalhe}>{qtdTexto(g.es.length, 'item', 'itens')} · para {quemRecebe(g)}</div>
                </div>
                {itens.map((i) => (
                  <OpcaoDoItem key={i.itemKey} i={i} nome={nome} marcado={escolha(g) === i.itemKey} sugerido={sug === i.itemKey} onEscolher={() => setEscolhas((x) => ({ ...x, [g.chave]: i.itemKey }))} testId={`fisc-ligar-grupo-${n}-${i.numero}`} />
                ))}
                <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.4rem 0.7rem', fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                  <input type="radio" name={nome} checked={escolha(g) === DEPOIS} onChange={() => setEscolhas((x) => ({ ...x, [g.chave]: DEPOIS }))} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} data-testid={`fisc-ligar-grupo-${n}-depois`} />
                  Deixar para depois
                </label>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
