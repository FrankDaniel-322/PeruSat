# PERUSAT CREW — Contratos TypeScript v3

> Extracción fiel de las páginas 11 y 12 del Documento Maestro. **Fuente normativa del prototipo:** `GAME_SPEC.md`.

```typescript
type PlayerRole = 'ground' | 'satellite';
type MissionId = 'flood-piura-01';
type MissionPhase =
  | 'briefing' | 'planning' | 'capture'
  | 'downlink' | 'review' | 'debrief';
type Quality = 'valid' | 'cloudy' | 'corrupt' | 'incomplete';
type Finding = 'normal' | 'possible_flood' | 'insufficient';

interface MissionResources {
  energyWh: number;
  storageMb: number;
  contactSeconds: number;
  budgetCredits: number;
  massKg: number; // informativa para PerúSAT-1 real
}

interface Observation {
  observationId: string;
  targetId: string;
  quality: Quality;
  sizeMb: number;
  capturedAtUtc: string;
  isSimulated: boolean;
  sourceProvider: 'NASA' | 'CONIDA' | 'GAME_SIMULATION';
  sourceUrl?: string;
  transmitted: boolean;
}

interface MissionSnapshot {
  schemaVersion: 3;
  roomId: string;
  missionId: MissionId;
  phase: MissionPhase;
  status: 'ready' | 'running' | 'won' | 'lost';
  revision: number;
  resources: MissionResources;
  observations: Observation[];
  selectedTargetId?: string;
  selectedProfileId?: string;
}

type MissionAction =
  | { type: 'REQUEST_OBSERVATION'; targetId: string }
  | { type: 'APPROVE_PLAN'; profileId: string }
  | { type: 'CAPTURE_IMAGE'; targetId: string }
  | { type: 'REQUEST_TRANSMISSION'; observationId: string }
  | { type: 'TRANSMIT_IMAGE'; observationId: string }
  | { type: 'CLASSIFY_IMAGE'; observationId: string; finding: Finding }
  | { type: 'SUBMIT_REPORT'; reportId: string }
  | { type: 'RESET_MISSION' };
```

**Convenciones:** PascalCase (tipos), camelCase (variables), UPPER_SNAKE_CASE (acciones), ISO 8601 UTC (fechas), Wh (energía), MB (almacenamiento), Mb/s (enlace). No permitir recursos negativos.
