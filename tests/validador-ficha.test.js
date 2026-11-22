import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHA, FICHA_NEWS, NARRACION_EN, NARRACION_ES, guionBueno, parte } from './fixtures/ficha-ejemplo.mjs';
import { ErrorFicha, normalizarFicha, validarFicha, validarGuion, corpusDeFicha } from '../src/validador-ficha.js';
import { ErrorCanal } from '../src/canales.js';

const codigos = (r) => r.detalle.filter((d) => d.nivel === 'problema').map((d) => d.codigo);
const con = (cambios) => ({ ...FICHA, ...cambios });
const guionCon = (...partes) => ({ partes });

// ------------------------------------------------------------------------------------------------ ficha
test('ficha valida: se normaliza (canal y mercado en minusculas/formato canonico, hechos limpios)', () => {
  const r = validarFicha({ ...FICHA, canal: ' Stories ', mercado: 'en_us', hechos: [{ tipo: 'LUGAR', valor: ' Lisbon ' }, { tipo: 'cifra', valor: 12 }] });
  assert.equal(r.ok, true, r.problemas.join('|'));
  assert.equal(r.ficha.canal, 'stories');
  assert.equal(r.ficha.mercado, 'en-US');
  assert.deepEqual(r.ficha.hechos, [{ tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'cifra', valor: '12' }]);
});

test('ficha invalida: sin titulo, canal, mercado o hechos', () => {
  assert.equal(validarFicha(null).ok, false);
  assert.equal(validarFicha([]).ok, false);
  const r = validarFicha({ hechos: [] });
  assert.equal(r.ok, false);
  assert.ok(r.problemas.length >= 4, r.problemas.join('|'));
});

test('ficha: no se adivina el canal ni el mercado', () => {
  assert.equal(validarFicha(con({ canal: '' })).ok, false);
  assert.equal(validarFicha(con({ canal: 'cocina' })).ok, false);
  assert.equal(validarFicha(con({ mercado: '' })).ok, false);
  assert.equal(validarFicha(con({ mercado: 'fr-FR' })).ok, false);
});

test('ficha: tipos de hecho, valores vacios y limites', () => {
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'rumor', valor: 'x' }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'dato', valor: '   ' }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'dato', valor: 'x'.repeat(301) }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: Array.from({ length: 41 }, () => ({ tipo: 'dato', valor: 'x' })) })).ok, false);
  assert.equal(validarFicha(con({ partes: 13 })).ok, false);
  assert.equal(validarFicha(con({ partes: 'dos' })).ok, false);
  assert.equal(validarFicha(con({ proyecto: '../etc/passwd' })).ok, false);
});

test('ficha news: exige lugar y fecha (stories solo avisa)', () => {
  assert.equal(validarFicha(FICHA_NEWS).ok, true);
  const sinFecha = validarFicha({ ...FICHA_NEWS, hechos: FICHA_NEWS.hechos.filter((h) => h.tipo !== 'fecha') });
  assert.equal(sinFecha.ok, false);
  assert.match(sinFecha.problemas.join('|'), /fecha/);
  const sinLugar = validarFicha({ ...FICHA_NEWS, hechos: FICHA_NEWS.hechos.filter((h) => h.tipo !== 'lugar') });
  assert.equal(sinLugar.ok, false);
  assert.match(sinLugar.problemas.join('|'), /lugar/);
  const stories = validarFicha(con({ hechos: [{ tipo: 'persona', valor: 'Marco Silva' }] }));
  assert.equal(stories.ok, true);
  assert.equal(stories.avisos.length, 2);
});

test('normalizarFicha lanza ErrorFicha (400, hereda de ErrorCanal) con la lista de problemas', () => {
  assert.throws(() => normalizarFicha({}), (e) => e instanceof ErrorFicha && e instanceof ErrorCanal && e.status === 400 && e.problemas.length > 0);
  assert.equal(normalizarFicha(FICHA).canal, 'stories');
});

