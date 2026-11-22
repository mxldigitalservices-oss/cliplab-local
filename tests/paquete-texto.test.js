import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-paquete-texto-'));
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.LOG_LEVEL = 'error';

const { generarPaquete, generarPaquetes, detectarIdioma, acortar, LIMITES, ErrorPaquete } = await import('../src/paquete-texto.js');
const { construirContextoClip } = await import('../src/engine/marketing.js');
const { CANALES, DESTINOS, IDS_CANALES, IDS_DESTINOS, ErrorCanal } = await import('../src/canales.js');
const { IDS_MERCADOS, MERCADOS, ErrorMercado } = await import('../src/mercados.js');

const CLIP_EN = {
  id: 'clip_en',
  titulo: 'The rise of a small-town boxer',
  transcripcion: 'He was born in a small town. Nobody believed he could win. He trained every morning before school. Then he won the regional title.',
  duracion: 48,
  marketing: { titulo: 'He was told he would never win' },
};
const CLIP_ES = {
  id: 'clip_es',
  titulo: 'El ascenso de un boxeador de pueblo',
  transcripcion: 'Nació en un pueblo pequeño. Nadie creía que podía ganar. Entrenaba todas las mañanas antes de la escuela. Luego ganó el título regional.',
  duracion: 48,
};

const CTAS_EN = /(?:Tell us|Follow|Share|Who is right|Agree or disagree|Tag a friend|What is your take|More on the channel)/;
const CTAS_ES = /(?:Cuéntanos|Sígueme|Compártelo|¿Quién tiene la razón|¿Estás de acuerdo|Etiqueta a un amigo|¿Qué opinas|Hay más en el canal)/;

test('matriz completa canal x mercado x destino: limites, hashtags validos e idioma de la plantilla', () => {
  for (const canal of IDS_CANALES) {
    for (const mercado of IDS_MERCADOS) {
      for (const destino of IDS_DESTINOS) {
        const clip = mercado === 'en-US' ? CLIP_EN : CLIP_ES;
        const p = generarPaquete({ clip, canal, mercado, destino });
        const quien = canal + '/' + mercado + '/' + destino;
        const lim = LIMITES[destino];
        assert.equal(p.destino, destino, quien);
        assert.equal(p.mercado, mercado, quien);
        assert.equal(p.canal, canal, quien);
        assert.ok(p.titulo && p.titulo.length <= lim.titulo, quien + ': titulo');
        assert.ok(p.texto.length <= lim.descripcion, quien + ': texto demasiado largo');
        assert.ok(p.hashtags.length >= 1 && p.hashtags.length <= lim.hashtags, quien + ': cantidad de hashtags');
        assert.ok(p.hashtags.every((h) => /^#[a-z0-9]+$/.test(h)), quien + ': ' + p.hashtags.join(' '));
        assert.equal(new Set(p.hashtags).size, p.hashtags.length, quien + ': hashtags repetidos');
        assert.match(p.cta, mercado === 'en-US' ? CTAS_EN : CTAS_ES, quien + ': CTA fuera del idioma del mercado');
        assert.ok(p.texto.includes(p.cta) && p.texto.includes(p.hashtags.join(' ')), quien + ': el texto lleva CTA y hashtags');
        assert.deepEqual(p.avisos, [], quien + ': avisos inesperados');
      }
    }
  }
});

test('reutiliza construirContextoClip: el gancho y los puntos del paquete salen de ese contexto', () => {
  const ctx = construirContextoClip(CLIP_EN);
  const largo = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(largo.descripcion.startsWith(ctx.gancho), 'la descripcion arranca con el gancho del contexto');
  const reels = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' });
  for (const linea of reels.descripcion.split('\n').filter((l) => l.startsWith('- '))) {
    assert.ok(ctx.puntosClave.includes(linea.slice(2)), 'punto que no viene del contexto: ' + linea);
  }
  // Un gancho explicito del clip se respeta (lo lee construirContextoClip).
  const conGancho = generarPaquete({ clip: { ...CLIP_EN, gancho: 'A very different hook line here' }, canal: 'stories', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(conGancho.descripcion.startsWith('A very different hook line here'));
});

test('no inventa hechos: ningun numero ni oracion que no este en el clip', () => {
  const clip = { ...CLIP_EN, transcripcion: 'The match ended 3-1 in 2019. Nobody expected that result. The crowd went silent for a while.' };
  const fuente = [clip.titulo, clip.transcripcion, clip.marketing.titulo].join(' ');
  const numerosFuente = new Set(fuente.match(/\d+/g));
  for (const canal of IDS_CANALES) {
    for (const destino of IDS_DESTINOS) {
      const p = generarPaquete({ clip, canal, mercado: 'en-US', destino });
      for (const n of p.texto.match(/\d+/g) || []) assert.ok(numerosFuente.has(n), canal + '/' + destino + ': numero inventado ' + n);
      for (const linea of p.descripcion.split('\n').filter((l) => l.startsWith('- '))) {
        assert.ok(fuente.includes(linea.slice(2).replace(/…$/, '')), 'oracion que no esta en el clip: ' + linea);
      }
    }
  }
});

test('Facebook/Instagram abren el caption con el titulo; Shorts no lo repite en la descripcion', () => {
  const fb = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'facebook_reels' });
  const ig = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'instagram_reels' });
  const sh = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'youtube_shorts' });
  assert.ok(fb.descripcion.startsWith(fb.titulo));
  assert.ok(ig.descripcion.startsWith(ig.titulo));
  assert.ok(!sh.descripcion.includes(sh.titulo));
  assert.equal(sh.hashtags[0], '#shorts');
  assert.equal(fb.hashtags[0], '#reels');
  assert.equal(ig.hashtags[0], '#reels');
  assert.equal(sh.cta, 'More on the channel.', 'Shorts es el embudo hacia el canal');
});

