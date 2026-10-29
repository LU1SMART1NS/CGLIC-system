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
import { COLUNAS_ITENS, COLUNAS_KITS, comSaldo, planilhasDeSaldo, type EscolhaDeColunas } from '../../services/emendasExcelService';
import { baixarArquivo, gerarExcel, guardarColunas, lerColunasGuardadas } from '../../services/excelSimples';
import { ColunasParaExportar } from '../exportar/ColunasParaExportar';

const CHAVE_ESCOLHA = 'emendas-itens-exportar-colunas-v1';
const TODAS: EscolhaDeColunas = { itens: COLUNAS_ITENS.map((c) => c.id), kits: COLUNAS_KITS.map((c) => c.id) };
const linhasTexto = (n: number) => (n === 1 ? '1 linha' : `${n} linhas`);
const SEM_COLUNAS = 'Sem colunas, esta aba não entra no arquivo.';

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
  const { precos } = usePrecosParaEmenda();
  const fatias = useFatiasItensGti();
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [escolha, setEscolha] = useState<EscolhaDeColunas>(TODAS);
  const [gerando, setGerando] = useState(false);
  const carregando = carregandoItens || carregandoPedidos || carregandoKits || carregandoReservado;
  const hoje = hojeEmBrasilia();

  const linhas = useMemo(
    () => (aberta ? { itens: montarLinhasItensCaep(itens, pedidos, precos, hoje, fatias), kits: montarLinhasKitsCaep(kits, itens, hoje, reservado, precos) } : null),
    [aberta, itens, pedidos, precos, fatias, kits, hoje, reservado]
  );
  const quantas = useMemo(() => (linhas ? comSaldo(linhas.itens, linhas.kits) : { itens: [], kits: [] }), [linhas]);
  const nenhuma = !COLUNAS_ITENS.some((c) => escolha.itens.includes(c.id)) && !COLUNAS_KITS.some((c) => escolha.kits.includes(c.id));

  const abrir = () => {
    setEscolha(lerColunasGuardadas(CHAVE_ESCOLHA, TODAS));
    setAberta(true);
  };

  const exportar = async () => {
    if (!linhas || nenhuma) return;
    setGerando(true);
    try {
      guardarColunas(CHAVE_ESCOLHA, { ...escolha });
      const planilhas = planilhasDeSaldo(linhas.itens, linhas.kits, hoje, escolha);
      baixarArquivo(await gerarExcel(planilhas), `Emendas_itens_e_kits_com_saldo_${hoje}.xlsx`);
      const partes = [
        COLUNAS_ITENS.some((c) => escolha.itens.includes(c.id)) ? `${quantas.itens.length} ${quantas.itens.length === 1 ? 'item' : 'itens'}` : null,
        COLUNAS_KITS.some((c) => escolha.kits.includes(c.id)) ? `${quantas.kits.length} ${quantas.kits.length === 1 ? 'kit' : 'kits'}` : null
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
          <ColunasParaExportar
            testId="emendas-exportar-itens"
            titulo="Itens com saldo"
            detalhe={linhasTexto(quantas.itens.length)}
            colunas={COLUNAS_ITENS}
            marcadas={escolha.itens}
            onChange={(ids) => setEscolha((e) => ({ ...e, itens: ids }))}
            semColunas={SEM_COLUNAS}
          />
          <ColunasParaExportar
            testId="emendas-exportar-kits"
            titulo="Kits com saldo"
            detalhe={linhasTexto(quantas.kits.length)}
            colunas={COLUNAS_KITS}
            marcadas={escolha.kits}
            onChange={(ids) => setEscolha((e) => ({ ...e, kits: ids }))}
            semColunas={SEM_COLUNAS}
          />
          {nenhuma && <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>Marque pelo menos uma coluna para baixar.</div>}
        </div>
      </Modal>
    </>
  );
};
