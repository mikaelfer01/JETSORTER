// Relógio em Web Worker: não sofre a limitação de timers de abas em segundo plano (o dashboard continua ao vivo).
let id = null;
onmessage = (e) => {
  if (id) clearInterval(id);
  id = null;
  const ms = +e.data.ms;
  if (ms > 0) id = setInterval(() => postMessage(1), ms);
};
