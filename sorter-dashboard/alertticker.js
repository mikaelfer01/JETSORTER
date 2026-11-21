// Faixa de alertas rolando no topo (estilo letreiro de jornal): todos os alertas ativos, mesmo tamanho, em loop contínuo.
// Lê os 4 avisos que o painel já preenche (#devAlert, #bindAlert, #partialBar, #alert) e os espelha na faixa; não muda a lógica dos alertas.
const SRC = ['devAlert', 'bindAlert', 'alert']; // só alertas em tempo real (o aviso de carga do histórico não é alerta)
let last = '';
function build() {
  const stack = document.getElementById('alertStack'); if (!stack) return;
  let tk = document.getElementById('alertTicker');
  if (!tk) { tk = document.createElement('div'); tk.id = 'alertTicker'; tk.className = 'tk hidden'; tk.innerHTML = '<div class="tkin"><div class="tkrow"></div></div>'; stack.parentNode.insertBefore(tk, stack); }
  const items = SRC.map((id) => document.getElementById(id)).filter((e) => e && !e.classList.contains('hidden') && e.textContent.trim())
    .map((e) => ({ k: e.classList.contains('crit') ? 'crit' : e.classList.contains('warn') ? 'warn' : 'info', t: e.textContent.replace(/\s+/g, ' ').trim() }));
  const sig = items.map((i) => i.k + i.t).join('|');
  if (sig === last) return; last = sig;
  if (!items.length) { tk.classList.add('hidden'); return; }
  tk.classList.remove('hidden');
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const chips = items.map((i) => `<span class="tki ${i.k}"><i></i>${esc(i.t)}</span>`).join('');
  const row = tk.querySelector('.tkrow');
  row.style.animation = 'none';
  row.innerHTML = `<div class="tkset">${chips}</div>`;
  const w = Math.max(1, row.firstElementChild.getBoundingClientRect().width);
  const box = tk.getBoundingClientRect().width || innerWidth;
  const n = Math.max(1, Math.ceil((box + 40) / w));            // repete os alertas até preencher a faixa: ela sempre roda
  const set = `<div class="tkset">${chips.repeat(n)}</div>`;
  row.innerHTML = set + set.replace('class="tkset"', 'class="tkset" aria-hidden="true"');
  row.style.setProperty('--tkd', Math.max(16, Math.round((w * n) / 70)) + 's');
  void row.offsetWidth; row.style.animation = '';
}
export function initTicker() {
  const stack = document.getElementById('alertStack'); if (!stack) return;
  new MutationObserver(build).observe(stack, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => { last = ''; build(); });
  build();
}
