import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarDadosItem } from '../../hooks/useEmendasQuadro';
import { nomeDoItem } from '../../utils/emendasQuadro';
import { rotuloItemDaAta } from '../../utils/emendasKits';
import { descricaoItemEmFrase } from '../../utils/textCase';
import type { ItemCaep } from '../../services/emendasService';
import type { GndItem } from '../../services/emendasQuadroService';

interface Props {
  item: ItemCaep;
  onClose: () => void;
}

/** Nome curto e GND do item, como saem no quadro da reserva (migration 165). */
export const DadosItemModal: React.FC<Props> = ({ item, onClose }) => {
  const salvar = useSalvarDadosItem();
  const toast = useToast();
  const [nomeCurto, setNomeCurto] = useState(item.nomeCurto ?? '');
  const [gnd, setGnd] = useState<GndItem | ''>(item.gnd ?? '');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await salvar.mutateAsync({ itemKey: item.itemKey, nomeCurto: nomeCurto.trim() || null, gnd: gnd || null, versao: item.dadosVersao ?? null });
      toast.success('Dados do item salvos.');
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
      size="md"
      testId="emendas-dados-item-modal"
      title="Item no quadro da reserva"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-dados-item-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-dados-item-salvar">
            Salvar dados do item
          </AppButton>
        </>
      }
    >
      <form id="emendas-dados-item-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{rotuloItemDaAta(item)}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #334155)' }}>{descricaoItemEmFrase(item.descricao)}</span>
        </div>
        <AppInput
          label="Nome curto"
          hint={`Como sai na DESCRIÇÃO ITEM do Anexo. Sem nome curto sai “${nomeDoItem({ ...item, nomeCurto: null }, item.itemKey)}”.`}
          value={nomeCurto}
          maxLength={80}
          onChange={(e) => setNomeCurto(e.target.value)}
          data-testid="emendas-dados-item-nome"
        />
        <AppSelect label="GND" hint="No SIOP cada emenda tem um só GND: o quadro separa os totais." value={gnd} onChange={(e) => setGnd(e.target.value as GndItem | '')} data-testid="emendas-dados-item-gnd">
          <option value="">Não informado</option>
          <option value="GND-4">GND-4 · Investimento</option>
          <option value="GND-3">GND-3 · Custeio</option>
        </AppSelect>
      </form>
    </Modal>
  );
};
