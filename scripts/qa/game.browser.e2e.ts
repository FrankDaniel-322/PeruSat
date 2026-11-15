import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const screenshots = join(process.cwd(), 'scripts', 'qa', 'artifacts', 'screenshots');

async function openGame(page: Page, scenario: 'A1' | 'A2' = 'A1') {
  await page.goto('/');
  await expect(page.locator('main').getByRole('heading', { name: /PERUSAT CREW/i })).toBeVisible();
  if (scenario === 'A2') await page.getByRole('button', { name: /A2 · Alerta por Crecida/i }).click();
  await page.getByRole('button', { name: /Iniciar Misión Directa/i }).click();
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
  await page.getByRole('button', { name: /\[E\] (Elegir Provincia y Río|Solicitar 2da Observación)/ }).click();
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Solicitud de Observación/ })).toBeVisible();
  await send(page, /Enviar Solicitud al Satélite/);
  await role(page, 'PerúSAT-1');
  await page.getByRole('button', { name: /\[E\] Configurar Sensor Óptico/ }).click();
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Configuración de Resolución/ })).toBeVisible();
  await send(page, /Aprobar Plan y Configurar Sensor/);
  await page.getByRole('button', { name: /\[E\] Disparar Sensor NAOMI/ }).click();
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Ejecución de Captura/ })).toBeVisible();
  await expect(page.locator('.station-tool input[type="range"]')).toHaveValue('66');
  await send(page, /Disparar Cámara NAOMI/);
  await role(page, 'Base CNOIS');
  await page.getByRole('button', { name: /\[E\] Transmitir por Antena/ }).click();
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Transmisión de Datos/ })).toBeVisible();
  await send(page, /Solicitar Telemetría/);
  await role(page, 'PerúSAT-1');
  await page.getByRole('button', { name: /\[E\] Transmitir por Antena/ }).click();
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Transmisión de Datos/ })).toBeVisible();
  await expect(page.locator('.station-tool input[type="range"]')).toHaveValue('8.2');
  await send(page, /Transmitir por Antena Banda X/);
  await role(page, 'Base CNOIS');
  await expect(page.getByRole('button', { name: /Clasificar Evidencia/ }),
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

test('menú: A1, A2, lobby y regreso', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.locator('main').getByRole('heading', { name: /PERUSAT CREW/i })).toBeVisible();
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, 'menu-1366x768.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: join(screenshots, 'menu-1920x1080.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: /Crear o Unirse a Sala/i }).click();
  await expect(page.getByRole('heading', { name: /Lobby Multijugador/i })).toBeVisible();
  await page.locator('button[title="Cerrar ventana"]').click();
  await page.getByRole('button', { name: /Iniciar Misión Directa/i }).click();
  await expect(page.getByRole('combobox', { name: 'Seleccionar escenario' })).toHaveValue('routine');
  await page.getByRole('button', { name: /Menú/i }).first().click();
  await page.getByRole('button', { name: /A2 · Alerta por Crecida/i }).click();
  await page.getByRole('button', { name: /Entrar a la Cabina de Mando/i }).click();
  await expect(page.getByRole('combobox', { name: 'Seleccionar escenario' })).toHaveValue('emergency');
  await page.getByRole('button', { name: /Menú/i }).first().click();
  await expect(page.locator('main').getByRole('heading', { name: /PERUSAT CREW/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /DevTools|Arnés Técnico/i })).toHaveCount(0);
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

test('habitaciones: movimiento, puerta, retorno e interacción E', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: /Entrar en Modo Explorable 2D/i }).click();
  const canvas = page.locator('[aria-label*="Escena interactiva"] canvas').first();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).byteLength).toBeGreaterThan(10_000);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, 'sala-01-inicio.png'), fullPage: true });
  await expect.poll(async () => (await canvas.screenshot()).byteLength, { timeout: 5_000 })
    .toBeGreaterThan(25_000)
    .catch(() => { throw new Error(`La escena explorable permanece vacía. Consola: ${browserErrors.join(' | ')}`); });
  const resources = await page.locator('main').innerText();
  await page.keyboard.press('e');
  await expect(page.locator('.station-tool').getByRole('heading', { name: /Solicitud de Observación/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar consola' }).click();
  // 25 px hasta el corredor; 220 px hasta la puerta a 100 px/s.
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(2400);
  await page.keyboard.up('d');
  await page.screenshot({ path: join(screenshots, 'sala-02-puerta.png'), fullPage: true });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: join(screenshots, 'sala-01-retorno.png'), fullPage: true });
  expect((await page.locator('main').innerText()).match(/⚡\s*\d+Wh.*💾\s*\d+MB.*📡\s*\d+s.*🪙\s*\d+cr/)?.[0])
    .toBe(resources.match(/⚡\s*\d+Wh.*💾\s*\d+MB.*📡\s*\d+s.*🪙\s*\d+cr/)?.[0]);
});
