import { Scene } from 'phaser';
import { missionBridge, type StationId } from './missionBridge';

export type RoomId = 'cnois_ops' | 'payload_link';

interface StationLocation {
  id: StationId;
  name: string;
  icon: string;
  x: number;
  y: number;
  color: number;
  room: RoomId;
}

const WORLD_STATIONS: StationLocation[] = [
  { id: 'base', name: 'Base CNOIS', icon: '▤', x: 80, y: 112, color: 0x07d8f8, room: 'cnois_ops' },
  { id: 'report', name: 'Centro Análisis', icon: '≡', x: 200, y: 112, color: 0x07d8f8, room: 'cnois_ops' },
  { id: 'camera', name: 'Mesa Óptica NAOMI', icon: '⊙', x: 100, y: 112, color: 0x07d8f8, room: 'payload_link' },
  { id: 'antenna', name: 'Terminal Banda X', icon: '⌁', x: 220, y: 112, color: 0xffb02e, room: 'payload_link' },
];

export class ExplorableWorldScene extends Scene {
  private currentRoom: RoomId = 'cnois_ops';
  private playerX: number = 80;
  private playerY: number = 135;
  private playerSpeed: number = 100;
  private isTransitioning: boolean = false;

  // Gráficos y contenedores de la escena
  private roomContainer: Phaser.GameObjects.Container | null = null;
  private playerContainer: Phaser.GameObjects.Container | null = null;
  private playerSprite: Phaser.GameObjects.Graphics | null = null;
  private promptContainer: Phaser.GameObjects.Container | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private promptBg: Phaser.GameObjects.Rectangle | null = null;

  // Estado interactivo
  private nearbyStation: StationLocation | null = null;
  private activeStationId: StationId | null = 'base';
  private cleanupBridge: (() => void) | null = null;

  // Teclas
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasdKeys: {
    w?: Phaser.Input.Keyboard.Key;
    a?: Phaser.Input.Keyboard.Key;
    s?: Phaser.Input.Keyboard.Key;
    d?: Phaser.Input.Keyboard.Key;
    e?: Phaser.Input.Keyboard.Key;
  } = {};

  constructor() {
    super('ExplorableWorldScene');
  }

  preload(): void {
    // Si cabina o iconos están disponibles
    this.load.image('cabina', '/assets/cabina.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#01143b');

    // 1. Teclado (Flechas y WASD)
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasdKeys = {
        w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      };

      this.wasdKeys.e?.on('down', () => {
        if (this.nearbyStation) {
          this.interactWithStation(this.nearbyStation.id);
        }
      });
    }

    // 2. Construir la sala inicial
    this.roomContainer = this.add.container(0, 0);
    this.buildCurrentRoom();

    // 3. Crear el jugador astronauta pixel art
    this.createPlayer();

    // 4. Crear el prompt interactivo flotante [E]
    this.createPromptUI();

    // 5. Suscripción al puente de misión React-Phaser
    this.cleanupBridge = missionBridge.onReactRequest((request) => {
      switch (request.kind) {
        case 'setActiveStation':
          this.activeStationId = request.stationId;
          this.refreshBeacons();
          break;
        case 'triggerShutterEffect':
          this.cameras.main.flash(180, 255, 255, 255);
          break;
        case 'triggerDownlinkEffect':
          this.cameras.main.shake(150, 0.004);
          break;
        case 'triggerAlertEffect':
          this.cameras.main.shake(220, 0.008);
          break;
      }
    });

