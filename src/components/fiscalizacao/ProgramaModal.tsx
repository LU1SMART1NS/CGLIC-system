import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useDepartments } from '../../hooks/useDepartments';
import { useSalvarProgramaFiscalizacao } from '../../hooks/useFiscalizacao';
import type { ProgramaFiscalizacao } from '../../services/fiscalizacaoService';

interface Rascunho { nome: string; unidadeId: string; ativo: boolean }

/**
 * Cadastro do programa (fisc_programas, migration 265), em Ajustes › Gestão › Programas: nome, área responsável (unidade
 * interna do cadastro, não texto livre) e situação. Programa com itens não se exclui, só se inativa.
 */
export const ProgramaModal: React.FC<{ programa?: ProgramaFiscalizacao; onClose: () => void }> = ({ programa, onClose }) => {
  const toast = useToast();
  const salvar = useSalvarProgramaFiscalizacao();
  const { data: unidades = [] } = useDepartments();
  const [p, setP] = useState<Rascunho>({ nome: programa?.nome ?? '', unidadeId: programa?.unidadeId ?? '', ativo: programa?.ativo ?? true });
  const opcoes = unidades.filter((u) => u.ativo || u.id === programa?.unidadeId).sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'));
  const ok = p.nome.trim().length >= 3 && Boolean(p.unidadeId);
  const gravar = async () => {
    if (!ok) return;
    try {
      await salvar.mutateAsync({ id: programa?.id ?? null, nome: p.nome, unidadeId: p.unidadeId, ativo: p.ativo });
      toast.success(programa ? `Programa "${p.nome.trim()}" atualizado.` : `Programa "${p.nome.trim()}" criado. Inclua os itens na tela do programa (Fiscalização › Programas).`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o programa.');
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={programa ? `Editar ${programa.nome}` : 'Novo programa'}
      subtitle="Depois de criar, inclua os itens dos contratos na tela do programa (Fiscalização › Programas)."
      testId="fisc-programa-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} />
          <ActionButton action="salvar" disabled={!ok} isLoading={salvar.isPending} onClick={() => void gravar()} data-testid="fisc-programa-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <AppInput label="Nome do programa" value={p.nome} maxLength={120} onChange={(ev) => setP({ ...p, nome: ev.target.value })} placeholder="ex.: Projeto Pegasus" error={p.nome && p.nome.trim().length < 3 ? 'Pelo menos 3 letras.' : undefined} data-testid="fisc-programa-nome" />
        <AppSelect label="Área responsável" value={p.unidadeId} onChange={(ev) => setP({ ...p, unidadeId: ev.target.value })} hint="Unidade interna dona do programa: envia as informações à SFC/CGLIC e as reservas do programa na Alocação ficam na cota dela." data-testid="fisc-programa-area">
          <option value="">Escolha a unidade…</option>
          {opcoes.map((u) => (
            <option key={u.id} value={u.id}>{u.sigla}{u.nomeCompleto ? ` · ${u.nomeCompleto}` : ''}</option>
          ))}
        </AppSelect>
        {programa && (
          <AppSelect label="Situação" value={p.ativo ? 'ATIVO' : 'INATIVO'} onChange={(ev) => setP({ ...p, ativo: ev.target.value === 'ATIVO' })} hint="Inativo sai das listas da Fiscalização; os itens e o histórico ficam." data-testid="fisc-programa-situacao">
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
          </AppSelect>
        )}
      </div>
    </Modal>
  );
};
