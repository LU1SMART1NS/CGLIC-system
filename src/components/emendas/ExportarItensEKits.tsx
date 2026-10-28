import React, { useState } from 'react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useItensCaep, useKitsEmendas, usePedidosEmendas, useReservadoPorItem } from '../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { useFatiasItensGti } from '../../hooks/useGruposGti';
import { montarLinhasItensCaep, montarLinhasKitsCaep } from '../../utils/emendasItensSaldo';
import { baixarArquivo, gerarExcelDeSaldo, planilhasDeSaldo } from '../../services/emendasExcelService';

/**
 * Botão Exportar de Emendas › Itens (Por item e Por kit): um Excel com duas abas, itens com saldo e kits com saldo,
 * pelas mesmas contas da tela. Não depende do trilho nem da busca: sai sempre tudo o que tem saldo.
 */
export const ExportarItensEKits: React.FC = () => {
  const { data: itens = [], isLoading: carregandoItens } = useItensCaep();
  const { data: pedidos = [], isLoading: carregandoPedidos } = usePedidosEmendas();
  const { data: kits = [], isLoading: carregandoKits } = useKitsEmendas();
  const { data: reservado, isLoading: carregandoReservado } = useReservadoPorItem();
  const { precos, ipca } = usePrecosParaEmenda();
  const fatias = useFatiasItensGti();
  const toast = useToast();
  const [gerando, setGerando] = useState(false);
  const carregando = carregandoItens || carregandoPedidos || carregandoKits || carregandoReservado;

  const exportar = async () => {
    setGerando(true);
    try {
      const hoje = hojeEmBrasilia();
      const planilhas = planilhasDeSaldo(montarLinhasItensCaep(itens, pedidos, precos, ipca, fatias), montarLinhasKitsCaep(kits, itens, hoje, reservado, precos), hoje);
      baixarArquivo(await gerarExcelDeSaldo(planilhas, hoje), `Emendas_itens_e_kits_com_saldo_${hoje}.xlsx`);
      const [i, k] = planilhas.map((p) => p.linhas.length);
      toast.success(`Excel gerado: ${i} ${i === 1 ? 'item' : 'itens'} e ${k} ${k === 1 ? 'kit' : 'kits'} com saldo.`);
    } catch (err) {
      toast.error(`Não foi possível gerar o Excel: ${(err as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <ActionButton
      action="exportar"
      label={gerando ? 'Gerando…' : 'Exportar'}
      title="Baixar um Excel com os itens e os kits com saldo"
      onClick={() => void exportar()}
      disabled={carregando || gerando}
      data-testid="emendas-itens-exportar"
    />
  );
};