    this.events.once('shutdown', () => {
      this.cleanupBridge?.();
      this.cleanupBridge = null;
    });
  }

  private buildCurrentRoom(): void {
    if (!this.roomContainer) return;
    this.roomContainer.removeAll(true);

    const isCnois = this.currentRoom === 'cnois_ops';

    // Suelo de cuadrícula pixel art
    const floor = this.add.graphics();
    floor.fillStyle(isCnois ? 0x021c4a : 0x062b63, 1);
    floor.fillRect(0, 0, 320, 180);

    // Baldosas de piso
    floor.lineStyle(1, isCnois ? 0x06387d : 0x0c3a80, 0.4);
    for (let x = 0; x < 320; x += 16) {
      floor.lineBetween(x, 70, x, 180);
    }
    for (let y = 70; y < 180; y += 16) {
      floor.lineBetween(0, y, 320, y);
    }

    // Pared superior con paneles metálicos y molduras
    const wall = this.add.graphics();
    wall.fillStyle(0x01143b, 1);
    wall.fillRect(0, 0, 320, 70);
    wall.lineStyle(2, 0x135dbd, 1);
    wall.lineBetween(0, 70, 320, 70);

    // Decoración de pared según habitación
    if (isCnois) {
      // Pantalla central de mapa del Perú / Piura
      const mapFrame = this.add.rectangle(160, 35, 110, 42, 0x062b63);
      mapFrame.setStrokeStyle(1.5, 0x07d8f8);
      const mapTitle = this.add.text(160, 18, 'CNOIS · RADAR PIURA', {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#07d8f8',
      }).setOrigin(0.5);

      // Líneas esquemáticas del río en la pantalla
      const mapLines = this.add.graphics();
      mapLines.lineStyle(1.5, 0x0c91e3, 0.9);
      mapLines.lineBetween(130, 42, 160, 34);
      mapLines.lineBetween(160, 34, 190, 44);
      mapLines.fillStyle(0xffb02e, 1);
      mapLines.fillCircle(160, 34, 2); // Punto Piura

      // Servidores en racks a la izquierda y derecha
      const rack1 = this.add.rectangle(40, 35, 36, 46, 0x021c4a);
      rack1.setStrokeStyle(1, 0x135dbd);
      const rack2 = this.add.rectangle(280, 35, 36, 46, 0x021c4a);
      rack2.setStrokeStyle(1, 0x135dbd);

      // LEDs parpadeantes en los racks
      for (let i = 0; i < 4; i++) {
        const led1 = this.add.circle(30 + (i % 2) * 12, 22 + Math.floor(i / 2) * 12, 1.5, 0x07d8f8, 0.8);
        const led2 = this.add.circle(270 + (i % 2) * 12, 22 + Math.floor(i / 2) * 12, 1.5, 0x10b981, 0.8);
        this.tweens.add({
          targets: [led1, led2],
          alpha: { from: 0.2, to: 1 },
          duration: 400 + i * 200,
          yoyo: true,
          repeat: -1,
        });
        this.roomContainer.add([led1, led2]);
      }

      // Nombre de la sala
      const roomBadge = this.add.text(12, 8, 'SALA 01: CENTRO DE OPERACIONES CNOIS', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#a0c5eb',
      });

      // Michi Guía en el centro junto a la pantalla
      this.drawCat(135, 62);

      // Puerta hacia Sala 02 (Pared Derecha)
      this.drawDoor(312, 110, 'right', 'PUERTA → SALA DE CARGA');

      this.roomContainer.add([floor, wall, mapFrame, mapTitle, mapLines, rack1, rack2, roomBadge]);
    } else {
      // SALA 02: Sala de Carga Útil y Enlace Satelital
      const satFrame = this.add.rectangle(160, 35, 120, 44, 0x021c4a);
      satFrame.setStrokeStyle(1.5, 0xffb02e);
      const satTitle = this.add.text(160, 18, 'TELEMETRÍA PERÚSAT-1 · BANDA X', {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#ffb02e',
      }).setOrigin(0.5);

      // Onda senoidal de frecuencia satelital en la pantalla
      const wave = this.add.graphics();
      wave.lineStyle(1.5, 0xffb02e, 0.85);
      for (let i = 0; i < 70; i += 3) {
        wave.lineBetween(125 + i, 38 + Math.sin(i * 0.2) * 5, 125 + i + 2, 38 + Math.sin((i + 2) * 0.2) * 5);
      }

      // Banco de óptica a la izquierda y antena a la derecha
      const bay1 = this.add.rectangle(40, 35, 36, 46, 0x062b63);
      bay1.setStrokeStyle(1, 0x07d8f8);
      const bay2 = this.add.rectangle(280, 35, 36, 46, 0x062b63);
      bay2.setStrokeStyle(1, 0xffb02e);

      const roomBadge = this.add.text(12, 8, 'SALA 02: CARGA ÚTIL & ENLACE BANDA X', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#ffb02e',
      });

      // Puerta hacia Sala 01 (Pared Izquierda)
      this.drawDoor(8, 110, 'left', '← PUERTA CENTRO CNOIS');

      this.roomContainer.add([floor, wall, satFrame, satTitle, wave, bay1, bay2, roomBadge]);
    }

    // Dibujar las consolas de la habitación actual
    const roomStations = WORLD_STATIONS.filter((s) => s.room === this.currentRoom);
    roomStations.forEach((station) => {
      this.drawConsole(station);
    });
  }

  private drawDoor(x: number, y: number, side: 'left' | 'right', label: string): void {
    if (!this.roomContainer) return;

    const doorFrame = this.add.rectangle(x, y, 16, 42, 0x062b63);
    doorFrame.setStrokeStyle(1.5, side === 'right' ? 0x07d8f8 : 0xffb02e);

    const doorLight = this.add.rectangle(x, y - 24, 18, 5, 0x10b981);
    this.tweens.add({
      targets: doorLight,
      alpha: { from: 0.4, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    const doorText = this.add.text(side === 'right' ? x - 40 : x + 16, y - 28, label, {
      fontFamily: 'monospace',
      fontSize: '5.5px',
      color: '#f6f5e4',
      backgroundColor: '#01143bdd',
      padding: { x: 2, y: 1 },
    });

    this.roomContainer.add([doorFrame, doorLight, doorText]);
  }

  private drawCat(x: number, y: number): void {
    if (!this.roomContainer) return;

    const catG = this.add.graphics();
    // Cuerpo blanco/crema del Michi
    catG.fillStyle(0xf6f5e4, 1);
    catG.fillRect(x - 4, y - 6, 8, 8); // Cabeza
    catG.fillRect(x - 5, y + 2, 10, 8); // Cuerpo
    // Orejas
    catG.fillRect(x - 4, y - 8, 2, 2);
    catG.fillRect(x + 2, y - 8, 2, 2);
    // Ojos cian
    catG.fillStyle(0x07d8f8, 1);
    catG.fillRect(x - 3, y - 4, 1.5, 1.5);
    catG.fillRect(x + 1, y - 4, 1.5, 1.5);
    // Cola
    catG.fillStyle(0xffb02e, 1);
    catG.fillRect(x + 5, y + 4, 3, 2);

    const catLabel = this.add.text(x, y - 12, '🐱 Michi-guía', {
      fontFamily: 'monospace',
      fontSize: '5px',
      color: '#f6f5e4',
    }).setOrigin(0.5);

    // Animación de cola
    this.tweens.add({
      targets: catG,
      y: { from: y, to: y - 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.roomContainer.add([catG, catLabel]);
  }

  private drawConsole(station: StationLocation): void {
    if (!this.roomContainer) return;

    // Mesa de consola
    const table = this.add.rectangle(station.x, station.y, 44, 26, 0x021c4a);
    table.setStrokeStyle(1.5, station.color);

    // Monitor sobre la mesa
    const monitor = this.add.rectangle(station.x, station.y - 7, 26, 14, 0x062b63);
    monitor.setStrokeStyle(1, station.color);

    // Ícono en pantalla
    const icon = this.add.text(station.x, station.y - 7, station.icon, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#f6f5e4',
    }).setOrigin(0.5);

    // Etiqueta permanente legible
    const label = this.add.text(station.x, station.y + 7, station.name, {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#a0c5eb',
    }).setOrigin(0.5);

    // Baliza de pulso si es la consola activa
    const ping = this.add.circle(station.x, station.y - 17, 3, station.color, 0.8);
    const ring = this.add.circle(station.x, station.y - 17, 4, station.color, 0.4);
    ring.setStrokeStyle(1, station.color);
    ring.setVisible(station.id === this.activeStationId);

    this.tweens.add({
      targets: ring,
      scale: { from: 1, to: 2.2 },
      alpha: { from: 0.6, to: 0 },
      duration: 1100,
      repeat: -1,
    });

    // Zona interactiva con clic directo
    const zone = this.add.zone(station.x, station.y, 48, 36).setInteractive({ cursor: 'pointer' });
    zone.on('pointerdown', () => {
      this.interactWithStation(station.id);
    });

    this.roomContainer.add([table, monitor, icon, label, ping, ring, zone]);
  }

  private createPlayer(): void {
    this.playerContainer = this.add.container(this.playerX, this.playerY);
    this.playerContainer.setDepth(15);

    this.playerSprite = this.add.graphics();
    this.renderPlayerSprite(this.playerSprite, 'right');
    this.playerContainer.add(this.playerSprite);

    // Sombra ovalada en los pies
    const shadow = this.add.ellipse(0, 8, 12, 4, 0x01143b, 0.6);
    this.playerContainer.addAt(shadow, 0);

    // Etiqueta flotante con rol
    const tag = this.add.text(0, -16, 'OPERADOR', {
      fontFamily: 'monospace',
      fontSize: '5px',
      color: '#07d8f8',
      backgroundColor: '#01143bcc',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5);
    this.playerContainer.add(tag);
  }

  private renderPlayerSprite(g: Phaser.GameObjects.Graphics, direction: 'left' | 'right'): void {
    g.clear();
    const isGround = true;
    const suitColor = isGround ? 0x07d8f8 : 0xffb02e;
    const dirSign = direction === 'left' ? -1 : 1;

    // Mochila de soporte vital
    g.fillStyle(0x06387d, 1);
    g.fillRect(-5 * dirSign, -7, 3 * dirSign, 10);

    // Cuerpo del traje espacial
    g.fillStyle(suitColor, 1);
    g.fillRect(-4, -6, 8, 10);

    // Casco
    g.fillStyle(0xf6f5e4, 1);
    g.fillCircle(0, -9, 5);

    // Visor dorado/oscuro
    g.fillStyle(0x01143b, 1);
    g.fillRect(dirSign > 0 ? 0 : -3, -11, 3, 3);
    g.fillStyle(0xffb02e, 1);
    g.fillRect(dirSign > 0 ? 1 : -2, -10, 2, 2);

    // Botas
    g.fillStyle(0x021c4a, 1);
    g.fillRect(-4, 4, 3, 4);
    g.fillRect(1, 4, 3, 4);
  }

  private createPromptUI(): void {
    this.promptContainer = this.add.container(0, 0);
    this.promptContainer.setDepth(30);
    this.promptContainer.setVisible(false);

    this.promptBg = this.add.rectangle(0, 0, 90, 14, 0x01143b, 0.95);
    this.promptBg.setStrokeStyle(1.5, 0x07d8f8, 1);
    this.promptContainer.add(this.promptBg);

    this.promptText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '6.5px',
      color: '#f6f5e4',
    }).setOrigin(0.5);
    this.promptContainer.add(this.promptText);
  }

  update(_time: number, delta: number): void {
    if (this.isTransitioning || !this.playerContainer) return;

    let vx = 0;
    let vy = 0;

    const left = this.cursors?.left.isDown || this.wasdKeys.a?.isDown;
    const right = this.cursors?.right.isDown || this.wasdKeys.d?.isDown;
    const up = this.cursors?.up.isDown || this.wasdKeys.w?.isDown;
    const down = this.cursors?.down.isDown || this.wasdKeys.s?.isDown;

    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    // Normalizar movimiento diagonal
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    const dt = delta / 1000;
    this.playerX += vx * this.playerSpeed * dt;
    this.playerY += vy * this.playerSpeed * dt;

    // Límites de colisión de paredes y piso
    this.playerX = Phaser.Math.Clamp(this.playerX, 16, 304);
    this.playerY = Phaser.Math.Clamp(this.playerY, 82, 160);

    this.playerContainer.setPosition(this.playerX, this.playerY);

    // Dirección del sprite
    if (vx < 0 && this.playerSprite) {
      this.renderPlayerSprite(this.playerSprite, 'left');
    } else if (vx > 0 && this.playerSprite) {
      this.renderPlayerSprite(this.playerSprite, 'right');
    }

    // Comprobar proximidad a puertas
    this.checkDoorTriggers();

    // Comprobar proximidad a consolas
    this.checkConsoleProximity();
  }

  private checkDoorTriggers(): void {
    if (this.isTransitioning) return;

    if (this.currentRoom === 'cnois_ops' && this.playerX >= 300 && this.playerY >= 90 && this.playerY <= 130) {
      // Puerta hacia Sala 02
      this.switchRoom('payload_link', 36, 110);
    } else if (this.currentRoom === 'payload_link' && this.playerX <= 20 && this.playerY >= 90 && this.playerY <= 130) {
      // Puerta hacia Sala 01
      this.switchRoom('cnois_ops', 284, 110);
    }
  }

  private switchRoom(targetRoom: RoomId, spawnX: number, spawnY: number): void {
    this.isTransitioning = true;
    this.cameras.main.fade(120, 1, 20, 59);

    this.time.delayedCall(120, () => {
      this.currentRoom = targetRoom;
      this.playerX = spawnX;
      this.playerY = spawnY;
      if (this.playerContainer) {
        this.playerContainer.setPosition(this.playerX, this.playerY);
      }
      this.buildCurrentRoom();
      this.cameras.main.fadeIn(120, 1, 20, 59);
      this.isTransitioning = false;
    });
  }

  private checkConsoleProximity(): void {
    if (this.isTransitioning) return;

    const roomStations = WORLD_STATIONS.filter((s) => s.room === this.currentRoom);
    let closestStation: StationLocation | null = null;
    let minDistance = 28; // Radio de interacción (28 px)

    for (const station of roomStations) {
      const dist = Phaser.Math.Distance.Between(this.playerX, this.playerY, station.x, station.y);
      if (dist < minDistance) {
        minDistance = dist;
        closestStation = station;
      }
    }

    this.nearbyStation = closestStation;

    if (closestStation && this.promptContainer && this.promptText && this.promptBg) {
      const label = `[E] ${closestStation.name}`;
      this.promptText.setText(label);
      this.promptBg.setSize(this.promptText.width + 10, 12);
      this.promptBg.setStrokeStyle(1.5, closestStation.color);
      this.promptContainer.setPosition(closestStation.x, closestStation.y - 18);
      this.promptContainer.setVisible(true);
    } else if (this.promptContainer) {
      this.promptContainer.setVisible(false);
    }
  }

  private interactWithStation(stationId: StationId): void {
    missionBridge.notifyReact({ kind: 'stationSelected', stationId });
    if (stationId === 'base') {
      missionBridge.notifyReact({ kind: 'targetSelected', targetId: 'piura' });
    }
  }

  private refreshBeacons(): void {
    // Reconstruir la sala actualiza visualmente los anillos de pulso activos
    this.buildCurrentRoom();
  }
}
