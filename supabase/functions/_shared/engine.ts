// Punto único por el que las Edge Functions usan el motor de reglas.
// El motor NO se copia: es src/missions/flood/ (el mismo archivo que usa el cliente en pruebas).
//
// Si el empaquetado de `supabase functions deploy` no incluyera archivos fuera de supabase/,
// la solución es copiar src/missions/flood y src/contracts a una carpeta bajo
// supabase/functions/_shared/ y cambiar SOLO estas rutas (ver supabase/README.md).

export {
  applyAction,
  computeScore,
  createInitialSnapshot,
  isEvidence,
} from '../../../src/missions/flood/rules.ts';
export { DENIAL_MESSAGES } from '../../../src/missions/flood/config.ts';
export type {
  AppliedEvent,
  DenialCode,
  FloodSnapshot,
  ScenarioId,
} from '../../../src/missions/flood/types.ts';
export type { MissionAction, PlayerRole } from '../../../src/contracts/mission.ts';
