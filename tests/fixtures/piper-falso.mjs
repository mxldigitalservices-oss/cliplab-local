// Piper de mentira para las pruebas: mismas banderas que el real (-m, -f, -q, --length_scale, --sentence_silence, --espeak_data),
// lee el texto de stdin y escribe un WAV mono 16 kHz en silencio con 1 s por cada 15 caracteres (x length_scale).
// Comportamientos: modelo con "falla" en el nombre -> sale con codigo 3; PIPER_FALSO=colgar -> no termina; PIPER_FALSO=vacio -> no escribe nada.
import fs from 'node:fs';

const a = process.argv.slice(2);
const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const modelo = val('-m');
const salida = val('-f');
const escala = Number(val('--length_scale') ?? 1);
if (process.env.PIPER_FALSO === 'colgar') setInterval(() => {}, 1000);
else {
  let texto = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { texto += d; });
  process.stdin.on('end', () => {
    if (!modelo || !fs.existsSync(modelo)) { process.stderr.write('model not found: ' + modelo + '\n'); process.exit(1); }
    if (/falla/.test(modelo)) { process.stderr.write('onnx error simulado\n'); process.exit(3); }
    if (process.env.PIPER_FALSO === 'vacio') process.exit(0);
    const segundos = Math.max(0.5, (texto.trim().length / 15) * escala);
    const muestras = Math.round(segundos * 16000);
    const datos = Buffer.alloc(muestras * 2);
    const cab = Buffer.alloc(44);
    cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8); cab.write('fmt ', 12);
    cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(16000, 24); cab.writeUInt32LE(32000, 28);
    cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
    fs.writeFileSync(salida, Buffer.concat([cab, datos]));
    process.stdout.write(salida + '\n');
  });
}
