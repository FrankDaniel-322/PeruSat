/**
 * Regiones y valores hipotéticos del ejercicio, inspirados en NASA GPM/IMERG.
 * Modular y escalable para Misión A (inundaciones en el norte del Perú).
 */

export interface GeographicTarget {
  id: string;
  regionId: string;
  name: string;
  province: string;
  river: string;
  coords: { lat: number; lng: number };
  markerX: number; // Coordenada normalizada (0 a 320)
  markerY: number; // Coordenada normalizada (0 a 144)
  imergContext: {
    rateMmH: number;
    accumulated24hMm: number;
    referenceDateUtc: string;
    source: 'SIMULACIÓN · referencia NASA GPM / IMERG V07';
    sourceUrl: 'https://gpm.nasa.gov/data/imerg';
    scientificNote: string;
  };
  opticalSimulation: {
    riverWidthNormalM: number;
    sensorReference: 'PerúSAT-1 (NAOMI - Pan 0.7m / MS 2.8m)';
    cloudRiskFactor: number; // 0 a 1
  };
}

export interface RegionDefinition {
  id: string;
  name: string;
  description: string;
  targets: GeographicTarget[];
}

export const PERU_REGIONS: Record<string, RegionDefinition> = {
  piura: {
    id: 'piura',
    name: 'Región Piura',
    description: 'Cuencas costeras vulnerables a crecidas por impacto del fenómeno de El Niño.',
    targets: [
      {
        id: 'rio-piura',
        regionId: 'piura',
        name: 'Río Piura (Sector Urbano y Bajo Piura)',
        province: 'Piura',
        river: 'Río Piura',
        coords: { lat: -5.1945, lng: -80.6328 },
        markerX: 185,
        markerY: 72,
        imergContext: {
          rateMmH: 42.5,
          accumulated24hMm: 85.0,
          referenceDateUtc: '2026-03-27T03:00:00Z',
          source: 'SIMULACIÓN · referencia NASA GPM / IMERG V07',
          sourceUrl: 'https://gpm.nasa.gov/data/imerg',
          scientificNote: 'Valor hipotético del ejercicio, inspirado en IMERG. No es una medición NASA ni certifica inundación en tierra.',
        },
        opticalSimulation: {
          riverWidthNormalM: 35,
          sensorReference: 'PerúSAT-1 (NAOMI - Pan 0.7m / MS 2.8m)',
          cloudRiskFactor: 0.45,
        },
      },
      {
        id: 'rio-chira',
        regionId: 'piura',
        name: 'Río Chira (Valle Agrícola y Sullana)',
        province: 'Sullana',
        river: 'Río Chira',
        coords: { lat: -4.9039, lng: -80.6853 },
        markerX: 205,
        markerY: 52,
        imergContext: {
          rateMmH: 34.0,
          accumulated24hMm: 68.0,
          referenceDateUtc: '2026-03-27T03:00:00Z',
          source: 'SIMULACIÓN · referencia NASA GPM / IMERG V07',
          sourceUrl: 'https://gpm.nasa.gov/data/imerg',
          scientificNote: 'Valor hipotético del ejercicio. Se requiere evidencia óptica válida para contrastar la situación.',
        },
        opticalSimulation: {
          riverWidthNormalM: 55,
          sensorReference: 'PerúSAT-1 (NAOMI - Pan 0.7m / MS 2.8m)',
          cloudRiskFactor: 0.35,
        },
      },
    ],
  },
};

/** Renderiza el mapa esquemático de la costa norte del Perú en un canvas 2D */
export function drawPeruMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selectedTargetId?: string,
  cloudy = false
): void {
  const scaleX = width / 320;
  const scaleY = height / 144;

  // Fondo marino (Océano Pacífico - Azul espacial profundo)
  ctx.fillStyle = '#01143b';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#062b63';
  ctx.fillRect(0, 0, width, height);

  // Relieve costero y cordillera
  for (let y = 0; y < 144; y += 4) {
    const shore = 73 + ((y >> 2) * 3) + ((Math.sin(y / 13) * 8) | 0);
    const canvasY = y * scaleY;
    const canvasH = 4 * scaleY;
    const shoreX = shore * scaleX;

    // Tierra
    ctx.fillStyle = '#439250';
    ctx.fillRect(shoreX, canvasY, width - shoreX, canvasH);

    // Playa / Línea costera
    ctx.fillStyle = '#f6f5e4';
    ctx.fillRect(shoreX, canvasY, 7 * scaleX, canvasH);

    // Cuenca fluvial Río Piura / Chira
    const river = 185 + ((Math.sin(y / 21) * 20) | 0) + (y >> 3);
    const riverX = river * scaleX;
    ctx.fillStyle = '#0c91e3';
    ctx.fillRect(riverX, canvasY, 10 * scaleX, canvasH);

    // Vegetación / relieve
    for (let x = shore + 13; x < 320; x += 9) {
      if ((x * 11 + y * 7) % 19 < 7) {
        ctx.fillStyle = '#7faa65';
        ctx.fillRect(x * scaleX, canvasY, 7 * scaleX, canvasH);
      }
    }
  }

  // Cuadrículas de coordenadas / retícula
  ctx.strokeStyle = '#135dbd';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40 * scaleX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 30 * scaleY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Marcadores de objetivos (Piura y Chira)
  const allTargets = Object.values(PERU_REGIONS).flatMap((r) => r.targets);
  for (const t of allTargets) {
    const isSelected = t.id === selectedTargetId;
    const tx = t.markerX * scaleX;
    const ty = t.markerY * scaleY;

    // Recuadro de mira satelital
    ctx.strokeStyle = isSelected ? '#07d8f8' : '#ffb02e';
    ctx.lineWidth = isSelected ? 3 : 1.5;
    const boxW = 55 * scaleX;
    const boxH = 40 * scaleY;
    ctx.strokeRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH);

    // Retículo central
    ctx.fillStyle = isSelected ? '#07d8f8' : '#ffb02e';
    ctx.fillRect(tx - 2, ty - 2, 4, 4);

    // Etiqueta
    ctx.font = `bold ${Math.max(9, Math.round(11 * scaleX))}px monospace`;
    ctx.fillStyle = '#f6f5e4';
    ctx.fillText(t.river, tx - boxW / 2, ty - boxH / 2 - 4);
  }

  // Capa simulada de nubes si aplica
  if (cloudy) {
    for (let i = 0; i < 14; i++) {
      const cx = (90 + ((i * 43) % 160)) * scaleX;
      const cy = (20 + ((i * 17) % 90)) * scaleY;
      const cw = 44 * scaleX;
      const ch = 13 * scaleY;
      ctx.fillStyle = i % 2 ? 'rgba(246, 245, 228, 0.75)' : 'rgba(170, 200, 232, 0.7)';
      ctx.fillRect(cx, cy, cw, ch);
    }
  }

  // Watermark SIMULADO
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#ffb02e';
  ctx.fillText('MAPA DIDÁCTICO · SIMULACIÓN', 10 * scaleX, height - 8 * scaleY);
}