test('youtube_long devuelve las variantes de titulo/gancho del catalogo, distintas y dentro del limite', () => {
  for (const mercado of IDS_MERCADOS) {
    for (const canal of IDS_CANALES) {
      const p = generarPaquete({ clip: mercado === 'en-US' ? CLIP_EN : CLIP_ES, canal, mercado, destino: 'youtube_long' });
      assert.equal(p.variantes.length, DESTINOS.youtube_long.variantesTitulo);
      assert.equal(new Set(p.variantes.map((v) => v.titulo)).size, p.variantes.length, 'titulos repetidos');
      assert.ok(p.variantes.every((v) => v.titulo.length <= LIMITES.youtube_long.titulo && v.gancho));
      assert.equal(p.titulo, p.variantes[0].titulo);
      const serie = CANALES[canal].estructuraLarga === 'serie';
      const ultimo = p.variantes[2].titulo;
      const esperado = mercado === 'en-US' ? (serie ? 'Full Series' : 'Key Moments') : (serie ? 'Serie completa' : 'Momentos clave');
      assert.ok(ultimo.includes(esperado), canal + '/' + mercado + ': ' + ultimo);
    }
  }
});

test('un titulo larguisimo se recorta en palabra completa y las variantes siguen cabiendo', () => {
  const largo = 'palabra '.repeat(80).trim();
  const clip = { id: 'x', titulo: largo.replace(/palabra/g, 'story'), transcripcion: '' };
  for (const destino of IDS_DESTINOS) {
    const p = generarPaquete({ clip, canal: 'stories', mercado: 'en-US', destino });
    assert.ok(p.titulo.length <= 100, destino + ': ' + p.titulo.length);
    assert.ok(p.titulo.endsWith('…') || p.variantes, destino);
    for (const v of p.variantes || []) assert.ok(v.titulo.length <= 100);
  }
});

