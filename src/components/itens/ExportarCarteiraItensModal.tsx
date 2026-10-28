import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { Modal } from '../../design-system/components/Modal';
import { useToast } from '../../design-system/components/Toast';
import { ColunasParaExportar } from '../exportar/ColunasParaExportar';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import { baixarArquivo, gerarExcel, guardarColunas, lerColunasGuardadas } from '../../services/excelSimples';
import {
  COLUNAS_CARTEIRA_ITENS,
  COLUNAS_PADRAO_CARTEIRA_ITENS,
  GRUPOS_CARTEIRA_ITENS,
  planilhaCarteiraItens,
  type ContextoCarteiraItens
} from '../../services/carteiraItensExcelService';

const CHAVE_ESCOLHA = 'carteira-itens-exportar-colunas-v1';
const PADRAO = { colunas: COLUNAS_PADRAO_CARTEIRA_ITENS };
type Recorte = 'tela' | 'todos';

const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const itensTexto = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'item' : 'itens'}`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Linhas da tela, com os filtros e na ordem da lista. */
  naTela: readonly CarteiraItemRow[];
  /** Todos os itens da carteira (o recorte do perfil), sem os filtros. */
  todos: readonly CarteiraItemRow[];
  ctx: ContextoCarteiraItens;
}

/**
 * Exportar da Carteira › Itens: escolhe os itens (os da tela ou todos) e as colunas, em grupos, e baixa um Excel com as
 * mesmas contas da tela (saldo, alocação e empenho lidos do banco). A última escolha de colunas fica no navegador.
 */
export const ExportarCarteiraItensModal: React.FC<Props> = ({ isOpen, onClose, naTela, todos, ctx }) => {
  const toast = useToast();
  // A janela só existe aberta (a tela a monta no clique): a última escolha é lida aqui.
  const [colunas, setColunas] = useState<string[]>(() => lerColunasGuardadas(CHAVE_ESCOLHA, PADRAO).colunas);
  const [recorte, setRecorte] = useState<Recorte>('tela');
  const [gerando, setGerando] = useState(false);
  const filtrada = naTela.length !== todos.length;

  const marcadas = COLUNAS_CARTEIRA_ITENS.filter((c) => colunas.includes(c.id)).length;
  const linhas = recorte === 'tela' ? naTela : todos;

  const exportar = async () => {
    if (marcadas === 0) return;
    setGerando(true);
    try {
      guardarColunas(CHAVE_ESCOLHA, { colunas });
      const hoje = hojeIso();
      const planilha = planilhaCarteiraItens(linhas, colunas, ctx, hoje, recorte === 'tela' && filtrada ? 'itens filtrados' : 'todos os itens');
      if (!planilha) return;
      baixarArquivo(await gerarExcel([planilha]), `Carteira_de_itens_${hoje}.xlsx`);
      toast.success(`Excel gerado: ${itensTexto(linhas.length)}, ${marcadas} ${marcadas === 1 ? 'coluna' : 'colunas'}.`);
      onClose();
    } catch (err) {
      toast.error(`Não foi possível gerar o Excel: ${(err as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  const opcao = (valor: Recorte, titulo: string, detalhe: string) => (
    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.88rem', cursor: 'pointer' }}>
      <input type="radio" name="exportar-recorte" checked={recorte === valor} onChange={() => setRecorte(valor)} style={{ marginTop: '0.2rem' }} data-testid={`itens-exportar-recorte-${valor}`} />
      <span>
        <b>{titulo}</b> <span style={{ color: 'var(--text-muted)' }}>· {detalhe}</span>
      </span>
    </label>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar itens para o Excel"
      subtitle="Escolha os itens e as colunas. Os números são os mesmos da tela."
      size="lg"
      dismissible={!gerando}
      testId="itens-exportar-janela"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={gerando} />
          <AppButton type="button" onClick={() => void exportar()} isLoading={gerando} disabled={gerando || marcadas === 0 || linhas.length === 0} icon={gerando ? undefined : <Download size={16} />} data-testid="itens-exportar-baixar">
            {gerando ? 'Gerando…' : 'Baixar Excel'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <fieldset style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.75rem 0.9rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <legend style={{ fontWeight: 700, fontSize: '0.9rem', padding: '0 0.3rem' }}>Itens</legend>
          {opcao('tela', filtrada ? 'Os itens da tela' : 'Todos os itens', filtrada ? `${itensTexto(naTela.length)}, com os filtros escolhidos` : itensTexto(naTela.length))}
          {filtrada && opcao('todos', 'Todos os itens da carteira', `${itensTexto(todos.length)}, sem os filtros`)}
        </fieldset>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <b>
            {marcadas} de {COLUNAS_CARTEIRA_ITENS.length} colunas
          </b>
          <AppButton type="button" size="xs" variant="link" onClick={() => setColunas(COLUNAS_PADRAO_CARTEIRA_ITENS)} data-testid="itens-exportar-padrao">
            Voltar ao padrão
          </AppButton>
        </div>

        {GRUPOS_CARTEIRA_ITENS.map((g) => (
          <ColunasParaExportar
            key={g.id}
            testId={`itens-exportar-${g.id}`}
            titulo={g.titulo}
            colunas={g.colunas}
            marcadas={colunas}
            onChange={(ids) => setColunas((atual) => [...atual.filter((id) => !g.colunas.some((c) => c.id === id)), ...ids])}
          />
        ))}
        {marcadas === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>Marque pelo menos uma coluna para baixar.</div>}
      </div>
    </Modal>
  );
};
