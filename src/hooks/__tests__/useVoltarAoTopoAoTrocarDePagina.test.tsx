import { describe, it, expect, vi, beforeEach } from 'vitest';

let local = { pathname: '/contratos/1' };
let tipo: 'PUSH' | 'POP' | 'REPLACE' = 'PUSH';
vi.mock('react-router-dom', () => ({ useLocation: () => local, useNavigationType: () => tipo }));

const efeitos: Array<() => void> = [];
const refs: Array<{ current: unknown }> = [];
let indiceRef = 0;
vi.mock('react', () => ({
  useEffect: (fn: () => void) => efeitos.push(fn),
  useRef: (inicial: unknown) => {
    if (!refs[indiceRef]) refs[indiceRef] = { current: inicial };
    return refs[indiceRef++];
  }
}));

import { useVoltarAoTopoAoTrocarDePagina } from '../useVoltarAoTopoAoTrocarDePagina';

function renderizar() {
  indiceRef = 0;
  efeitos.length = 0;
  useVoltarAoTopoAoTrocarDePagina();
  efeitos.forEach((fn) => fn());
}

describe('useVoltarAoTopoAoTrocarDePagina', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    refs.length = 0;
    scrollTo.mockReset();
    vi.stubGlobal('window', { scrollTo });
    local = { pathname: '/contratos/1' };
    tipo = 'PUSH';
  });

  it('não rola na primeira abertura nem quando o endereço não muda (troca de aba)', () => {
    renderizar();
    renderizar();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('abrir outra página volta ao topo', () => {
    renderizar();
    local = { pathname: '/atas/detalhe/x/itens/4' };
    renderizar();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('voltar pelo navegador mantém a rolagem', () => {
    renderizar();
    local = { pathname: '/contratos' };
    tipo = 'POP';
    renderizar();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
