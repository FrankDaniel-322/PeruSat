import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const screenshots = join(process.cwd(), 'scripts', 'qa', 'artifacts', 'screenshots');
const menuReady = process.env.QA_MENU_READY === '1';
const roomsReady = process.env.QA_ROOMS_READY === '1';

async function openGame(page: Page, scenario: 'A1' | 'A2' = 'A1') {
  await page.goto('/');
  const journey = page.getByRole('button', { name: new RegExp(`Jornada ${scenario === 'A1' ? '1' : '2'}`, 'i') });
  if (await journey.count()) await journey.click();
  await expect(page.getByRole('heading', { name: /PERUSAT CREW/i })).toBeVisible();
  const canvas = page.locator('[aria-label*="Escena interactiva"] canvas').first();
  await expect(canvas).toBeVisible();
  // Phaser crea el canvas antes de cargar la textura: esperar una imagen real evita capturas vacías.
  await expect.poll(async () => (await canvas.screenshot()).byteLength).toBeGreaterThan(25_000);
}

async function station(page: Page, x: number, y: number, heading: RegExp) {
  const canvas = page.locator('[aria-label*="Escena interactiva"] canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('La escena Phaser no tiene área visible');
  await canvas.click({ position: { x: box.width * x / 320, y: box.height * y / 180 } });
  await expect(page.locator('.station-tool').getByRole('heading', { name: heading })).toBeVisible();
}

async function send(page: Page, name: RegExp) {
  const button = page.locator('.station-tool').getByRole('button', { name });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('.station-tool')).toHaveCount(0);
}

async function role(page: Page, name: 'Base CNOIS' | 'PerúSAT-1') {
  const button = page.locator('header').getByRole('button', { name: new RegExp(name) }).first();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('main')).toContainText(name === 'Base CNOIS' ? 'Base CNOIS' : 'Satélite PerúSAT-1');
}

async function captureCycle(page: Page, finding: 'possible_flood' | 'insufficient') {
  await station(page, 48, 112, /Solicitud de Observación/);
  await send(page, /Enviar Solicitud al Satélite/);
  await role(page, 'PerúSAT-1');
  await station(page, 160, 104, /Configuración de Resolución/);
  await send(page, /Aprobar Plan y Configurar Sensor/);
  await station(page, 160, 104, /Ejecución de Captura/);
  await expect(page.locator('.station-tool input[type="range"]')).toHaveValue('66');
  await send(page, /Disparar Cámara NAOMI/);
  await role(page, 'Base CNOIS');
  await station(page, 270, 112, /Transmisión de Datos/);
  await send(page, /Solicitar Telemetría/);
  await role(page, 'PerúSAT-1');
  await station(page, 270, 112, /Transmisión de Datos/);
  await expect(page.locator('.station-tool input[type="range"]')).toHaveValue('116');
  await send(page, /Transmitir por Antena/);
  await role(page, 'Base CNOIS');
  await expect(page.getByRole('button', { name: /Evaluar Evidencia/ }),
    'Tras transmitir, la acción disponible debe abrir el análisis').toBeVisible();
  await station(page, 105, 148, /Evaluación de Evidencia/);
  await page.locator('.station-tool select').selectOption(finding);
  await send(page, /Registrar Clasificación Científica/);
}

test('entrada normal: juego y lobby visibles', async ({ page }) => {
  await openGame(page);
  await page.locator('header button[title="Abrir panel de sala y multijugador"]').click();
  await expect(page.getByRole('heading', { name: /Lobby Multijugador/ })).toBeVisible();
  await page.locator('button[title="Cerrar ventana"]').click();
  await expect(page.getByRole('heading', { name: /Lobby Multijugador/ })).toHaveCount(0);
});

test('la experiencia normal no expone herramientas técnicas', async ({ page }) => {
  await openGame(page);
  await expect(page.getByRole('button', { name: /DevTools|Arnés Técnico/i })).toHaveCount(0);
});

test('modo local: alternar Base y Satélite cambia el operador visible', async ({ page }) => {
  await openGame(page);
  await role(page, 'PerúSAT-1');
  await expect(page.getByText(/BRIEFING · Satélite PerúSAT-1/)).toBeVisible();
  await role(page, 'Base CNOIS');
  await expect(page.getByText(/BRIEFING · Base CNOIS/)).toBeVisible();
});

test('tecla E abre y cierra la consola activa', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('e');
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Solicitud de Observación/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar consola' }).click();
  await expect(page.locator('.station-tool')).toHaveCount(0);
});

