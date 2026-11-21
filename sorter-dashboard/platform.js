// Camada de compatibilidade: quando o painel roda FORA do Chrome (aplicativo Windows ou navegador apontando para o servidor
// local), cria um "chrome.*" mínimo (armazenamento, alarmes, notificações) e usa o proxy local para falar com o sorter.
(function () {
  if (typeof chrome !== 'undefined' && chrome.storage) return; // dentro da extensão (ou teste com simulador): nada a fazer
  window.SORTER_APP = true;
  document.documentElement.classList.add('is-app');
  if (/Windows/i.test(navigator.userAgent)) document.documentElement.classList.add('is-win');
  window.SORTER_PROXY = '/__s';
  const KEY = 'sorterMonitor.storage';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* cheio */ } };
  const ev = () => { const l = []; return { addListener: (f) => l.push(f), _l: l, _fire: (...a) => l.forEach((f) => f(...a)) }; };
  const alarmsEv = ev(), notifClick = ev();
  const timers = new Map();
  const app = window.sorterApp || {};
  window.chrome = {
    runtime: {
      id: 'app', getURL: (p) => new URL(p, location.href).href, sendMessage: () => {},
      onInstalled: { addListener: () => {} }, onStartup: { addListener: (f) => setTimeout(f, 0) }
    },
    storage: {
      local: {
        get: async (keys) => {
          const s = read();
          if (keys == null) return s;
          const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
          const o = {};
          for (const k of list) if (k in s) o[k] = s[k]; else if (keys && typeof keys === 'object' && !Array.isArray(keys)) o[k] = keys[k];
          return o;
        },
        set: async (o) => { write({ ...read(), ...o }); },
        remove: async (k) => { const s = read(); (Array.isArray(k) ? k : [k]).forEach((x) => delete s[x]); write(s); }
      }
    },
    alarms: {
      create: (name, o) => { clearInterval(timers.get(name)); timers.set(name, setInterval(() => alarmsEv._fire({ name }), (o.periodInMinutes || 1) * 60000)); },
      onAlarm: alarmsEv
    },
    notifications: {
      create: async (id, o) => {
        try {
          if (Notification.permission === 'default') await Notification.requestPermission();
          if (Notification.permission !== 'granted') return id;
          const n = new Notification(o.title || 'Sorter Monitor', { body: o.message || '', tag: id, requireInteraction: !!o.requireInteraction, silent: false });
          n.onclick = () => { try { if (app.show) app.show(); window.focus(); } catch (e) { /* ok */ } notifClick._fire(id); n.close(); };
        } catch (e) { /* sem suporte */ }
        return id;
      },
      clear: () => {}, onClicked: notifClick
    },
    action: {
      onClicked: ev(),
      setBadgeText: async ({ text }) => { window.__badge = text; if (app.setBadge) app.setBadge(text); },
      setBadgeBackgroundColor: async () => {},
      setTitle: async ({ title }) => { if (app.setTooltip) app.setTooltip(title); }
    },
    tabs: { query: async () => [], create: async ({ url }) => window.open(url, '_blank'), update: async () => {}, onUpdated: { addListener: () => {}, removeListener: () => {} }, get: async () => ({}) },
    windows: { update: async () => {} },
    permissions: { request: async () => true },
    scripting: { executeScript: async () => { throw new Error('Sem aba do sorter no modo aplicativo'); } }
  };
  // em modo aplicativo as verificações em segundo plano (lotes e equipamentos) rodam dentro da própria página
  window.addEventListener('DOMContentLoaded', () => { import('./background.js').catch((e) => console.error('background', e)); });
  // integração com a janela do aplicativo: barra de título no tom do cabeçalho, menu nativo e tema
  window.addEventListener('DOMContentLoaded', () => {
    const app = window.sorterApp; if (!app) return;
    const sync = () => {
      const h = document.querySelector('header.bar'); if (!h) return;
      const dark = document.documentElement.dataset.theme === 'dark', cs = getComputedStyle(h);
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor);
      const hex = m ? '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('') : (dark ? '#141922' : '#ffffff');
      app.titlebar && app.titlebar({ color: hex, symbol: dark ? '#e8edf7' : '#1b2740', height: ((h.querySelector('.title') || h).getBoundingClientRect().height) || 54, bg: dark ? '#0f131a' : '#f3f5fa' });
    };
    setTimeout(sync, 300); setTimeout(sync, 1500);
    new MutationObserver(() => setTimeout(sync, 60)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', () => { clearTimeout(sync.t); sync.t = setTimeout(sync, 200); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#btnAppMenu'); if (!b || !app.menu) return;
      const r = b.getBoundingClientRect(); app.menu(r.left + window.screenX * 0, r.bottom + 4);
    });
    // sem arrastar/soltar de arquivos e links dentro do aplicativo (evita navegar para fora do painel)
    ['dragover', 'drop'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
  });
})();
