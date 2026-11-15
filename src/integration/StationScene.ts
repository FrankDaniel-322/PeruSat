import { Scene } from 'phaser';
import { missionBridge, type StationId } from './missionBridge';

interface StationConfig {
  id: StationId;
  name: string;
  icon: string;
  x: number;
  y: number;
  color: number;
}

const STATIONS: StationConfig[] = [
  { id: 'base', name: 'Base CNOIS', icon: '▤', x: 48, y: 112, color: 0x07d8f8 },
  { id: 'camera', name: 'Mesa Óptica', icon: '⊙', x: 160, y: 104, color: 0x07d8f8 },
  { id: 'antenna', name: 'Terminal Enlace', icon: '⌁', x: 270, y: 112, color: 0xffb02e },
  { id: 'report', name: 'Centro Análisis', icon: '≡', x: 105, y: 148, color: 0x07d8f8 },
];

export class StationScene extends Scene {
  private cleanupBridge: (() => void) | null = null;
  private stationBeacons: Map<StationId, { dot: Phaser.GameObjects.Arc; ping: Phaser.GameObjects.Arc }> = new Map();
  private activeStationId: StationId | null = 'base';
  private tooltipContainer: Phaser.GameObjects.Container | null = null;
  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super('StationScene');
  }

  preload(): void {
    this.load.image('cabina', '/assets/cabina.png');
    this.load.image('descarga', '/assets/descarga.png');
    this.load.image('portada', '/assets/portada.png');
  }

  create(): void {
    // 1. Fondo de la cabina espacial original de UX/UI con nitidez pixel art
    const bg = this.add.image(160, 90, 'cabina');
    bg.setDisplaySize(320, 180);

    // 2. Estrellas titilantes sutiles en los ventanales orbitales
    this.createOrbitalStars();

    // 3. Indicadores visuales discretos sobre cada consola (sin tapar personajes ni arte)
    STATIONS.forEach((station) => {
      this.createDiscreteBeacon(station);
    });

    // 4. Tooltip flotante único que aparece solo al acercarse / pasar el cursor
    this.createInteractiveTooltip();

    // 5. Suscripción al puente React-Phaser
    this.cleanupBridge = missionBridge.onReactRequest((request) => {
      switch (request.kind) {
        case 'setActiveStation':
          this.setActiveStation(request.stationId);
          break;
        case 'triggerShutterEffect':
          this.playShutterEffect();
          break;
        case 'triggerDownlinkEffect':
          this.playDownlinkEffect();
          break;
        case 'triggerAlertEffect':
          this.playAlertEffect();
          break;
        case 'focusTarget':
          this.showBriefToast(`Objetivo: ${request.targetId.toUpperCase()}`);
          break;
      }
    });

    // 6. Atajo de teclado [E] para operar la estación activa
    this.input.keyboard?.on('keydown-E', () => {
      if (this.activeStationId) {
        this.selectStation(this.activeStationId);
      }
    });

    this.events.once('shutdown', () => {
      this.cleanupBridge?.();
      this.cleanupBridge = null;
    });
  }

  private createOrbitalStars(): void {
    const starCoords = [
      [16, 26], [32, 34], [48, 24], [62, 42], [76, 28], [24, 48], [42, 56], [68, 52],
      [242, 28], [258, 38], [274, 25], [290, 44], [302, 30], [250, 52], [268, 58], [286, 50],
    ];

    starCoords.forEach(([x, y], i) => {
      const star = this.add.rectangle(x, y, 1, 1, 0xf6f5e4, 0.35);
      this.tweens.add({
        targets: star,
        alpha: { from: 0.15, to: 0.85 },
        duration: 900 + (i * 137) % 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private createDiscreteBeacon(station: StationConfig): void {
    // Baliza discreta: punto LED central de 3px
    const dot = this.add.circle(station.x, station.y, 3, station.color, 0.7);
    dot.setStrokeStyle(1, 0x01143b, 0.8);

    // Anillo de pulso sutil (solo visible cuando la estación está activa)
    const ping = this.add.circle(station.x, station.y, 4, station.color, 0.5);
    ping.setStrokeStyle(1, station.color, 0.6);
    ping.setVisible(station.id === this.activeStationId);

    this.tweens.add({
      targets: ping,
      scaleX: { from: 1.0, to: 2.2 },
      scaleY: { from: 1.0, to: 2.2 },
      alpha: { from: 0.6, to: 0 },
      duration: 1200,
      repeat: -1,
      ease: 'Quad.easeOut',
    });

    this.stationBeacons.set(station.id, { dot, ping });

    // Zona interactiva invisible de tamaño justo sobre la consola (36x24 px)
    const hitZone = this.add.zone(station.x, station.y, 36, 24).setInteractive({ cursor: 'pointer' });

    hitZone.on('pointerover', () => {
      dot.setScale(1.4);
      dot.setAlpha(1.0);
      this.showTooltip(station);
    });

    hitZone.on('pointerout', () => {
      dot.setScale(1.0);
      dot.setAlpha(station.id === this.activeStationId ? 0.9 : 0.45);
      this.hideTooltip();
    });

    hitZone.on('pointerdown', () => {
      this.selectStation(station.id);
    });
  }

  private createInteractiveTooltip(): void {
    this.tooltipContainer = this.add.container(0, 0);
    this.tooltipContainer.setDepth(20);
    this.tooltipContainer.setVisible(false);

    this.tooltipBg = this.add.rectangle(0, 0, 70, 12, 0x01143b, 0.9);
    this.tooltipBg.setStrokeStyle(1, 0x07d8f8, 0.9);
    this.tooltipContainer.add(this.tooltipBg);

    this.tooltipText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#f6f5e4',
    }).setOrigin(0.5);
    this.tooltipContainer.add(this.tooltipText);
  }

  private showTooltip(station: StationConfig): void {
    if (!this.tooltipContainer || !this.tooltipText || !this.tooltipBg) return;

    const label = `${station.icon} ${station.name} · [E]`;
    this.tooltipText.setText(label);
    const textWidth = Math.max(50, this.tooltipText.width + 8);
    this.tooltipBg.setSize(textWidth, 11);
    this.tooltipBg.setStrokeStyle(1, station.color, 0.9);

    // Ubicar sobre la baliza sin taparla
    this.tooltipContainer.setPosition(station.x, station.y - 12);
    this.tooltipContainer.setAlpha(0);
    this.tooltipContainer.setVisible(true);

    this.tweens.add({
      targets: this.tooltipContainer,
      alpha: 1,
      duration: 150,
    });
  }

  private hideTooltip(): void {
    if (!this.tooltipContainer) return;
    this.tweens.add({
      targets: this.tooltipContainer,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.tooltipContainer?.setVisible(false);
      },
    });
  }

  private showBriefToast(msg: string): void {
    if (!this.tooltipContainer || !this.tooltipText || !this.tooltipBg) return;
    this.tooltipText.setText(msg);
    this.tooltipBg.setSize(this.tooltipText.width + 10, 11);
    this.tooltipBg.setStrokeStyle(1, 0x07d8f8, 1);
    this.tooltipContainer.setPosition(160, 168);
    this.tooltipContainer.setVisible(true);
    this.tooltipContainer.setAlpha(1);

    this.time.delayedCall(1600, () => {
      this.hideTooltip();
    });
  }

  private selectStation(stationId: StationId): void {
    this.activeStationId = stationId;
    this.setActiveStation(stationId);

    // Efecto de pulso discreto al hacer clic
    const beacon = this.stationBeacons.get(stationId);
    if (beacon) {
      const clickRing = this.add.circle(beacon.dot.x, beacon.dot.y, 4, 0x07d8f8, 0.9);
      this.tweens.add({
        targets: clickRing,
        scaleX: 3.5,
        scaleY: 3.5,
        alpha: 0,
        duration: 350,
        onComplete: () => clickRing.destroy(),
      });
    }

    missionBridge.notifyReact({ kind: 'stationSelected', stationId });

    if (stationId === 'base') {
      missionBridge.notifyReact({ kind: 'targetSelected', targetId: 'piura' });
    }
  }

  public setActiveStation(stationId: StationId | null): void {
    this.activeStationId = stationId;
    STATIONS.forEach((s) => {
      const beacon = this.stationBeacons.get(s.id);
      if (beacon) {
        const isActive = s.id === stationId;
        beacon.ping.setVisible(isActive);
        beacon.dot.setAlpha(isActive ? 0.95 : 0.45);
        beacon.dot.setScale(isActive ? 1.2 : 1.0);
      }
    });
  }

  public playShutterEffect(): void {
    this.cameras.main.flash(180, 255, 255, 255);
  }

  public playDownlinkEffect(): void {
    const startX = 270;
    const startY = 112;
    const endX = 48;
    const endY = 112;

    const wave = this.add.graphics();
    let progress = 0;

    const tween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 700,
      onUpdate: () => {
        progress = tween.getValue() ?? 0;
        wave.clear();
        wave.lineStyle(1.5, 0x07d8f8, 1 - progress);
        const currX = startX + (endX - startX) * progress;
        const currY = startY + (endY - startY) * progress + Math.sin(progress * Math.PI * 4) * 8;
        wave.strokeCircle(currX, currY, 4 + progress * 7);
      },
      onComplete: () => wave.destroy(),
    });
  }

  public playAlertEffect(): void {
    this.cameras.main.shake(200, 0.005);
  }
}

export { StationScene as BridgeScene };
