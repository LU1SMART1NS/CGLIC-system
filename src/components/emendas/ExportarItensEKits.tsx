import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { Modal } from '../../design-system/components/Modal';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useItensCaep, useKitsEmendas, usePedidosEmendas, useReservadoPorItem } from '../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { useFatiasItensGti } from '../../hooks/useGruposGti';
import { montarLinhasItensCaep, montarLinhasKitsCaep } from '../../utils/emendasItensSaldo';
import { baixarArquivo, COLUNAS_ITENS, COLUNAS_KITS, comSaldo, gerarExcelDeSaldo, planilhasDeSaldo, type EscolhaDeColunas } from '../../services/emendasExcelService';

// A última escolha de colunas fica no navegador de quem exporta (só conveniência: sem ela, todas marcadas).
const CHAVE_ESCOLHA = 'emendas-itens-exportar-colunas-v1';
const TODAS: EscolhaDeColunas = { itens: COLUNAS_ITENS.map((c) => c.id), kits: COLUNAS_KITS.map((c) => c.id) };

function lerEscolha(): EscolhaDeColunas {
  try {
    const salva = JSON.parse(localStorage.getItem(CHAVE_ESCOLHA) ?? 'null') as Partial<EscolhaDeColunas> | null;
    if (!salva || !Array.isArray(salva.itens) || !Array.isArray(salva.kits)) return TODAS;
    return { itens: TODAS.itens.filter((id) => salva.itens!.includes(id)), kits: TODAS.kits.filter((id) => salva.kits!.includes(id)) };
  } catch {
    return TODAS;
  }
}

function guardarEscolha(e: EscolhaDeColunas) {
  try {
    localStorage.setItem(CHAVE_ESCOLHA, JSON.stringify(e));
  } catch {
    // Sem armazenamento (janela anônima): a escolha vale só agora.
  }
}

type Aba = keyof EscolhaDeColunas;

/** Lista de colunas de uma aba com Todas · Nenhuma. */
const ColunasDaAba: React.FC<{
  aba: Aba;
  titulo: string;
  quantas: number;
  colunas: ReadonlyArray<{ id: string; titulo: string }>;
  marcadas: string[];
  onChange: (ids: string[]) => void;
}> = ({ aba, titulo, quantas, colunas, marcadas, onChange }) => (
  <fieldset style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.75rem 0.9rem', margin: 0 }} data-testid={`emendas-exportar-${aba}`}>
    <legend style={{ fontWeight: 700, fontSize: '0.9rem', padding: '0 0.3rem' }}>
      {titulo} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {quantas === 1 ? '1 linha' : `${quantas} linhas`}</span>
    </legend>
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <span>
        {marcadas.length} de {colunas.length} colunas
      </span>
      <AppButton type="button" size="xs" variant="link" onClick={() => onChange(colunas.map((c) => c.id))} data-testid={`emendas-exportar-${aba}-todas`}>
        Todas
      </AppButton>
      <AppButton type="button" size="xs" variant="link" onClick={() => onChange([])} data-testid={`emendas-exportar-${aba}-nenhuma`}>
        Nenhuma
      </AppButton>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: '0.35rem 1rem' }}>
      {colunas.map((c) => (
        <label key={c.id} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={marcadas.includes(c.id)}
            onChange={(e) => onChange(e.target.checked ? colunas.map((x) => x.id).filter((id) => id === c.id || marcadas.includes(id)) : marcadas.filter((id) => id !== c.id))}
            data-testid={`emendas-exportar-${aba}-${c.id}`}
          />
          {c.titulo}
        </label>
      ))}
    </div>
    {marcadas.length === 0 && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sem colunas, esta aba não entra no arquivo.</div>}
  </fieldset>
);

/**
 * Botão Exportar de Emendas › Itens (Por item e Por kit). Abre a janela para escolher as colunas de cada aba e baixa um
 * Excel com os itens com saldo e os kits com saldo, pelas mesmas contas da tela. Não depende do trilho nem da busca:
 * sai sempre tudo o que tem saldo.
 */
