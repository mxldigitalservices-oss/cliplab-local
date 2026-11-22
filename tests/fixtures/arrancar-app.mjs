// Arranca la app como lo hace el servidor (sin escuchar el puerto real), pide /health y termina.
// Lo lanzan tests/modo-local.test.js y tests/modo-completo.test.js en un proceso aparte con su propio CLIPLAB_MODE.
const { createApp } = await import('../../src/app.js');

const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const r = await fetch('http://127.0.0.1:' + servidor.address().port + '/health');
console.log(JSON.stringify({ status: r.status }));
servidor.close();
