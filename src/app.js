import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { envelope } from './middleware/envelope.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

/**
 * Panel en modo local: quita la pestana y la seccion "Programar y Publicar" y marca <html data-modo="local">.
 * Se hace en el servidor para que no haya parpadeo ni se monte (ni consulte) el publicador en el navegador.
 * Si el HTML ya no trae esas marcas, lo devuelve igual (la prueba tests/modo-local.test.js avisa del cambio).
 */
export function htmlModoLocal(html) {
  return String(html)
    .replace(/<button\b[^>]*\bdata-vista="publicador"[^>]*>[\s\S]*?<\/button>[ \t]*\r?\n?/, '')
    .replace(/<section\b[^>]*\bid="vista-publicador"[^>]*>[\s\S]*?<\/section>[ \t]*\r?\n?/, '')
    .replace(/<html\b(?![^>]*\bdata-modo=)/, '<html data-modo="local"');
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(cors({ origin: config.corsOrigin }));
  // El envelope va ANTES de express.json: un JSON malformado lanza su error dentro del parser, y la
  // respuesta de error tambien debe salir como { success:false, data:null, error }.
  app.use('/api', envelope);
  app.use(express.json({ limit: '1mb' }));

  app.use('/clips', express.static(config.clipsDir, { index: false, dotfiles: 'ignore', maxAge: '1d' }));
  if (config.modoLocal) {
    try {
      const html = htmlModoLocal(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'));
      app.get(['/', '/index.html'], (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.type('html').send(html);
      });
    } catch (error) {
      logger.warn('Modo local: no se pudo preparar el panel sin publicador', { mensaje: error.message });
    }
  }
  app.use(express.static(publicDir, { etag: true }));
  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