test('menú: Jornada 1, Jornada 2, lobby y regreso', async ({ page }) => {
  test.skip(!menuReady, 'Menú y Jornadas pendientes de entrega; activar QA_MENU_READY=1 contra la versión nueva.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /PERUSAT CREW/i })).toBeVisible();
  await page.getByRole('button', { name: /Jornada 1/i }).click();
  await expect(page.getByText(/Jornada 1/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Volver al menú/i }).click();
  await page.getByRole('button', { name: /Jornada 2/i }).click();
  await expect(page.getByText(/Jornada 2/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Lobby|Sala/i }).click();
  await expect(page.getByRole('heading', { name: /Lobby/i })).toBeVisible();
  await page.getByRole('button', { name: /Volver al menú/i }).click();
  await expect(page.getByText(/DevTools/i)).toHaveCount(0);
});

test('A1: una persona completa dos observaciones desde el navegador', async ({ page }) => {
  await openGame(page);
  await captureCycle(page, 'possible_flood');
  await station(page, 48, 112, /Solicitud de Observación/);
  const secondRequest = page.locator('.station-tool').getByRole('button', { name: /Enviar Solicitud al Satélite/ });
  await expect(secondRequest, 'A1 exige una segunda solicitud jugable').toBeEnabled();
  await page.getByRole('button', { name: 'Cerrar consola' }).click();
  await captureCycle(page, 'possible_flood');
  await station(page, 105, 148, /Evaluación de Evidencia/);
  await send(page, /Emitir Informe/);
  await expect(page.getByText(/Objetivo cumplido|Misión completada|GANADA/i).first()).toBeVisible();
});

test('A2: nubes, clasificación prudente y nueva observación', async ({ page }) => {
  await openGame(page, 'A2');
  const scenarioSelect = page.locator('header select');
  if (await scenarioSelect.count()) await scenarioSelect.selectOption('emergency');
  await captureCycle(page, 'insufficient');
  await station(page, 48, 112, /Solicitud de Observación/);
  await expect(page.locator('.station-tool').getByRole('button', { name: /Enviar Solicitud al Satélite/ }),
    'La imagen nublada debe permitir replanificar').toBeEnabled();
  await page.getByRole('button', { name: 'Cerrar consola' }).click();
  await captureCycle(page, 'possible_flood');
  await station(page, 105, 148, /Evaluación de Evidencia/);
  await send(page, /Emitir Informe/);
  await expect(page.getByText(/Objetivo cumplido|Misión completada|GANADA/i).first()).toBeVisible();
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`visual ${viewport.width}x${viewport.height}: controles y modal dentro de pantalla`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: join(screenshots, `inicio-${viewport.width}x${viewport.height}.png`), fullPage: true });
    const canvas = page.locator('[aria-label*="Escena interactiva"] canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width / box!.height - 320 / 180)).toBeLessThan(0.03);
    await canvas.hover({ position: { x: box!.width * 48 / 320, y: box!.height * 112 / 180 } });
    await page.screenshot({ path: join(screenshots, `tooltip-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await station(page, 48, 112, /Solicitud de Observación/);
    const modal = await page.locator('.station-tool').boundingBox();
    expect(modal).not.toBeNull();
    expect(modal!.x).toBeGreaterThanOrEqual(0);
    expect(modal!.y).toBeGreaterThanOrEqual(0);
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(viewport.width);
    expect(modal!.y + modal!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('.station-tool').getByRole('button', { name: /Enviar Solicitud/ })).toBeVisible();
    await page.screenshot({ path: join(screenshots, `consola-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}

test('habitaciones: teclado, puerta, retorno y recursos persistentes', async ({ page }) => {
  test.skip(!roomsReady, 'Habitaciones, posición y puertas pendientes; activar QA_ROOMS_READY=1 al entregar indicadores visibles.');
  await page.goto('/');
  await page.getByRole('button', { name: /Jornada 1/i }).click();
  const room = page.getByTestId('room-name');
  const position = page.getByTestId('player-position');
  const revision = page.getByTestId('mission-revision');
  const resources = page.getByTestId('mission-resources');
  const initialRoom = await room.textContent();
  const initialPosition = await position.textContent();
  const initialRevision = await revision.textContent();
  const initialResources = await resources.textContent();
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.keyboard.down('d');
  try { await expect(position).not.toHaveText(initialPosition ?? ''); }
  finally { await page.keyboard.up('d'); }
  await page.keyboard.down('ArrowLeft');
  try { await expect(position).not.toHaveText(await position.textContent() ?? ''); }
  finally { await page.keyboard.up('ArrowLeft'); }
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: /consola/i })).toBeVisible();
  await page.getByRole('button', { name: /Cerrar/i }).click();
  await page.getByRole('button', { name: /Cruzar puerta/i }).click();
  await expect(room).not.toHaveText(initialRoom ?? '');
  await page.getByRole('button', { name: /Volver|Puerta anterior/i }).click();
  await expect(room).toHaveText(initialRoom ?? '');
  await expect(revision).toHaveText(initialRevision ?? '');
  await expect(resources).toHaveText(initialResources ?? '');
});
