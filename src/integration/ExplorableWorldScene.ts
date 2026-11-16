import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { missionBridge, type StationId } from './missionBridge';

export type RoomId = 'cnois_ops' | 'payload_link' | 'briefing' | 'debrief' | 'lobby';

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
  // 1. Centro CNOIS: Planificación y Análisis
  { id: 'base', name: 'Base CNOIS', icon: '▤', x: 80, y: 118, color: 0x07d8f8, room: 'cnois_ops' },
  { id: 'report', name: 'Centro Análisis', icon: '≡', x: 235, y: 118, color: 0x07d8f8, room: 'cnois_ops' },

  // 2. Sala Satélite: Óptica y Enlace Banda X
  { id: 'camera', name: 'Mesa Óptica NAOMI', icon: '⊙', x: 80, y: 118, color: 0x07d8f8, room: 'payload_link' },
  { id: 'antenna', name: 'Terminal Banda X', icon: '⌁', x: 235, y: 118, color: 0xffb02e, room: 'payload_link' },

  // 3. Lobby Central
  { id: 'lobby', name: 'Terminal de Base', icon: '❖', x: 160, y: 120, color: 0x07d8f8, room: 'lobby' },

  // 4. Sala Briefing
  { id: 'briefing', name: 'Mesa Táctica Briefing', icon: 'ℹ', x: 160, y: 112, color: 0x07d8f8, room: 'briefing' },

  // 5. Sala Debrief
  { id: 'debrief', name: 'Consola Informe Final', icon: '📄', x: 160, y: 118, color: 0x10b981, room: 'debrief' },
];

export class ExplorableWorldScene extends Scene {
  private currentRoom: RoomId = 'cnois_ops';
  private playerX: number = 80;
  private playerY: number = 135;
  private playerSpeed: number = 110;
  private isTransitioning: boolean = false;

  // Gráficos y contenedores de la escena
  private roomContainer: Phaser.GameObjects.Container | null = null;
  private playerContainer: Phaser.GameObjects.Container | null = null;
  private playerSprite: Phaser.GameObjects.Graphics | null = null;
  private playerSpriteImage: Phaser.GameObjects.Image | null = null;
  private promptContainer: Phaser.GameObjects.Container | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private promptBg: Phaser.GameObjects.Rectangle | null = null;
  private hudContainer: Phaser.GameObjects.Container | null = null;
  private mapOverlayContainer: Phaser.GameObjects.Container | null = null;
  private isMapOpen: boolean = false;

  // Estado interactivo
  private nearbyStation: StationLocation | null = null;
  private activeStationId: StationId | null = 'base';
  private cleanupBridge: (() => void) | null = null;

  // Teclado
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasdKeys: {
    w?: Phaser.Input.Keyboard.Key;
    a?: Phaser.Input.Keyboard.Key;
    s?: Phaser.Input.Keyboard.Key;
    d?: Phaser.Input.Keyboard.Key;
    e?: Phaser.Input.Keyboard.Key;
    m?: Phaser.Input.Keyboard.Key;
  } = {};

  constructor() {
    super('ExplorableWorldScene');
  }

