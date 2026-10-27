/**
 * Copia a tabela como HTML (o Word e o SEI colam com linhas e colunas) e o texto como reserva; o WhatsApp leva só o texto.
 * Sem a área de transferência moderna (navegador antigo ou bloqueado), copia pela seleção da página.
 */
export async function copiar(html: string | null, texto: string): Promise<void> {
  const area = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  try {
    if (html && area?.write && typeof ClipboardItem !== 'undefined') {
      await area.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]);
      return;
    }
    if (area?.writeText) {
      await area.writeText(texto);
      return;
    }
  } catch {
    // segue para a cópia pela seleção
  }
  copiarPelaSelecao(html, texto);
}

function copiarPelaSelecao(html: string | null, texto: string): void {
  const caixa = document.createElement('div');
  caixa.setAttribute('aria-hidden', 'true');
  caixa.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  if (html) caixa.innerHTML = html;
  else caixa.textContent = texto;
  document.body.appendChild(caixa);
  const selecao = window.getSelection();
  const faixa = document.createRange();
  faixa.selectNodeContents(caixa);
  selecao?.removeAllRanges();
  selecao?.addRange(faixa);
  const ok = document.execCommand('copy');
  selecao?.removeAllRanges();
  caixa.remove();
  if (!ok) throw new Error('O navegador não deixou copiar. Selecione o quadro e use Ctrl+C.');
}