export const ExportarItensEKits: React.FC = () => {
  const { data: itens = [], isLoading: carregandoItens } = useItensCaep();
  const { data: pedidos = [], isLoading: carregandoPedidos } = usePedidosEmendas();
  const { data: kits = [], isLoading: carregandoKits } = useKitsEmendas();
  const { data: reservado, isLoading: carregandoReservado } = useReservadoPorItem();
  const { precos, ipca } = usePrecosParaEmenda();
  const fatias = useFatiasItensGti();
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [escolha, setEscolha] = useState<EscolhaDeColunas>(TODAS);
  const [gerando, setGerando] = useState(false);
  const carregando = carregandoItens || carregandoPedidos || carregandoKits || carregandoReservado;
  const hoje = hojeEmBrasilia();

  const linhas = useMemo(
    () => (aberta ? { itens: montarLinhasItensCaep(itens, pedidos, precos, ipca, fatias), kits: montarLinhasKitsCaep(kits, itens, hoje, reservado, precos) } : null),
    [aberta, itens, pedidos, precos, ipca, fatias, kits, hoje, reservado]
  );
  const quantas = useMemo(() => (linhas ? comSaldo(linhas.itens, linhas.kits) : { itens: [], kits: [] }), [linhas]);
  const nenhuma = escolha.itens.length === 0 && escolha.kits.length === 0;

  const abrir = () => {
    setEscolha(lerEscolha());
    setAberta(true);
  };

  const exportar = async () => {
    if (!linhas || nenhuma) return;
    setGerando(true);
    try {
      guardarEscolha(escolha);
      const planilhas = planilhasDeSaldo(linhas.itens, linhas.kits, hoje, escolha);
      baixarArquivo(await gerarExcelDeSaldo(planilhas, hoje), `Emendas_itens_e_kits_com_saldo_${hoje}.xlsx`);
      const partes = [
        escolha.itens.length > 0 ? `${quantas.itens.length} ${quantas.itens.length === 1 ? 'item' : 'itens'}` : null,
        escolha.kits.length > 0 ? `${quantas.kits.length} ${quantas.kits.length === 1 ? 'kit' : 'kits'}` : null
      ].filter(Boolean);
      toast.success(`Excel gerado: ${partes.join(' e ')} com saldo.`);
      setAberta(false);
    } catch (err) {
      toast.error(`Não foi possível gerar o Excel: ${(err as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <>
      <ActionButton action="exportar" title="Escolher as colunas e baixar um Excel com os itens e os kits com saldo" onClick={abrir} disabled={carregando} data-testid="emendas-itens-exportar" />
      <Modal
        isOpen={aberta}
        onClose={() => setAberta(false)}
        title="Exportar itens e kits com saldo"
        subtitle="Escolha as colunas de cada aba do Excel. Saem todos os itens e kits com saldo, sem os filtros da tela."
        size="lg"
        dismissible={!gerando}
        testId="emendas-exportar-janela"
        footer={
          <>
            <ActionButton action="cancelar" type="button" onClick={() => setAberta(false)} disabled={gerando} />
            <AppButton type="button" onClick={() => void exportar()} isLoading={gerando} disabled={gerando || nenhuma} icon={gerando ? undefined : <Download size={16} />} data-testid="emendas-exportar-baixar">
              {gerando ? 'Gerando…' : 'Baixar Excel'}
            </AppButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <ColunasDaAba aba="itens" titulo="Itens com saldo" quantas={quantas.itens.length} colunas={COLUNAS_ITENS} marcadas={escolha.itens} onChange={(ids) => setEscolha((e) => ({ ...e, itens: ids }))} />
          <ColunasDaAba aba="kits" titulo="Kits com saldo" quantas={quantas.kits.length} colunas={COLUNAS_KITS} marcadas={escolha.kits} onChange={(ids) => setEscolha((e) => ({ ...e, kits: ids }))} />
          {nenhuma && <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>Marque pelo menos uma coluna para baixar.</div>}
        </div>
      </Modal>
    </>
  );
};
