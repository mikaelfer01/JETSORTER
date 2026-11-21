// Otimização global: não reescreve o DOM quando o HTML é idêntico ao último escrito no mesmo elemento.
// Evita re-parse, re-layout e re-decoração (explicações) de blocos que não mudaram entre dois ciclos.
const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (d && d.set) {
  const last = new WeakMap();
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, enumerable: d.enumerable, get: d.get,
    set(v) {
      const s = String(v);
      if (s.length > 400 && last.get(this) === s && this.isConnected && this.firstChild) return;
      last.set(this, s);
      d.set.call(this, s);
    }
  });
}
