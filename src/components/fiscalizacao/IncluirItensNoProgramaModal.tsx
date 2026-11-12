import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppSelect } from '../../design-system/components/FormFields';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe, carteiraNumero } from '../carteira/carteiraStyles';
import { useDefinirProgramaDasEntregas } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, EntregaFiscalizacao, ProgramaFiscalizacao } from '../../services/fiscalizacaoService';
import { nomeDoItem, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { mudancasDoPrograma, numero, qtdTexto } from '../../utils/fiscalizacaoResumo';
import { CelulaBeneficiario, CelulaItem } from './EntregasTabela';

/**
 * Incluir itens no programa (migration 265): escolhe-se o contrato e marcam-se os itens (item × beneficiário) que são do
 * programa; desmarcar retira. Item de outro programa aparece travado. Para pôr só parte de um item no programa, divide-se
 * o item antes (Dividir, na janela do item), e cada parte é marcada à parte.
 */
export const IncluirItensNoProgramaModal: React.FC<{ programa: ProgramaFiscalizacao; contratos: ContratoFiscalizacao[]; entregas: EntregaFiscalizacao[]; onClose: () => void }> = ({ programa, contratos, entregas, onClose }) => {
  const toast = useToast();
  const definir = useDefinirProgramaDasEntregas();
  const noPrograma = useMemo(() => entregas.filter((e) => e.programaId === programa.id), [entregas, programa.id]);
  const antes = useMemo(() => new Set(noPrograma.map((e) => e.id)), [noPrograma]);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(antes));
  const opcoes = useMemo(() => {
    const comItens = new Set(entregas.map((e) => e.contractKey));
    return contratos.filter((c) => comItens.has(c.contractKey)).sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR'));
  }, [contratos, entregas]);
  const [contrato, setContrato] = useState(() => noPrograma[0]?.contractKey ?? '');
  const doContrato = useMemo(() => entregas.filter((e) => e.contractKey === contrato).sort((a, b) => nomeDoItem(a).localeCompare(nomeDoItem(b), 'pt-BR')), [entregas, contrato]);
  const { incluir, retirar } = mudancasDoPrograma(antes, marcadas);
  const deOutro = (e: EntregaFiscalizacao) => Boolean(e.programaId) && e.programaId !== programa.id;
  const alternar = (id: string) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const livres = doContrato.filter((e) => !deOutro(e));
  const todosMarcados = livres.length > 0 && livres.every((e) => marcadas.has(e.id));
  const marcarTodos = () => setMarcadas((m) => { const n = new Set(m); for (const e of livres) { if (todosMarcados) n.delete(e.id); else n.add(e.id); } return n; });
  const porContrato = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entregas) if (marcadas.has(e.id)) m.set(e.contractKey, (m.get(e.contractKey) ?? 0) + 1);
    return m;
  }, [entregas, marcadas]);

  const gravar = async () => {
    try {
      const r = await definir.mutateAsync({ programaId: programa.id, incluir, retirar });
      toast.success([r.incluidos ? `${qtdTexto(r.incluidos, 'item incluído', 'itens incluídos')}` : '', r.retirados ? `${qtdTexto(r.retirados, 'item retirado', 'itens retirados')}` : ''].filter(Boolean).join(' · ') + ` em ${programa.nome}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gravar os itens do programa.');
    }
  };

  const colunas: Column<EntregaFiscalizacao>[] = [
    {
      key: 'sel',
      header: '',
      width: '36px',
      render: (e) => (
        <input
          type="checkbox"
          checked={marcadas.has(e.id)}
          disabled={deOutro(e)}
          onChange={() => alternar(e.id)}
          aria-label={`${nomeDoItem(e)} para ${rotuloDoBeneficiario(e).principal} no programa`}
          style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
          data-testid={`fisc-incluir-itens-marcar-${e.id}`}
        />
      )
    },
    { key: 'item', header: 'Item', minWidth: '220px', priority: 'primary', render: (e) => <CelulaItem e={e} /> },
    { key: 'beneficiario', header: 'Beneficiário', minWidth: '170px', render: (e) => <CelulaBeneficiario e={e} /> },
    { key: 'qtd', header: 'Qtd.', align: 'right', render: (e) => <span style={carteiraNumero}>{numero(e.quantidade)}</span> },
    { key: 'programa', header: 'Programa', render: (e) => (deOutro(e) ? <span style={{ ...carteiraDetalhe, marginTop: 0 }}>em {e.programaTexto}</span> : marcadas.has(e.id) ? <span style={{ fontWeight: 600 }}>{programa.nome}</span> : <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>) }
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Incluir itens no ${programa.nome}`}
      subtitle="Escolha o contrato e marque os itens do programa; desmarcar retira. Para pôr só parte de um item, divida-o antes na janela do item."
      testId="fisc-incluir-itens"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} />
          <ActionButton action="salvar" disabled={!incluir.length && !retirar.length} isLoading={definir.isPending} onClick={() => void gravar()} data-testid="fisc-incluir-itens-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <AppSelect label="Contrato" value={contrato} onChange={(ev) => setContrato(ev.target.value)} data-testid="fisc-incluir-itens-contrato">
          <option value="">Escolha o contrato…</option>
          {opcoes.map((c) => (
            <option key={c.contractKey} value={c.contractKey}>
              {c.numero} · {c.fornecedor}{porContrato.get(c.contractKey) ? ` · ${qtdTexto(porContrato.get(c.contractKey) ?? 0, 'item marcado', 'itens marcados')}` : ''}
            </option>
          ))}
        </AppSelect>
        {contrato && (
          <>
            {livres.length > 1 && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} data-testid="fisc-incluir-itens-todos" />
                Marcar todos os itens deste contrato
              </label>
            )}
            <DataTable<EntregaFiscalizacao> testId="fisc-incluir-itens-tabela" className="data-table-container--flush" data={doContrato} keyExtractor={(e) => e.id} columns={colunas} emptyMessage="Este contrato não tem itens na Fiscalização." />
          </>
        )}
        <div style={carteiraDetalhe} data-testid="fisc-incluir-itens-resumo">
          {qtdTexto(marcadas.size, 'item', 'itens')} no programa em {qtdTexto(porContrato.size, 'contrato', 'contratos')}
          {incluir.length || retirar.length ? ` · a gravar: ${[incluir.length ? `${incluir.length} a incluir` : '', retirar.length ? `${retirar.length} a retirar` : ''].filter(Boolean).join(', ')}` : ''}
        </div>
      </div>
    </Modal>
  );
};