// ------------------------------------------------------------------------------------------------ guion bueno
test('un guion correcto pasa sin problemas', () => {
  const r = validarGuion(guionBueno(), FICHA);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.ok, true);
});

test('el guion tambien pasa en es-US cuando esta en espanol, y la ficha es la misma', () => {
  const g = guionCon(parte(1, { narracion: NARRACION_ES }), parte(2, { narracion: NARRACION_ES }));
  const r = validarGuion(g, con({ mercado: 'es-US' }));
  assert.deepEqual(r.problemas, []);
});

// ------------------------------------------------------------------------------------------------ estructura
test('estructura: salidas que no son { partes: [...] }', () => {
  for (const mala of [null, 'texto', [], {}, { partes: [] }, { partes: 'x' }]) {
    const r = validarGuion(mala, FICHA);
    assert.equal(r.ok, false, JSON.stringify(mala));
    assert.ok(codigos(r).includes('estructura'));
  }
});

test('estructura: falta narracion, escenas, textoPantalla o duracion', () => {
  const p = parte(1);
  assert.ok(codigos(validarGuion(guionCon({ ...p, narracion: '' }, parte(2)), FICHA)).includes('estructura'));
  assert.ok(codigos(validarGuion(guionCon({ ...p, tecnico: [] }, parte(2)), FICHA)).includes('estructura'));
  const sinPantalla = parte(1); delete sinPantalla.tecnico[0].textoPantalla;
  assert.ok(codigos(validarGuion(guionCon(sinPantalla, parte(2)), FICHA)).includes('estructura'));
  const sinDur = parte(1); sinDur.tecnico[0].duracionSeg = 'tres';
  assert.ok(codigos(validarGuion(guionCon(sinDur, parte(2)), FICHA)).includes('estructura'));
});

test('estructura: cantidad de partes distinta de la que pide la ficha', () => {
  const r = validarGuion(guionCon(parte(1)), FICHA);   // la ficha pide 2
  assert.ok(codigos(r).includes('estructura'));
  assert.match(r.problemas.join('|'), /2 partes/);
});

// ------------------------------------------------------------------------------------------------ Parte N
test('Parte N: debe ser consecutiva', () => {
  const r = validarGuion(guionCon(parte(1), parte(3)), FICHA);
  assert.ok(codigos(r).includes('parte'));
  assert.match(r.problemas.join('|'), /consecutiva/);
  assert.ok(codigos(validarGuion(guionCon(parte(2), parte(1)), FICHA)).includes('parte'));
  assert.ok(codigos(validarGuion(guionCon({ ...parte(1), n: '1' }, parte(2)), FICHA)).includes('parte'));
});

test('Parte N: desdeParte permite continuar una serie (3 y 4)', () => {
  assert.deepEqual(validarGuion(guionCon(parte(3), parte(4)), FICHA, { desdeParte: 3 }).problemas, []);
  assert.ok(codigos(validarGuion(guionCon(parte(1), parte(2)), FICHA, { desdeParte: 3 })).includes('parte'));
});

test('Parte N: no puede mencionar otra parte dentro de la narracion', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Stay tuned for Part 2 of the story.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('parte'));
  assert.deepEqual(validarGuion(guionCon(parte(1), parte(2, { narracion: NARRACION_EN + ' This is Part 2 of the story.' })), FICHA).problemas, []);
});

// ------------------------------------------------------------------------------------------------ hechos inventados
test('hechos: un ano o cifra que no esta en la ficha se rechaza (y los de la ficha se aceptan, con separadores)', () => {
  const mal = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN.replace('1998', '2005') }), parte(2)), FICHA);
  assert.ok(codigos(mal).includes('hecho_inventado'));
  assert.match(mal.problemas.join('|'), /2005/);
  const mal2 = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN.replace('12 goals', '15 goals') }), parte(2)), FICHA);
  assert.match(mal2.problemas.join('|'), /15/);
  const miles = { ...FICHA, hechos: [...FICHA.hechos, { tipo: 'cifra', valor: '1,200 fans' }] };
  const bien = guionCon(parte(1, { narracion: NARRACION_EN + ' About 1.200 fans came.' }), parte(2));
  assert.deepEqual(validarGuion(bien, miles).problemas, []);
});