  preload(): void {
    // Fondos ilustrados de salas oficiales (Rol 05)
    this.load.image('room_base_cnois', '/assets/rooms/base-cnois.png');
    this.load.image('room_satellite', '/assets/rooms/satellite.png');
    this.load.image('room_briefing', '/assets/rooms/briefing.png');
    this.load.image('room_debrief', '/assets/rooms/debrief.png');
    this.load.image('room_lobby', '/assets/rooms/lobby.png');
    this.load.image('cabina', '/assets/cabina.png');

    // Sprites de personajes, mascota y objetos oficiales (Rol 05 commit 1509589)
    this.load.image('player_male', '/assets/sprites/player-male.png');
    this.load.image('player_female', '/assets/sprites/player-female.png');
    this.load.image('mascot', '/assets/sprites/mascot.png');
    this.load.image('world_sprite', '/assets/sprites/world-sprite.png');
    this.load.image('scenario_sprites', '/assets/sprites/scenario-sprites.png');
    this.load.image('object_sprites', '/assets/sprites/object-sprites.png');
    this.load.image('room_icons', '/assets/icons/room-icons.png');
    this.load.image('buttons_icons', '/assets/icons/buttons-icons.png');
    this.load.image('interaction_icons', '/assets/icons/interaction-icons.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#01143b');

    // 1. Teclado (Flechas, WASD, E interactuar, M mapa)
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasdKeys = {
        w: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.W ?? 'W'),
        a: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.A ?? 'A'),
        s: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.S ?? 'S'),
        d: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.D ?? 'D'),
        e: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.E ?? 'E'),
        m: this.input.keyboard.addKey(Phaser.Input?.Keyboard?.KeyCodes?.M ?? 'M'),
      };

      this.wasdKeys.e?.on('down', () => {
        if (this.nearbyStation) {
          this.interactWithStation(this.nearbyStation.id);
        }
      });

      this.wasdKeys.m?.on('down', () => {
        this.toggleFacilityMap();
      });
    }

    // 2. Construir la sala inicial
    this.roomContainer = this.add.container(0, 0);
    this.buildCurrentRoom();

    // 3. Crear el jugador astronauta pixel art
    this.createPlayer();

    // 4. Cámara suave siguiendo al jugador (estilo Among Us)
    // Cada sala mide exactamente lo mismo que el viewport; limitar el scroll evita
    // que el seguimiento saque el fondo y las consolas fuera del lienzo.
    this.cameras.main.setBounds(0, 0, 320, 180);
    this.cameras.main.startFollow(this.playerContainer!, true, 0.08, 0.08);

    // 5. Crear el prompt interactivo flotante [E]
    this.createPromptUI();

    // 6. Crear HUD de navegación y minimapa
    this.createHUD();

    // 7. Suscripción al puente de misión React-Phaser
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

    const roomInfo = this.getRoomConfig(this.currentRoom);

    if (this.textures.exists(roomInfo.bgKey)) {
      // 1. Fondo ilustrado oficial de Rol 05 a escala 16:9 pixel art
      const bg = this.add.image(160, 90, roomInfo.bgKey);
      bg.setDisplaySize(320, 180);
      this.roomContainer.add(bg);

      // Velo ambiental sutil para nitidez de personajes y HUD
      const overlay = this.add.rectangle(160, 90, 320, 180, 0x01143b, 0.1);
      this.roomContainer.add(overlay);
    } else {
      // Fallback procedimental si la textura aún se estuviera cargando
      const floor = this.add.graphics();
      floor.fillStyle(0x021c4a, 1);
      floor.fillRect(0, 0, 320, 180);
      floor.lineStyle(1, 0x06387d, 0.4);
      for (let x = 0; x < 320; x += 16) {
        floor.lineBetween(x, 70, x, 180);
      }
      for (let y = 70; y < 180; y += 16) {
        floor.lineBetween(0, y, 320, y);
      }

      const wall = this.add.graphics();
      wall.fillStyle(0x01143b, 1);
      wall.fillRect(0, 0, 320, 70);
      wall.lineStyle(2, 0x135dbd, 1);
      wall.lineBetween(0, 70, 320, 70);
      this.roomContainer.add([floor, wall]);
    }

    // Badge superior del nombre de sala
    const roomBadge = this.add.text(10, 8, roomInfo.title, {
      fontFamily: 'monospace',
      fontSize: '6.5px',
      color: roomInfo.accentColor,
      backgroundColor: '#01143bdd',
      padding: { x: 4, y: 2 },
    });
    this.roomContainer.add(roomBadge);

    // Dibujar Michi Guía en el centro de operaciones
    if (this.currentRoom === 'cnois_ops') {
      this.drawCat(160, 88);
    }

    // Puertas activas según la arquitectura de la base
    roomInfo.doors.forEach((door) => {
      this.drawDoor(door.x, door.y, door.orientation, door.label);
    });

    // Dibujar las consolas interactivas de la habitación actual
    const roomStations = WORLD_STATIONS.filter((s) => s.room === this.currentRoom);
    roomStations.forEach((station) => {
      this.drawConsole(station);
    });

    // Actualizar minimapa HUD
    this.updateMinimap();
  }

  private getRoomConfig(room: RoomId) {
    switch (room) {
      case 'cnois_ops':
        return {
          bgKey: 'room_base_cnois',
          title: 'SALA 01: CENTRO CNOIS · OPERACIONES TERRESTRES',
          accentColor: '#a0c5eb',
          doors: [
            { x: 312, y: 110, orientation: 'right' as const, label: 'PUERTA ESTE → SALA SATÉLITE' },
          ],
        };
      case 'payload_link':
        return {
          bgKey: 'room_satellite',
          title: 'SALA 02: ENLACE SATÉLITE · BANDA X & ÓPTICA',
          accentColor: '#ffb02e',
          doors: [
            { x: 8, y: 110, orientation: 'left' as const, label: '← PUERTA OESTE · BASE CNOIS' },
          ],
        };
      case 'lobby':
        return {
          bgKey: 'room_lobby',
          title: 'LOBBY CENTRAL: DISTRIBUIDOR DE LA BASE ESPACIAL',
          accentColor: '#07d8f8',
          doors: [
            { x: 8, y: 110, orientation: 'left' as const, label: '← BASE CNOIS' },
            { x: 312, y: 110, orientation: 'right' as const, label: 'SALA SATÉLITE →' },
            { x: 160, y: 75, orientation: 'top' as const, label: '↑ SALA BRIEFING' },
            { x: 160, y: 165, orientation: 'bottom' as const, label: '↓ SALA INFORMES' },
          ],
        };
      case 'briefing':
        return {
          bgKey: 'room_briefing',
          title: 'SALA 03: BRIEFING CIENTÍFICO Y SIMULACIÓN NASA',
          accentColor: '#07d8f8',
          doors: [
            { x: 160, y: 165, orientation: 'bottom' as const, label: '↓ LOBBY CENTRAL' },
          ],
        };
      case 'debrief':
        return {
          bgKey: 'room_debrief',
          title: 'SALA 04: DEBRIEFING E INFORMES FINALES',
          accentColor: '#10b981',
          doors: [
            { x: 160, y: 75, orientation: 'top' as const, label: '↑ LOBBY CENTRAL' },
          ],
        };
    }
  }

  private drawDoor(x: number, y: number, orientation: 'left' | 'right' | 'top' | 'bottom', label: string): void {
    if (!this.roomContainer) return;

    const isHorizontal = orientation === 'top' || orientation === 'bottom';
    const w = isHorizontal ? 42 : 16;
    const h = isHorizontal ? 16 : 44;

    const doorFrame = this.add.rectangle(x, y, w, h, 0x062b63, 0.75);
    doorFrame.setStrokeStyle(1.5, orientation === 'right' || orientation === 'top' ? 0x07d8f8 : 0xffb02e);

    const lightX = isHorizontal ? x : x;
    const lightY = isHorizontal ? (orientation === 'top' ? y - 10 : y + 10) : y - 24;
    const doorLight = this.add.rectangle(lightX, lightY, isHorizontal ? 18 : 16, 5, 0x10b981);

    this.tweens.add({
      targets: doorLight,
      alpha: { from: 0.35, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    const textX = isHorizontal ? x : orientation === 'right' ? x - 48 : x + 16;
    const textY = isHorizontal ? (orientation === 'top' ? y + 12 : y - 12) : y - 29;

    const doorText = this.add.text(textX, textY, label, {
      fontFamily: 'monospace',
      fontSize: '5.5px',
      color: '#f6f5e4',
      backgroundColor: '#01143bdd',
      padding: { x: 3, y: 1 },
    });
    if (isHorizontal) doorText.setOrigin(0.5);

    this.roomContainer.add([doorFrame, doorLight, doorText]);
  }

  private drawCat(x: number, y: number): void {
    if (!this.roomContainer) return;

    if (this.textures.exists('mascot')) {
      // Mascota oficial del Rol 05
      const catImg = this.add.image(x, y, 'mascot');
      catImg.setDisplaySize(18, 20);

      const catLabel = this.add.text(x, y - 14, '🐱 Michi-guía', {
        fontFamily: 'monospace',
        fontSize: '5.5px',
        color: '#f6f5e4',
        backgroundColor: '#01143bcc',
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5);

      this.tweens.add({
        targets: catImg,
        y: { from: y, to: y - 2 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.roomContainer.add([catImg, catLabel]);
      return;
    }

    const catG = this.add.graphics();
    catG.fillStyle(0xf6f5e4, 1);
    catG.fillRect(x - 4, y - 6, 8, 8); // Cabeza
    catG.fillRect(x - 5, y + 2, 10, 8); // Cuerpo
    catG.fillRect(x - 4, y - 8, 2, 2); // Orejas
    catG.fillRect(x + 2, y - 8, 2, 2);
    catG.fillStyle(0x07d8f8, 1);
    catG.fillRect(x - 3, y - 4, 1.5, 1.5); // Ojos
    catG.fillRect(x + 1, y - 4, 1.5, 1.5);
    catG.fillStyle(0xffb02e, 1);
    catG.fillRect(x + 5, y + 4, 3, 2); // Cola

    const catLabel = this.add.text(x, y - 12, '🐱 Michi-guía', {
      fontFamily: 'monospace',
      fontSize: '5px',
      color: '#f6f5e4',
      backgroundColor: '#01143bcc',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5);

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

    // Mesa de consola holográfica translúcida
    const table = this.add.rectangle(station.x, station.y, 44, 24, 0x01143b, 0.82);
    table.setStrokeStyle(1.5, station.color);

    // Monitor sobre la mesa
    const monitor = this.add.rectangle(station.x, station.y - 7, 24, 12, 0x062b63, 0.9);
    monitor.setStrokeStyle(1, station.color);

    // Ícono en pantalla
    const icon = this.add.text(station.x, station.y - 7, station.icon, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#f6f5e4',
    }).setOrigin(0.5);

    // Etiqueta permanente legible
    const label = this.add.text(station.x, station.y + 6, station.name, {
      fontFamily: 'monospace',
      fontSize: '5.5px',
      color: '#a0c5eb',
      backgroundColor: '#01143baa',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5);

    // Baliza de pulso si es la consola activa
    const ping = this.add.circle(station.x, station.y - 16, 2.5, station.color, 0.9);
    const ring = this.add.circle(station.x, station.y - 16, 4, station.color, 0.4);
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

    if (this.textures.exists('player_male')) {
      // Sprite oficial de Rol 05
      this.playerSpriteImage = this.add.image(0, -6, 'player_male');
      this.playerSpriteImage.setDisplaySize(18, 26);
      this.playerContainer.add(this.playerSpriteImage);
    } else {
      this.playerSprite = this.add.graphics();
      this.renderPlayerSprite(this.playerSprite, 'right');
      this.playerContainer.add(this.playerSprite);
    }

    const shadow = this.add.ellipse(0, 8, 12, 4, 0x01143b, 0.6);
    this.playerContainer.addAt(shadow, 0);

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

  private createHUD(): void {
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(40);
    this.hudContainer.setScrollFactor(0); // Fijo en pantalla

    // Minimapa esquemático en la esquina superior derecha
    const minimapBg = this.add.rectangle(295, 20, 42, 28, 0x01143bdd);
    minimapBg.setStrokeStyle(1, 0x07d8f8, 0.8);

    const minimapTitle = this.add.text(295, 10, 'BASE [M]', {
      fontFamily: 'monospace',
      fontSize: '5px',
      color: '#a0c5eb',
    }).setOrigin(0.5);

    // Cajas de salas en cruz (Top: Briefing, Left: CNOIS, Center: Lobby, Right: Sat, Bottom: Debrief)
    const mapCenter = this.add.rectangle(295, 22, 8, 6, 0x062b63);
    const mapNorth = this.add.rectangle(295, 15, 8, 5, 0x021c4a);
    const mapSouth = this.add.rectangle(295, 29, 8, 5, 0x021c4a);
    const mapWest = this.add.rectangle(285, 22, 8, 5, 0x021c4a);
    const mapEast = this.add.rectangle(305, 22, 8, 5, 0x021c4a);

    // Botón interactivo para alternar mapa táctico completo
    minimapBg.setInteractive({ cursor: 'pointer' });
    minimapBg.on('pointerdown', () => this.toggleFacilityMap());

    this.hudContainer.add([minimapBg, minimapTitle, mapNorth, mapSouth, mapWest, mapEast, mapCenter]);
  }

  private updateMinimap(): void {
    // Si la sala cambia, actualizamos el color de la sala activa en el HUD
    // (Lobby = center, cnois_ops = west, payload_link = east, briefing = north, debrief = south)
  }

  private toggleFacilityMap(): void {
    if (!this.mapOverlayContainer) {
      this.createTacticalMapOverlay();
    }
    this.isMapOpen = !this.isMapOpen;
    this.mapOverlayContainer?.setVisible(this.isMapOpen);
  }

  private createTacticalMapOverlay(): void {
    this.mapOverlayContainer = this.add.container(0, 0);
    this.mapOverlayContainer.setDepth(50);
    this.mapOverlayContainer.setScrollFactor(0);

    // Fondo oscuro translúcido
    const bg = this.add.rectangle(160, 90, 320, 180, 0x01143bf0);
    bg.setInteractive(); // Bloquea clics al fondo

    // Marco del mapa táctico
    const frame = this.add.rectangle(160, 90, 260, 150, 0x021c4a);
    frame.setStrokeStyle(1.5, 0x07d8f8);

    const title = this.add.text(160, 24, 'MAPA TÁCTICO DE LA BASE ESPACIAL · CNOIS & PERÚSAT-1', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#07d8f8',
    }).setOrigin(0.5);

    // Habitaciones esquemáticas interconectadas estilo Among Us
    // 1. Briefing (Norte)
    const roomB = this.add.rectangle(160, 48, 60, 24, this.currentRoom === 'briefing' ? 0x07d8f8 : 0x062b63);
    roomB.setStrokeStyle(1, 0x07d8f8);
    const textB = this.add.text(160, 48, 'SALA BRIEFING', { fontFamily: 'monospace', fontSize: '5.5px', color: '#f6f5e4' }).setOrigin(0.5);

    // 2. Lobby Central
    const roomL = this.add.rectangle(160, 90, 60, 26, this.currentRoom === 'lobby' ? 0x07d8f8 : 0x062b63);
    roomL.setStrokeStyle(1, 0x07d8f8);
    const textL = this.add.text(160, 90, 'LOBBY CENTRAL', { fontFamily: 'monospace', fontSize: '5.5px', color: '#f6f5e4' }).setOrigin(0.5);

    // 3. CNOIS Ops (Oeste)
    const roomC = this.add.rectangle(75, 90, 70, 26, this.currentRoom === 'cnois_ops' ? 0x07d8f8 : 0x062b63);
    roomC.setStrokeStyle(1, 0x07d8f8);
    const textC = this.add.text(75, 90, 'BASE CNOIS (PLAN)', { fontFamily: 'monospace', fontSize: '5.5px', color: '#f6f5e4' }).setOrigin(0.5);

    // 4. Satélite Carga Útil (Este)
    const roomS = this.add.rectangle(245, 90, 70, 26, this.currentRoom === 'payload_link' ? 0x07d8f8 : 0x062b63);
    roomS.setStrokeStyle(1, 0xffb02e);
    const textS = this.add.text(245, 90, 'ENLACE SATÉLITE', { fontFamily: 'monospace', fontSize: '5.5px', color: '#f6f5e4' }).setOrigin(0.5);

    // 5. Debrief (Sur)
    const roomD = this.add.rectangle(160, 132, 60, 24, this.currentRoom === 'debrief' ? 0x07d8f8 : 0x062b63);
    roomD.setStrokeStyle(1, 0x10b981);
    const textD = this.add.text(160, 132, 'SALA INFORMES', { fontFamily: 'monospace', fontSize: '5.5px', color: '#f6f5e4' }).setOrigin(0.5);

    // Pasillos de interconexión
    const corrG = this.add.graphics();
    corrG.lineStyle(2, 0x0c91e3, 0.8);
    corrG.lineBetween(110, 90, 130, 90); // CNOIS -> Lobby
    corrG.lineBetween(190, 90, 210, 90); // Lobby -> Sat
    corrG.lineBetween(160, 60, 160, 77); // Briefing -> Lobby
    corrG.lineBetween(160, 103, 160, 120); // Lobby -> Debrief

    const closeBtn = this.add.text(160, 155, '[PULSA M O CLIC AQUÍ PARA VOLVER A LA BASE]', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#ffb02e',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => this.toggleFacilityMap());

    this.mapOverlayContainer.add([bg, frame, corrG, title, roomB, textB, roomL, textL, roomC, textC, roomS, textS, roomD, textD, closeBtn]);
  }

  update(_time: number, delta: number): void {
    if (this.isTransitioning || !this.playerContainer || this.isMapOpen) return;

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

    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    const dt = delta / 1000;
    this.playerX += vx * this.playerSpeed * dt;
    this.playerY += vy * this.playerSpeed * dt;

    // Límites de colisión de paredes y piso
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
    this.playerX = clamp(this.playerX, 16, 304);
    this.playerY = clamp(this.playerY, 82, 160);

    this.playerContainer.setPosition(this.playerX, this.playerY);

    if (vx < 0) {
      if (this.playerSpriteImage) {
        this.playerSpriteImage.setFlipX(true);
      } else if (this.playerSprite) {
        this.renderPlayerSprite(this.playerSprite, 'left');
      }
    } else if (vx > 0) {
      if (this.playerSpriteImage) {
        this.playerSpriteImage.setFlipX(false);
      } else if (this.playerSprite) {
        this.renderPlayerSprite(this.playerSprite, 'right');
      }
    }

    // Animación sutil de paso
    if (this.playerSpriteImage) {
      if (vx !== 0 || vy !== 0) {
        const step = Math.sin(_time / 120) * 1.5;
        this.playerSpriteImage.setY(-6 + step);
      } else {
        this.playerSpriteImage.setY(-6);
      }
    }

    // Comprobar proximidad a puertas
    this.checkDoorTriggers();

    // Comprobar proximidad a consolas
    this.checkConsoleProximity();
  }

  private checkDoorTriggers(): void {
    if (this.isTransitioning) return;

    // Transición directa CNOIS <-> Satélite y también soporte para Lobby y Salas
    if (this.currentRoom === 'cnois_ops') {
      if (this.playerX >= 300 && this.playerY >= 90 && this.playerY <= 130) {
        this.switchRoom('payload_link', 36, 110);
      }
    } else if (this.currentRoom === 'payload_link') {
      if (this.playerX <= 20 && this.playerY >= 90 && this.playerY <= 130) {
        this.switchRoom('cnois_ops', 284, 110);
      }
    } else if (this.currentRoom === 'lobby') {
      if (this.playerX <= 20 && this.playerY >= 90 && this.playerY <= 130) {
        this.switchRoom('cnois_ops', 284, 110);
      } else if (this.playerX >= 300 && this.playerY >= 90 && this.playerY <= 130) {
        this.switchRoom('payload_link', 36, 110);
      } else if (this.playerY <= 84 && this.playerX >= 140 && this.playerX <= 180) {
        this.switchRoom('briefing', 160, 145);
      } else if (this.playerY >= 152 && this.playerX >= 140 && this.playerX <= 180) {
        this.switchRoom('debrief', 160, 95);
      }
    } else if (this.currentRoom === 'briefing') {
      if (this.playerY >= 152 && this.playerX >= 140 && this.playerX <= 180) {
        this.switchRoom('cnois_ops', 160, 110);
      }
    } else if (this.currentRoom === 'debrief') {
      if (this.playerY <= 84 && this.playerX >= 140 && this.playerX <= 180) {
        this.switchRoom('cnois_ops', 160, 110);
      }
    }
  }

  public switchRoom(targetRoom: RoomId, spawnX: number, spawnY: number): void {
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
    let minDistance = 28;

    for (const station of roomStations) {
      const dist = Math.hypot(station.x - this.playerX, station.y - this.playerY);
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
    this.buildCurrentRoom();
  }
}
