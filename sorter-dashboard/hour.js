// Janelas por hora cheia: "hora atual" = de HH:00 até agora (o ritmo é extrapolado para 60 min).
const H = 3600000, p2 = (n) => String(n).padStart(2, '0');
export const hourStart = (now) => { const d = new Date(now); d.setMinutes(0, 0, 0); return d.getTime(); };
export const hourMin = (now) => Math.max(1, Math.ceil((now - hourStart(now)) / 60000));
export const resolveWin = (w, now) => (w === -1 ? hourMin(now) : w);
export const winText = (w, now) => (w === -1 ? `hora atual (desde ${p2(new Date(hourStart(now)).getHours())}:00, ${hourMin(now)} min)` : w > 0 ? (w === 60 ? '60 min' : `${w} min`) : 'hoje');
export const winShort = (w, now) => (w === -1 ? `${hourMin(now)}m` : w > 0 ? `${w}m` : 'hoje');
export { H as HOUR };