test('hechos: un mes que no esta en la ficha se rechaza (ingles y espanol)', () => {
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It all changed in April.' }), parte(2)), FICHA);
  assert.match(en.problemas.join('|'), /april/i);
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo cambio en abril.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(es.problemas.join('|'), /abril/);
  assert.deepEqual(validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It began in March.' }), parte(2)), FICHA).problemas, []);
});

test('hechos: un nombre propio o lugar que no esta en la ficha se rechaza (no al inicio de frase)', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Later he moved to Barcelona with Ronaldo.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('hecho_inventado'));
  assert.match(r.problemas.join('|'), /Barcelona/);
  assert.match(r.problemas.join('|'), /Ronaldo/);
});

test('hechos: los nombres que si estan en la ficha pasan (con acentos distintos)', () => {
  const ficha = con({ hechos: [{ tipo: 'persona', valor: 'José Álvarez' }, { tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'fecha', valor: '1998' }] });
  const g = guionCon(parte(1, { narracion: 'In 1998 the story of Jose Alvarez began in Lisbon, and it is a story that the whole city still tells.' }), parte(2, { narracion: 'In 1998 the story of Jose Alvarez began in Lisbon, and it is a story that the whole city still tells.' }));
  assert.deepEqual(validarGuion(g, ficha).problemas, []);
});

test('hechos: tambien se revisa la descripcion de escena y el texto en pantalla', () => {
  const p = parte(1);
  p.tecnico[0].escena = 'Archive photo of the 1987 final in Madrid';
  p.tecnico[1].textoPantalla = 'Scored 99 goals';
  const r = validarGuion(guionCon(p, parte(2)), FICHA);
  const t = r.problemas.join('|');
  assert.match(t, /1987/);
  assert.match(t, /Madrid/);
  assert.match(t, /99/);
});

test('hechos: texto de pantalla en MAYUSCULAS o Title Case no genera falsos nombres propios', () => {
  const p = parte(1, { textoPantalla: 'THE TRUTH ABOUT HIS CAREER' });
  p.tecnico[1].textoPantalla = 'The Truth About His Career';
  assert.deepEqual(validarGuion(guionCon(p, parte(2)), FICHA).problemas, []);
});

test('hechos: una cifra escrita con palabras solo da aviso', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Nearly a million people watched.' }), parte(2)), FICHA);
  assert.equal(r.ok, true);
  assert.ok(r.detalle.some((d) => d.codigo === 'cifra_en_palabras'));
});

// ------------------------------------------------------------------------------------------------ dialogos y citas
test('dialogos y citas: una cita entrecomillada que no esta en la ficha se rechaza', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' "You will never play again, kid," the coach told him.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('cita'));
});

test('dialogos y citas: verbo de habla + comillas es una cita atribuida (ingles y espanol)', () => {
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' The coach said: "Run."' }), parte(2)), FICHA);
  assert.match(en.problemas.join('|'), /atribuida/);
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' El entrenador respondió: “Corre”.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(es.problemas.join('|'), /atribuida/);
});

test('dialogos y citas: lineas con raya y etiquetas de personaje se rechazan; "Narrator:" se permite', () => {
  const raya = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + '\n— Come here, kid, said nobody.' }), parte(2)), FICHA);
  assert.ok(codigos(raya).includes('dialogo'));
  const etiqueta = validarGuion(guionCon(parte(1, { narracion: 'Coach: Run faster now.\n' + NARRACION_EN }), parte(2)), FICHA);
  assert.ok(codigos(etiqueta).includes('dialogo'));
  const narrador = validarGuion(guionCon(parte(1, { narracion: 'Narrator: ' + NARRACION_EN }), parte(2)), FICHA);
  assert.ok(!codigos(narrador).includes('dialogo'));
});

