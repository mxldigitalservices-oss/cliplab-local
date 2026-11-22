// Se usa con: node --import ./tests/fixtures/registrar-hook.mjs ...  (variable CARGAS_LOG = archivo donde anotar)
import { register } from 'node:module';

register('./hook-cargas.mjs', import.meta.url, { data: { archivo: process.env.CARGAS_LOG || '' } });
