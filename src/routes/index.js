import { Router } from 'express';
import healthRoutes from './health.js';
import statusRoutes from './status.js';
import panelRoutes from './panel.js';
import sesionRoutes from './sesion.js';
import cookiesRedesRoutes from './cookies-redes.js';
import loteRoutes from './lote.js';
import paqueteRoutes from './paquete.js';
import guionesRoutes from './guiones.js';
import franjaRoutes from './franja.js';
import editorRoutes from './editor.js';
import { config } from '../config/index.js';

const router = Router();

router.get('/api', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'ClipLab Pro API',
    version: '0.3.0',
    modo: config.modo,
    endpoints: ['/health', '/api/status', '/api/panel/estado', '/api/panel/encolar', '/api/panel/sesion', '/api/panel/cookies-redes', '/api/panel/logo', '/api/panel/lote/aplicar', '/api/panel/canales', '/api/panel/clips/:id/paquete', '/api/panel/clips/:id/descarga', '/api/panel/guiones', '/api/panel/guiones/entorno', '/api/panel/guiones/estado', '/api/panel/guiones/procesar', '/api/panel/guiones/producir', '/api/panel/franja/config', '/api/panel/franja/fuentes', '/api/panel/franja/difuminados/validar', '/api/panel/franja/producir', '/api/panel/produccion/cancelar', '/api/panel/editor/config', '/api/panel/editor/validar', '/api/panel/editor/previsualizar', '/api/panel/editor/renderizar', '/api/panel/editor/cancelar'],
  });
});

// Modo de operacion (publico, sin llave): el panel y los scripts lo consultan para saber si hay publicador.
router.get('/api/modo', (req, res) => {
  res.status(200).json({
    ok: true,
    modo: config.modo,
    local: config.modoLocal,
    publicador: !config.modoLocal,
    canal: config.canal,
    canalValido: config.canalValido,
    ritmo: {
      beatSeconds: config.beatSeconds,
      punchZoom: config.punchZoom,
      hotCutGap: config.hotCutGap,
      segmentMinSeconds: config.segmentMinSeconds,
      segmentMaxSeconds: config.segmentMaxSeconds,
    },
    ritmoOrigen: config.ritmoOrigen,
  });
});

router.use(healthRoutes);
router.use('/api', statusRoutes);
router.use('/api/panel/sesion', sesionRoutes);
router.use('/api/panel/cookies-redes', cookiesRedesRoutes);
router.use('/api/panel', loteRoutes);
router.use('/api/panel', paqueteRoutes);
router.use('/api/panel', guionesRoutes);
router.use('/api/panel', franjaRoutes);
router.use('/api/panel', editorRoutes);
router.use('/api/panel', panelRoutes);

// Publicador automatico (programador + publicador + Chromium). En modo local NO se carga: el import es dinamico a proposito,
// para que ni siquiera se evaluen esos modulos. Sus rutas responden 404 aunque venga una llave valida.
function publicadorDesactivado(req, res) {
  res.status(404).json({ ok: false, error: 'Publicador automatico desactivado (CLIPLAB_MODE=local): descarga el video y copia los textos desde el panel.' });
}

if (config.modoLocal) {
  router.use('/api/programador', publicadorDesactivado);
  router.all('/api/clips/:id/publicar-ahora', publicadorDesactivado);
  router.all('/api/clips/:id/programar', publicadorDesactivado);
} else {
  const { default: programadorRouter } = await import('./programador.js');
  router.use(programadorRouter);
}

export default router;