test('dialogos y citas: una cita que SI viene de la ficha se acepta', () => {
  const ficha = con({ hechos: [...FICHA.hechos, { tipo: 'dato', valor: 'He wrote "I never stopped believing in the dream" in his diary' }] });
  const g = guionCon(parte(1, { narracion: NARRACION_EN + ' His diary read "I never stopped believing in the dream".' }), parte(2));
  assert.ok(!codigos(validarGuion(g, ficha)).includes('cita'));
});

// ------------------------------------------------------------------------------------------------ idioma
test('idioma: narracion en espanol para un mercado en-US se rechaza (y al reves)', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('idioma'));
  const r2 = validarGuion(guionCon(parte(1), parte(2)), con({ mercado: 'es-US' }));
  assert.ok(codigos(r2).includes('idioma'));
});

test('idioma: con poca evidencia no se rechaza', () => {
  const g = guionCon(parte(1, { narracion: 'Marco Silva. Lisbon.' }), parte(2, { narracion: 'Marco Silva. Lisbon.' }));
  assert.ok(!codigos(validarGuion(g, FICHA)).includes('idioma'));
});

// ------------------------------------------------------------------------------------------------ ritmo
test('ritmo: una escena mas larga que el ritmo del canal se rechaza (stories 4.6 s -> maximo 6.9 s)', () => {
  const r = validarGuion(guionCon(parte(1, { escenas: 5, duracion: 10 }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('ritmo'));
  assert.deepEqual(validarGuion(guionCon(parte(1, { escenas: 8, duracion: 6.9 }), parte(2)), FICHA).problemas, []);
});

test('ritmo: el mismo guion se juzga con el ritmo de SU canal (sports es mas rapido)', () => {
  const ficha = con({ canal: 'sports' });
  const r = validarGuion(guionCon(parte(1, { escenas: 8, duracion: 6 }), parte(2)), ficha);   // sports: escena max 3.6 s, parte max 45 s
  assert.ok(codigos(r).includes('ritmo'));
  const bien = validarGuion(guionCon(parte(1, { escenas: 10, duracion: 3 }), parte(2, { escenas: 10, duracion: 3 })), ficha);
  assert.deepEqual(bien.problemas, []);
});

test('ritmo: la parte entera no puede pasar del maximo del canal; si es mas corta que el minimo solo avisa', () => {
  const larga = validarGuion(guionCon(parte(1, { escenas: 14, duracion: 6 }), parte(2)), FICHA);   // 84 s > 75
  assert.ok(codigos(larga).includes('ritmo'));
  const corta = validarGuion(guionCon(parte(1, { escenas: 4, duracion: 6 }), parte(2)), FICHA);    // 24 s < 45
  assert.equal(corta.ok, true);
  assert.ok(corta.avisos.some((a) => /minimo/.test(a)));
});

test('ritmo: una narracion que no cabe en el tiempo (mas de 3.4 palabras por segundo) se rechaza', () => {
  const larga = Array.from({ length: 70 }, () => 'the Lisbon story of Marco Silva').join(' ');   // 350 palabras en 48 s
  const r = validarGuion(guionCon(parte(1, { narracion: larga }), parte(2)), FICHA);
  assert.match(r.problemas.join('|'), /no cabe/);
});

test('ritmo: se puede forzar otro ritmo por opciones', () => {
  const r = validarGuion(guionBueno(), FICHA, { ritmo: { beatSeconds: 2, segmentMaxSeconds: 100 } });
  assert.ok(codigos(r).includes('ritmo'));
});

// ------------------------------------------------------------------------------------------------ news
test('news: el guion debe decir el lugar y la fecha de la ficha', () => {
  const buena = 'On May 4, 2024 the river rose above the alert level in Porto Alegre, and the authorities asked families to move away from the valley.';
  const ok = validarGuion(guionCon(parte(1, { narracion: buena, escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.deepEqual(ok.problemas, []);
  const sinLugar = validarGuion(guionCon(parte(1, { narracion: 'On May 4, 2024 the river rose above the alert level, and the authorities asked families to move away from the valley.', escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.ok(codigos(sinLugar).includes('rigor'));
  assert.match(sinLugar.problemas.join('|'), /lugar/);
  const sinFecha = validarGuion(guionCon(parte(1, { narracion: 'The river rose above the alert level in Porto Alegre, and the authorities asked families to move away from the valley.', escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.match(sinFecha.problemas.join('|'), /fecha/);
});

test('guion con ficha invalida: devuelve el problema de la ficha, no revienta', () => {
  const r = validarGuion(guionBueno(), { titulo: 'x' });
  assert.equal(r.ok, false);
  assert.ok(codigos(r).includes('ficha'));
});

test('corpusDeFicha junta titulo, hechos y fuente', () => {
  const c = corpusDeFicha({ ...FICHA, fuente: 'Archivo municipal' });
  for (const t of ['Rise of Marco Silva', 'Lisbon, Portugal', 'March 3, 1998', '12 goals', 'Archivo municipal']) assert.ok(c.includes(t), t);
});

test('limite de problemas: nunca mas de 12 (para no inflar el prompt de correccion)', () => {
  const p = parte(1, { narracion: Array.from({ length: 30 }, (_, i) => 'in ' + (3000 + i) + ' the story').join(' ') });
  const r = validarGuion(guionCon(p, parte(2)), FICHA);
  assert.ok(r.problemas.length <= 12);
  assert.equal(r.ok, false);
});

// ------------------------------------------------------------------------------------------------ Parte 5: meses equivalentes y foto
test('meses: un mes de la ficha en ingles vale en espanol y al reves (la ficha es la misma para los dos mercados)', () => {
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo empezo en marzo.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.ok(!es.problemas.join('|').includes('marzo'), es.problemas.join('|'));
  const mal = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo cambio en abril.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(mal.problemas.join('|'), /abril/);
  const fichaEs = con({ mercado: 'es-US', hechos: [{ tipo: 'fecha', valor: '3 de marzo de 1998' }, { tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'persona', valor: 'Marco Silva' }] });
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It began in March.' }), parte(2)), { ...fichaEs, mercado: 'en-US' });
  assert.ok(!en.problemas.join('|').includes('march'), en.problemas.join('|'));
});

test('meses: "may" en minuscula es el verbo, no el mes; "May" con mayuscula si cuenta', () => {
  const verbo = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Some say he may return.' }), parte(2)), FICHA);
  assert.ok(!verbo.problemas.join('|').includes('"may"'));
  const mes = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It ended in May.' }), parte(2)), FICHA);
  assert.match(mes.problemas.join('|'), /"may"/);
});

test('news: la fecha de la ficha en ingles se acepta dicha en espanol (mes o ano)', () => {
  const ficha = { ...FICHA_NEWS, mercado: 'es-US' };
  const narracion = 'El 4 de mayo de 2024 el rio subio por encima del nivel de alerta en Porto Alegre, y las autoridades pidieron a las familias que salieran del valle.';
  const g = guionCon(parte(1, { narracion, escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'ALERTA' }));
  assert.ok(!codigos(validarGuion(g, ficha)).includes('rigor'), validarGuion(g, ficha).problemas.join('|'));
});

test('foto: nombre de imagen valido se conserva; rutas o formatos raros se rechazan', () => {
  assert.equal(validarFicha(con({ foto: ' marco.JPG ' })).ficha.foto, 'marco.JPG');
  assert.equal(validarFicha(con({})).ficha.foto, '');
  for (const f of ['../marco.jpg', 'a/b.png', 'marco.gif', 'marco', '.oculta.jpg', 'x.exe']) assert.equal(validarFicha(con({ foto: f })).ok, false, f);
});
