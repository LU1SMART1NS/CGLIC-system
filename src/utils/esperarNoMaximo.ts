/** Tempo máximo que a tela espera as regras e os feriados antes de abrir com os padrões do código. */
export const ESPERA_MAXIMA_REGRAS_MS = 8_000;

/** Resolve quando a promessa termina ou quando o prazo acaba, o que vier primeiro (nunca rejeita). */
export function esperarNoMaximo(promessa: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const prazo = setTimeout(resolve, ms);
    promessa.then(
      () => { clearTimeout(prazo); resolve(); },
      () => { clearTimeout(prazo); resolve(); }
    );
  });
}
