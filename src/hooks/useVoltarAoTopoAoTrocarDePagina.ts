import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Ao abrir uma página nova, a tela começa no topo. Sem isso, a página nova abria na mesma altura da anterior (o
 * olho de um item, por exemplo, abria o item da ata já rolado para baixo e parecia que nada tinha acontecido).
 * - Só quando o endereço muda: trocar de aba (?aba=) ou de filtro mantém a rolagem.
 * - Voltar e avançar do navegador (POP) mantêm a rolagem, para o usuário voltar aonde estava.
 */
export function useVoltarAoTopoAoTrocarDePagina(): void {
  const { pathname } = useLocation();
  const tipo = useNavigationType();
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    if (tipo === 'POP') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, tipo]);
}
