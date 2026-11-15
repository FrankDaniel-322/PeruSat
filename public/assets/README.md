# Asset Catalog and Attribution

This directory contains visual assets used in the **PERUSAT CREW: Operación El Niño** educational web experience.

## Asset Inventory

| File | Purpose | Resolution | Format | Attribution & License |
|---|---|---|---|---|
| `cabina.png` | Background illustration for the mission control room / CNOIS cabin. | 1920 × 1080 | PNG | Original pixel art illustration created by PERUSAT CREW Team (Role 05). Educational fair use. |
| `descarga.png` | Reference composition representing satellite X-band data transmission between orbit and Earth station. | 1920 × 1080 | PNG | Original pixel art illustration created by PERUSAT CREW Team (Role 05). Educational fair use. |
| `portada.png` | Main title and launch banner illustration showing both operators and the guide cat. | 1920 × 1080 | PNG | Original pixel art illustration created by PERUSAT CREW Team (Role 05). Educational fair use. |

## Provenance and Usage Rules

1. **Simulated Nature:** All artwork represents an educational concept inspired by Peru's national satellite PerúSAT-1 and the CNOIS ground center. None of these illustrations represent direct cockpit operations (PerúSAT-1 is uncrewed and directed entirely from Earth).
2. **Path Convention:** In React components and Phaser scenes, all visual assets must be referenced using root-relative paths:
   ```tsx
   <img src="/assets/cabina.png" alt="CNOIS Control Room" />
   ```
3. **No Uncredited Media:** Do not add third-party commercial imagery without explicit license metadata documented here.
