import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarKit } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { calcularKit, dataBR, rotuloDoItem, sugestoesDeTroca } from '../../utils/emendasKits';
import type { ItemCaep, ItemDoKit, KitEmenda } from '../../services/emendasService';

interface Props {
  kit: KitEmenda | null;
  itens: ItemCaep[];
  nomesExistentes: string[];
  hoje: string;
  onClose: () => void;
}

const aviso = (tom: 'erro' | 'info' | 'atencao'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : tom === 'atencao' ? 'var(--color-warning-bg, #fff8db)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : tom === 'atencao' ? 'var(--color-warning-text-strong, #854d0e)' : 'var(--color-info-text, #155bcb)'
});

const opcao = (i: ItemCaep) => `${i.descricao.slice(0, 70)} · ata ${i.numeroAta} item ${Number(i.numeroItem)} · alocado ${formatNumber(i.alocado)}`;

/** Monta ou altera um kit. Item novo só de ata vigente com alocação da CAEP (o banco confere de novo). */
export const KitModal: React.FC<Props> = ({ kit, itens, nomesExistentes, hoje, onClose }) => {
  const salvar = useSalvarKit();
  const toast = useToast();
  const [nome, setNome] = useState(kit?.nome ?? '');
  const [descricao, setDescricao] = useState(kit?.descricao ?? '');
  const [linhas, setLinhas] = useState<ItemDoKit[]>(kit?.itens.length ? kit.itens.map((i) => ({ ...i })) : [{ itemKey: '', quantidade: 1 }]);
  const [tentou, setTentou] = useState(false);

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const vigentes = useMemo(() => itens.filter((i) => !i.ataEncerrada).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')), [itens]);
  const originais = new Set(kit?.itens.map((i) => i.itemKey) ?? []);

  const preenchidas = linhas.filter((l) => l.itemKey);
  const calculo = calcularKit({ ativo: true, itens: preenchidas }, porChave, hoje);

  const pendencias: string[] = [];
  if (!nome.trim()) pendencias.push('nome do kit');
  else if (nomesExistentes.some((n) => n.trim().toLowerCase() === nome.trim().toLowerCase())) pendencias.push('outro nome (já existe kit com este)');
  if (preenchidas.length === 0) pendencias.push('pelo menos um item');
  if (linhas.some((l) => l.itemKey && !(Number.isInteger(l.quantidade) && l.quantidade > 0))) pendencias.push('quantidade inteira maior que zero em cada item');
  const repetidos = preenchidas.map((l) => l.itemKey).filter((k, i, a) => a.indexOf(k) !== i);
  if (repetidos.length) pendencias.push('cada item uma vez só (some as quantidades)');

  const muda = (idx: number, parcial: Partial<ItemDoKit>) => setLinhas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...parcial } : l)));

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await salvar.mutateAsync({ id: kit?.id, versao: kit?.versao, nome: nome.trim(), descricao: descricao.trim() || null, ativo: kit?.ativo ?? true, itens: preenchidas });
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
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-kit-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-kit-salvar">
            Salvar kit
          </AppButton>
        </>
      }
    >
      <form id="emendas-kit-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppInput label="Nome do kit *" placeholder="Ex.: Kit Município Seguro" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} data-testid="emendas-kit-nome" />
        <AppTextarea label="Descrição" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve o kit" />

        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          Só aparecem itens com alocação para a CAEP em ata vigente ({vigentes.length} hoje). Para incluir outro item, peça a alocação ao gestor de saldo.
        </div>

        {linhas.map((l, idx) => {
          const item = l.itemKey ? porChave.get(l.itemKey) ?? null : null;
          const componente = calculo.componentes.find((c) => c.itemKey === l.itemKey);
          const vencido = item?.ataEncerrada || (l.itemKey && !item);
          const trocas = item?.ataEncerrada ? sugestoesDeTroca(item, itens) : [];
          return (
            <div key={idx} style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.7rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-testid={`emendas-kit-linha-${idx}`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px auto', gap: '0.6rem', alignItems: 'end' }}>
                <AppSelect label={`Item ${idx + 1}`} value={l.itemKey} onChange={(e) => muda(idx, { itemKey: e.target.value })} data-testid={`emendas-kit-item-${idx}`}>
                  <option value="">Escolha o item…</option>
                  {vencido && <option value={l.itemKey}>{rotuloDoItem(item, l.itemKey)} — ata encerrada</option>}
                  {vigentes.map((i) => (
                    <option key={i.itemKey} value={i.itemKey}>
                      {opcao(i)}
                    </option>
                  ))}
                </AppSelect>
                <AppInput label="Por kit" type="number" min={1} step={1} value={String(l.quantidade || '')} onChange={(e) => muda(idx, { quantidade: Number(e.target.value) })} data-testid={`emendas-kit-qtd-${idx}`} />
                <ActionButton action="remover" iconOnly label={`Tirar o item ${idx + 1}`} type="button" disabled={linhas.length === 1} onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== idx))} />
              </div>
              {item && componente && !item.ataEncerrada && (
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  Saldo da CAEP {formatNumber(componente.saldo)} · dá para {formatNumber(componente.kits)} kits · {formatCurrency(item.valorUnitario)} cada · ata até {dataBR(item.vigenciaFinal)}
                  {componente.diasParaVencer != null && componente.diasParaVencer <= 60 ? ` (vence em ${componente.diasParaVencer} dias)` : ''}
                </span>
              )}
              {vencido && (
                <div style={aviso('atencao')}>
                  {item ? `A ata ${item.numeroAta} encerrou em ${dataBR(item.vigenciaFinal)}: troque este item.` : 'Este item não tem mais alocação da CAEP: troque-o.'}
                  {trocas.length > 0 && (
                    <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                      Mesmo material em ata vigente:
                      {trocas.map((t) => (
                        <AppButton key={t.itemKey} type="button" variant="outline" size="xs" onClick={() => muda(idx, { itemKey: t.itemKey })}>
                          Trocar por ata {t.numeroAta} item {Number(t.numeroItem)}
                        </AppButton>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div>
          <ActionButton action="adicionar" label="Mais um item" type="button" onClick={() => setLinhas((ls) => [...ls, { itemKey: '', quantidade: 1 }])} data-testid="emendas-kit-mais-item" />
        </div>

        {preenchidas.length > 0 && (
          <div style={aviso(calculo.situacao === 'indisponivel' ? 'erro' : calculo.situacao === 'vence' ? 'atencao' : 'info')} data-testid="emendas-kit-resumo">
            Com o saldo de hoje dá para oferecer <b>{formatNumber(calculo.kitsPossiveis)}</b> kits. Valor por kit: {formatCurrency(calculo.valorPorKit)}.
            {calculo.motivo ? ` ${calculo.motivo}` : ''}
          </div>
        )}
        {kit && preenchidas.some((l) => !originais.has(l.itemKey)) && (
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
