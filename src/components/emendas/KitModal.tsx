import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarKit } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { precoParaEmenda } from '../../utils/emendasPedidos';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { avisoIndicacaoDias, buscarItensCaep, calcularKit, dataBR, limiteDaIndicacao, passouDoCorte, rotuloItemDaAta, sugestoesDeTroca } from '../../utils/emendasKits';
import type { ItemCaep, ItemDoKit, KitEmenda } from '../../services/emendasService';

interface Props {
  kit: KitEmenda | null;
  itens: ItemCaep[];
  nomesExistentes: string[];
  hoje: string;
  /** Saldo do item para o kit (alocado − reservado nos pedidos). */
  saldoDoItem?: (i: ItemCaep) => number;
  onClose: () => void;
}

/** Resultados mostrados de uma vez na busca; acima disso a pessoa refina o texto. */
const MAX_RESULTADOS = 40;

const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };
const aviso = (tom: 'erro' | 'info' | 'atencao'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : tom === 'atencao' ? 'var(--color-warning-bg, #fff8db)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : tom === 'atencao' ? 'var(--color-warning-text-strong, #854d0e)' : 'var(--color-info-text, #155bcb)'
});

const ataItem = (i: ItemCaep) => rotuloItemDaAta(i);

/** Monta ou altera um kit. Item novo só de ata vigente com alocação da CAEP (o banco confere de novo). */
export const KitModal: React.FC<Props> = ({ kit, itens, nomesExistentes, hoje, saldoDoItem, onClose }) => {
  const salvar = useSalvarKit();
  const toast = useToast();
  const [nome, setNome] = useState(kit?.nome ?? '');
  const [descricao, setDescricao] = useState(kit?.descricao ?? '');
  const [linhas, setLinhas] = useState<ItemDoKit[]>(kit?.itens.map((i) => ({ ...i })) ?? []);
  const [busca, setBusca] = useState('');
  const [tentou, setTentou] = useState(false);

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const noKit = new Set(linhas.map((l) => l.itemKey));
  const disponiveis = useMemo(
    () => itens.filter((i) => !i.ataEncerrada).sort((a, b) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR')),
    [itens]
  );
  const encontrados = buscarItensCaep(disponiveis, busca).filter((i) => !noKit.has(i.itemKey));
  const originais = new Set(kit?.itens.map((i) => i.itemKey) ?? []);
  const { precos } = usePrecosParaEmenda();
  const precoUn = (itemKey: string) => precoParaEmenda(itemKey, porChave, precos).valor;
  const preco = (i: ItemCaep) => `${formatCurrency(precoUn(i.itemKey))} un.`;
  const calculo = calcularKit({ ativo: true, itens: linhas }, porChave, hoje, saldoDoItem, precos);

  const pendencias: string[] = [];
  if (!nome.trim()) pendencias.push('nome do kit');
  else if (nomesExistentes.some((n) => n.trim().toLowerCase() === nome.trim().toLowerCase())) pendencias.push('outro nome (já existe kit com este)');
  if (linhas.length === 0) pendencias.push('pelo menos um item');
  if (linhas.some((l) => !(Number.isInteger(l.quantidade) && l.quantidade > 0))) pendencias.push('quantidade inteira maior que zero em cada item');

  const muda = (itemKey: string, parcial: Partial<ItemDoKit>) => setLinhas((ls) => ls.map((l) => (l.itemKey === itemKey ? { ...l, ...parcial } : l)));
  const adicionar = (i: ItemCaep) => setLinhas((ls) => [...ls, { itemKey: i.itemKey, quantidade: 1 }]);

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await salvar.mutateAsync({ id: kit?.id, versao: kit?.versao, nome: nome.trim(), descricao: descricao.trim() || null, ativo: kit?.ativo ?? true, itens: linhas });
      toast.success(kit ? `${nome.trim()} atualizado.` : `${nome.trim()} criado.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="xl"
      testId="emendas-kit-modal"
      title={kit ? `Alterar ${kit.nome}` : 'Novo kit'}
      footer={
        <>
          {linhas.length > 0 && (
            <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: '0.9rem' }} data-testid="emendas-kit-valor-rodape">
              Valor do kit: <b>{formatCurrency(calculo.valorPorKit)}</b>
              <span style={pequeno}> · {linhas.length} {linhas.length === 1 ? 'item' : 'itens'} · dá para {formatNumber(calculo.kitsPossiveis)} kits</span>
            </span>
          )}
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-kit-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-kit-salvar">
            Salvar kit
          </AppButton>
        </>
      }
    >
      <form id="emendas-kit-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.8rem' }}>
          <AppInput label="Nome do kit *" placeholder="Ex.: Kit Município Seguro" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} data-testid="emendas-kit-nome" />
          <AppTextarea label="Descrição" rows={1} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve o kit" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={rotulo}>Itens do kit ({linhas.length})</span>
            {linhas.length > 0 && (
              <span style={{ fontSize: '0.9rem' }} data-testid="emendas-kit-valor">
                Valor do kit: <b>{formatCurrency(calculo.valorPorKit)}</b>
              </span>
            )}
          </div>
          {linhas.length === 0 ? (
            <div style={{ ...pequeno, padding: '0.8rem', border: '1px dashed var(--color-border, #cbd5e1)', borderRadius: 8 }}>Nenhum item ainda. Busque abaixo e adicione.</div>
          ) : (
            linhas.map((l) => {
              const item = porChave.get(l.itemKey) ?? null;
              const c = calculo.componentes.find((x) => x.itemKey === l.itemKey);
              const trocas = item?.ataEncerrada ? sugestoesDeTroca(item, itens).filter((t) => !noKit.has(t.itemKey)) : [];
              return (
                <div key={l.itemKey} style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px minmax(110px, auto) auto', gap: '0.6rem', alignItems: 'center' }} data-testid={`emendas-kit-linha-${l.itemKey}`}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item ? descricaoItemEmFrase(item.descricao) : 'Item sem alocação da CAEP'}</div>
                    <div style={pequeno}>
                      {item
                        ? [ataItem(item), `saldo ${formatNumber(c?.saldo ?? 0)}`, item.ataEncerrada ? null : `dá para ${formatNumber(c?.kits ?? 0)} kits`].filter(Boolean).join(' · ')
                        : l.itemKey}
                    </div>
                    {item && !item.ataEncerrada && passouDoCorte(c?.diasParaVencer ?? null) ? (
                      <div style={{ ...aviso('atencao'), marginTop: '0.35rem' }}>
                        A ata termina em {dataBR(item.vigenciaFinal)} ({c?.diasParaVencer} dias): passou do prazo de indicação. Troque este item.
                      </div>
                    ) : (
                      item &&
                      !item.ataEncerrada &&
                      c?.diasParaVencer != null &&
                      c.diasParaVencer <= avisoIndicacaoDias() && (
                        <div style={{ ...aviso('atencao'), marginTop: '0.35rem' }}>
                          A ata vence em {dataBR(item.vigenciaFinal)} ({c.diasParaVencer} dias): indicação só até {dataBR(limiteDaIndicacao(item.vigenciaFinal!))}.
                        </div>
                      )
                    )}
                    {(!item || item.ataEncerrada) && (
                      <div style={{ ...aviso('atencao'), marginTop: '0.35rem' }}>
                        {item ? `A ata encerrou em ${dataBR(item.vigenciaFinal)}: troque este item.` : 'Este item não tem mais alocação da CAEP: troque-o.'}
                        {trocas.length > 0 && (
                          <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                            {trocas.map((t) => (
                              <AppButton key={t.itemKey} type="button" variant="outline" size="xs" onClick={() => muda(l.itemKey, { itemKey: t.itemKey })}>
                                Trocar pelo da {ataItem(t)}
                              </AppButton>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <AppInput aria-label="Quantidade por kit" label="Por kit" inputMode="numeric" value={String(l.quantidade || '')} onChange={(e) => muda(l.itemKey, { quantidade: Number(e.target.value.replace(/\D/g, '')) })} data-testid={`emendas-kit-qtd-${l.itemKey}`} />
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }} data-testid={`emendas-kit-subtotal-${l.itemKey}`}>
                    <div style={pequeno}>
                      {l.quantidade || 0} × {formatCurrency(precoUn(l.itemKey))}
                    </div>
                    <div style={{ fontWeight: 700 }}>{formatCurrency((l.quantidade || 0) * precoUn(l.itemKey))}</div>
                  </div>
                  <ActionButton action="remover" iconOnly label="Tirar do kit" type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.itemKey !== l.itemKey))} />
                </div>
              );
            })
          )}
        </div>

        {linhas.length > 0 && (
          <div style={aviso(calculo.situacao === 'indisponivel' ? 'erro' : calculo.situacao === 'vence' ? 'atencao' : 'info')} data-testid="emendas-kit-resumo">
            Com o saldo de hoje dá para oferecer <b>{formatNumber(calculo.kitsPossiveis)}</b> kits. Valor por kit: {formatCurrency(calculo.valorPorKit)}.
            {calculo.motivo ? ` ${calculo.motivo}` : ''}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={rotulo}>Adicionar item</span>
          <AppInput
            type="search"
            aria-label="Buscar item da CAEP"
            placeholder="Buscar pela descrição, pela ata (ex.: 31/2025) ou pelo item (ex.: item 2)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (encontrados.length === 1) adicionar(encontrados[0]);
              }
            }}
            data-testid="emendas-kit-busca"
          />
          <span style={pequeno}>
            {encontrados.length === 0
              ? disponiveis.length === 0
                ? 'Nenhum item com alocação para a CAEP em ata vigente. Peça a alocação ao gestor de saldo.'
                : 'Nenhum item encontrado.'
              : `${encontrados.length} ${encontrados.length === 1 ? 'item' : 'itens'} com alocação para a CAEP em ata vigente${encontrados.length > MAX_RESULTADOS ? `; mostrando ${MAX_RESULTADOS}, refine a busca` : ''}.`}
          </span>
          {encontrados.length > 0 && (
            <div style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, maxHeight: 280, overflowY: 'auto' }} data-testid="emendas-kit-resultados">
              {encontrados.slice(0, MAX_RESULTADOS).map((i, idx) => (
                <div key={i.itemKey} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderTop: idx ? '1px solid var(--color-border, #f1f5f9)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{descricaoItemEmFrase(i.descricao)}</div>
                    <div style={pequeno}>
                      {ataItem(i)} · alocado {formatNumber(i.alocado)} · {preco(i)} · ata até {dataBR(i.vigenciaFinal)}
                    </div>
                  </div>
                  <ActionButton action="adicionar" size="sm" type="button" onClick={() => adicionar(i)} data-testid={`emendas-kit-adicionar-${i.itemKey}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {kit && (linhas.some((l) => !originais.has(l.itemKey)) || linhas.length !== originais.size) && (
          <div style={aviso('info')}>Mudar a composição cria a versão {kit.versao + 1} do kit. Os pedidos já feitos guardam a composição do dia.</div>
        )}
        {tentou && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-kit-pendencias">
            Falta: {pendencias.join(', ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
