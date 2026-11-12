import { useAtasAMontar, usePodeMontarAta } from '../../../hooks/useAtasAMontar';
import { useTelaCarregada } from '../../layout/useTelaCarregada';

/**
 * Número no ícone de Atas e Contratos: fornecedores vencedores de pregão homologado ainda sem ata (Carteira › Atas › A
 * montar). Só para quem monta a ata (gestor e coordenador, D8). A leitura espera a tela aberta encher e é a mesma do
 * seletor "Registradas · A montar", que a reaproveita do cache. Sem leitura (carregando ou falhou), o menu fica sem número.
 */
export function useContagemAtasAMontar(): number | null {
  const ativo = usePodeMontarAta();
  const telaCarregada = useTelaCarregada();
  const { data, isError } = useAtasAMontar(ativo && telaCarregada);
  if (!ativo || !telaCarregada || isError || !data) return null;
  return data.length;
}
