// Fixtures de la Parte 4: una ficha de ejemplo y un constructor de guiones validos para probar validador, guionista y cola.
export const FICHA = Object.freeze({
  titulo: 'The Rise of Marco Silva',
  canal: 'stories',
  mercado: 'en-US',
  hechos: [
    { tipo: 'persona', valor: 'Marco Silva' },
    { tipo: 'lugar', valor: 'Lisbon, Portugal' },
    { tipo: 'fecha', valor: 'March 3, 1998' },
    { tipo: 'cifra', valor: '12 goals' },
  ],
  partes: 2,
});

export const FICHA_NEWS = Object.freeze({
  titulo: 'Flood warning issued for the river valley',
  canal: 'news',
  mercado: 'en-US',
  hechos: [
    { tipo: 'lugar', valor: 'Porto Alegre' },
    { tipo: 'fecha', valor: 'May 4, 2024' },
    { tipo: 'dato', valor: 'The river rose above the alert level' },
  ],
});

export const NARRACION_EN = 'In 1998 the story of Marco Silva began in Lisbon. He was a quiet kid with a big dream, and the whole neighborhood noticed it. Over the years he scored 12 goals for the club that gave him a chance.';
export const NARRACION_ES = 'En 1998 la historia de Marco Silva empezo en Lisbon. Era un chico callado con un gran sueno, y todo el barrio lo noto. Con los anos marco 12 goles para el club que le dio una oportunidad.';

/** Una parte valida para el canal stories (8 escenas de 6 s = 48 s; maximo por escena 6.9 s; parte de 45 a 75 s). */
export function parte(n, { narracion = NARRACION_EN, escenas = 8, duracion = 6, escena = 'Wide shot of Lisbon at dawn', textoPantalla = 'MARCO SILVA' } = {}) {
  return {
    n,
    narracion,
    tecnico: Array.from({ length: escenas }, () => ({ escena, textoPantalla, efecto: 'zoom_in', duracionSeg: duracion })),
  };
}

export const guionBueno = () => ({ partes: [parte(1), parte(2)] });