test('aviso (y nada traducido) cuando el texto del clip esta en otro idioma que el mercado', () => {
  const enEs = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'es-US', destino: 'facebook_reels' });
  assert.equal(enEs.avisos.length, 1);
  assert.match(enEs.avisos[0], /inglés/);
  assert.ok(enEs.titulo.includes('small-town boxer'), 'el titulo no se traduce solo');
  const esEn = generarPaquete({ clip: CLIP_ES, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' });
  assert.equal(esEn.avisos.length, 1);
  assert.match(esEn.avisos[0], /Spanish/);
  assert.deepEqual(generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' }).avisos, []);
});

test('detectarIdioma: en, es y sin evidencia', () => {
  assert.equal(detectarIdioma('He was born in a small town and the crowd went silent'), 'en');
  assert.equal(detectarIdioma('Nació en un pueblo pequeño y la gente se quedó en silencio'), 'es');
  assert.equal(detectarIdioma('Messi'), null);
  assert.equal(detectarIdioma(''), null);
});

test('un clip sin procesar (titulo = URL) no publica la URL como titulo', () => {
  const sinTitulo = generarPaquete({ clip: { id: 'a', titulo: 'https://youtu.be/abc123' }, canal: 'news', mercado: 'en-US', destino: 'facebook_reels' });
  assert.ok(!/https?:|youtu/i.test(sinTitulo.titulo + sinTitulo.texto));
  assert.equal(sinTitulo.avisos.length, 1);
  const conMarketing = generarPaquete({ clip: { id: 'a', titulo: 'https://youtu.be/abc123', marketing: { titulo: 'A real hook title here' } }, canal: 'news', mercado: 'en-US', destino: 'facebook_reels' });
  assert.equal(conMarketing.titulo, 'A real hook title here');
  assert.deepEqual(conMarketing.avisos, []);
});

test('limpia caracteres peligrosos (<, >, control) del titulo y del texto', () => {
  const p = generarPaquete({ clip: { id: 'a', titulo: 'Hack <script>alert(1)</script>\u0007 the game', transcripcion: '' }, canal: 'sports', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(!/[<>\u0007]/.test(p.titulo + p.texto + p.variantes.map((v) => v.titulo).join('')));
});

test('es determinista: mismo clip, destino y mercado -> mismo paquete', () => {
  const a = generarPaquete({ clip: CLIP_EN, canal: 'news', mercado: 'en-US', destino: 'instagram_reels' });
  const b = generarPaquete({ clip: { ...CLIP_EN }, canal: 'news', mercado: 'en-US', destino: 'instagram_reels' });
  assert.deepEqual(a, b);
});

test('validacion: canal, mercado y destino invalidos o ausentes no se adivinan', () => {
  const ok = { clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' };
  assert.throws(() => generarPaquete({ ...ok, canal: undefined }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, canal: 'cocina' }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, mercado: undefined }), (e) => e instanceof ErrorMercado && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, mercado: 'fr-FR' }), (e) => e instanceof ErrorMercado);
  assert.throws(() => generarPaquete({ ...ok, destino: 'tiktok' }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, destino: undefined }), (e) => e instanceof ErrorCanal);
  assert.throws(() => generarPaquete({ ...ok, destino: ['facebook_reels', 'youtube_shorts'] }), (e) => e instanceof ErrorPaquete && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, clip: null }), (e) => e instanceof ErrorPaquete && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, clip: [] }), (e) => e instanceof ErrorPaquete);
  assert.throws(() => generarPaquete(), ErrorPaquete);
  // Variantes de escritura validas.
  const p = generarPaquete({ ...ok, canal: ' Stories ', mercado: 'EN_us', destino: ' Facebook_Reels ' });
  assert.equal(p.mercado, 'en-US');
  assert.equal(p.destino, 'facebook_reels');
});

test('generarPaquetes: por defecto todos los mercados y destinos del canal (principal primero) o el subconjunto pedido', () => {
  const todos = generarPaquetes({ clip: CLIP_EN, canal: 'sports' });
  assert.equal(todos.length, IDS_MERCADOS.length * CANALES.sports.destinos.length);
  assert.equal(todos[0].mercado, 'en-US');
  assert.equal(todos.at(-1).mercado, 'es-US');
  const uno = generarPaquetes({ clip: CLIP_EN, canal: 'sports', mercados: 'es-US', destinos: ['youtube_shorts'] });
  assert.equal(uno.length, 1);
  assert.equal(uno[0].mercado, 'es-US');
  assert.throws(() => generarPaquetes({ clip: CLIP_EN, canal: 'sports', destinos: 'nope' }), ErrorCanal);
  assert.throws(() => generarPaquetes({ clip: CLIP_EN, canal: 'sports', mercados: 'xx-YY' }), ErrorMercado);
});

test('acortar: corta en palabra, no pasa del maximo y deja intacto lo corto', () => {
  assert.equal(acortar('hola mundo', 50), 'hola mundo');
  const r = acortar('uno dos tres cuatro cinco seis siete ocho', 20);
  assert.ok(r.length <= 20 && r.endsWith('…') && !/\s…$/.test(r), r);
  assert.equal(acortar('  espacios   internos  ', 50), 'espacios internos');
});

test('los idiomas de las plantillas coinciden con los mercados del catalogo', () => {
  assert.deepEqual(IDS_MERCADOS.map((m) => MERCADOS[m].idioma).sort(), ['en', 'es']);
});
