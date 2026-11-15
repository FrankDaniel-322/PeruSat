import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';

const PORT = 4173;
const OUT_DIR = 'D:\\PROJECTS\\PeruSat-pitch-assets';
const SCREENSHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const CLIPS_DIR = path.join(OUT_DIR, 'clips');
const TEMP_FRAMES_DIR = path.join(OUT_DIR, 'temp_frames');

[SCREENSHOTS_DIR, CLIPS_DIR, TEMP_FRAMES_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 1. Iniciar Servidor HTTP estático
const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  let filePath = path.join('dist', file);
  if (!fs.existsSync(filePath)) filePath = path.join('dist', 'index.html');
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`[HTTP] Servidor listo en http://localhost:${PORT}`);

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
      defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    });

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));

    console.log('--- INICIANDO CAPTURA DE ACTIVOS PARA PITCH (1920x1080) ---');

    // 1. Menú Principal
    console.log('Capturando: 01_menu_principal.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_menu_principal.png') });

    // Clip 1: Menú Intro
    await recordClip(page, '01_menu_intro.mp4', 24, async (frameIdx) => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // 2. Entrar en modo juego / Exploración
    console.log('Accediendo al simulador...');
    const startBtn = await page.waitForSelector('button ::-p-text(Iniciar Misión Directa)');
    if (startBtn) await startBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // Cambiar a Mundo Explorable 2D
    const explorableBtn = await page.waitForSelector('button ::-p-text(Base Espacial 2D)');
    if (explorableBtn) await explorableBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // 3. Centro de Operaciones CNOIS
    console.log('Capturando: 04_centro_operaciones_cnois.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_centro_operaciones_cnois.png') });

    // Abrir consola geográfica Base CNOIS (Etapa 1: Tierra sin mostrar Piura de inmediato)
    await page.keyboard.press('KeyE');
    await new Promise((r) => setTimeout(r, 800));
    console.log('Capturando: 04b_consola_geografica_tierra.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04b_consola_geografica_tierra.png') });

    // Cerrar modal
    const closeBaseModal = await page.$('button[aria-label="Cerrar consola"]');
    if (closeBaseModal) await closeBaseModal.click();
    await new Promise((r) => setTimeout(r, 500));

    // Clip 2: Exploración Base con WASD
    console.log('Grabando movimiento de astronauta...');
    await recordClip(page, '02_exploracion_base.mp4', 30, async (frameIdx) => {
      // Simular movimiento con teclas
      if (frameIdx < 15) {
        await page.keyboard.press('KeyD');
      } else {
        await page.keyboard.press('KeyW');
      }
      await new Promise((r) => setTimeout(r, 70));
    });

    // 4. Mapa Táctico General (Among Us Style)
    console.log('Abriendo mapa general de la base...');
    await page.keyboard.press('KeyM');
    await new Promise((r) => setTimeout(r, 600));
    console.log('Capturando: 03_mapa_general_base.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_mapa_general_base.png') });
    await page.keyboard.press('KeyM'); // Cerrar mapa
    await new Promise((r) => setTimeout(r, 500));

    // 5. Visor Cinemático Orbital (Tierra -> Sudamérica -> Perú -> Piura)
    console.log('Abriendo secuencia de aproximación a Piura...');
    const zoomBtn = await page.waitForSelector('button ::-p-text(Órbita & Zoom Piura)');
    if (zoomBtn) await zoomBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturando: 09_zoom_tierra_peru_piura.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_zoom_tierra_peru_piura.png') });

    // Clip 3: Cinemática Tierra a Piura
    await recordClip(page, '03_mapa_tierra_peru_piura.mp4', 28, async (frameIdx) => {
      if (frameIdx === 7 || frameIdx === 14 || frameIdx === 21) {
        const nextBtn = await page.$('button ::-p-text(Siguiente Acercamiento)');
        if (nextBtn) await nextBtn.click();
      }
      await new Promise((r) => setTimeout(r, 90));
    });

    // Avanzar hasta el bloqueo de objetivo del sensor NAOMI
    for (let i = 0; i < 5; i++) {
      const nextBtn = await page.$('button ::-p-text(Siguiente Acercamiento)');
      if (nextBtn) await nextBtn.click();
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 600));

    console.log('Capturando: 10_captura_satelital_naomi.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_captura_satelital_naomi.png') });

    // Transición a consola de captura
    const shootBtn = await page.$('button ::-p-text(Disparar Sensor NAOMI)');
    if (shootBtn) await shootBtn.click();
    await new Promise((r) => setTimeout(r, 1000));

    // 6. Sala del Sensor Óptico NAOMI
    console.log('Capturando: 06_sala_sensor_optico.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_sala_sensor_optico.png') });

    // Clip 4: Disparo Óptico NAOMI
    await recordClip(page, '04_captura_satelital.mp4', 24, async (frameIdx) => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Ejecutar captura
    const captureActionBtn = await page.$('button ::-p-text(Disparar Sensor NAOMI)');
    if (captureActionBtn) await captureActionBtn.click();
    await new Promise((r) => setTimeout(r, 1200));

    // 7. Sala de Comunicaciones y Antena Banda X
    console.log('Abriendo Terminal Banda X...');
    // Cambiar a rol satélite o abrir terminal
    const antennaBtn = await page.$('button ::-p-text(Aguardando enlace de Satélite)');
    // O hacer clic en terminal de antena
    const downlinkNavBtn = await page.$('button[title*="Ir a Terminal"]');
    if (downlinkNavBtn) await downlinkNavBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturando: 07_sala_comunicaciones.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_sala_comunicaciones.png') });

    // Clip 5: Transmisión Banda X
    await recordClip(page, '05_transmision.mp4', 24, async (frameIdx) => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Cambiar a rol satélite para transmitir si es necesario
    const satRoleBtn = await page.$('button ::-p-text(PerúSAT-1)');
    if (satRoleBtn) await satRoleBtn.click();
    await new Promise((r) => setTimeout(r, 500));

    const txBtn = await page.$('button ::-p-text(Transmitir por Antena Banda X)');
    if (txBtn) await txBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // Ir a Centro de Análisis
    const goToReportBtn = await page.$('button ::-p-text(Ir a Clasificar en Centro de Análisis)');
    if (goToReportBtn) await goToReportBtn.click();
    await new Promise((r) => setTimeout(r, 1000));

    // 8. Laboratorio de Análisis y Comparación de Evidencias
    console.log('Capturando: 08_laboratorio_analisis.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_laboratorio_analisis.png') });

    console.log('Capturando: 11_comparacion_evidencias.png');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_comparacion_evidencias.png') });

    // Clip 6: Clasificación e Informe
    await recordClip(page, '06_analisis_informe.mp4', 26, async (frameIdx) => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // 9. Capturar también Lobby y Briefing
    console.log('Capturando escenas complementarias: Lobby y Briefing...');
    // Volver a explorable y cambiar a lobby
    const briefingTabBtn = await page.$('button ::-p-text(Briefing NASA)');
    if (briefingTabBtn) {
      await briefingTabBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      console.log('Capturando: 05_sala_briefing.png');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_sala_briefing.png') });
    }

    // Ir al informe de situación
    const reportTabBtn = await page.$('button ::-p-text(Informe Situación)');
    if (reportTabBtn) {
      await reportTabBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      console.log('Capturando: 12_informe_final.png');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_informe_final.png') });
    }

    // Navegar al lobby central para captura de lobby
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    const explorableStart = await page.waitForSelector('button ::-p-text(Entrar en Modo Explorable 2D)');
    if (explorableStart) {
      await explorableStart.click();
      await new Promise((r) => setTimeout(r, 1200));
      // Cambiar a lobby en la escena Phaser si es posible o capturar
      await page.evaluate(() => {
        const game = window.Phaser?.GAMES?.[0];
        const scene = game?.scene?.getScene('ExplorableWorldScene');
        if (scene && typeof scene.switchRoom === 'function') {
          scene.switchRoom('lobby', 160, 110);
        }
      });
      await new Promise((r) => setTimeout(r, 800));
      console.log('Capturando: 02_lobby_central.png');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_lobby_central.png') });
    }

    await browser.close();
    console.log('--- CAPTURA COMPLETADA CON ÉXITO ---');
  } catch (err) {
    console.error('Error durante la captura:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});

/**
 * Graba una ráfaga de fotogramas PNG y la compila con FFmpeg a MP4 H.264
 */
async function recordClip(page, clipName, frameCount, frameAction) {
  const clipPath = path.join(CLIPS_DIR, clipName);
  const framesPattern = path.join(TEMP_FRAMES_DIR, 'frame_%03d.png');

  // Limpiar temporales
  fs.readdirSync(TEMP_FRAMES_DIR).forEach((f) => fs.unlinkSync(path.join(TEMP_FRAMES_DIR, f)));

  console.log(`[CLIP] Capturando ${frameCount} fotogramas para ${clipName}...`);
  for (let i = 0; i < frameCount; i++) {
    const frameFile = path.join(TEMP_FRAMES_DIR, `frame_${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: frameFile });
    if (frameAction) await frameAction(i);
  }

  // Compilar con ffmpeg
  try {
    const cmd = `ffmpeg -y -framerate 12 -i "${framesPattern}" -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" "${clipPath}"`;
    execSync(cmd, { stdio: 'ignore' });
    console.log(`[CLIP OK] Generado ${clipName} (1920x1080 MP4 H.264)`);
  } catch (e) {
    console.warn(`[CLIP WARN] No se pudo compilar ${clipName} con ffmpeg:`, e.message);
  } finally {
    // Limpiar temporales
    fs.readdirSync(TEMP_FRAMES_DIR).forEach((f) => fs.unlinkSync(path.join(TEMP_FRAMES_DIR, f)));
  }
}
