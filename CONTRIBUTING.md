# Guía de Contribución — PERUSAT CREW

¡Bienvenidos al equipo de desarrollo de **PERUSAT CREW: Operación El Niño** (NASA Space Apps Challenge 2026)!

Para mantener el código limpio, verificable y sin conflictos entre roles e inteligencias artificiales (Codex / Antigravity), seguimos estas normas de trabajo colaborativo.

---

## 1. Organización del Repositorio y Propiedad de Carpetas

Cada rol tiene áreas de responsabilidad delimitadas para evitar sobreescrituras simultáneas:

| Directorio | Responsable Principal | Contenido Autorizado |
|---|---|---|
| `src/contracts/` | Rol 01 (Arquitectura) | Tipos canónicos v3 (`mission.ts`) y validadores en tiempo de ejecución (`validation.ts`). **No editar sin revisión formal.** |
| `src/core/` | Rol 01 / Rol 02 | Interfaz `MissionGateway`, manejo de errores y pasarelas oficiales de persistencia. |
| `src/store/` | Rol 01 / Rol 02 | Estado cliente Zustand y despacho de acciones hacia el gateway. |
| `src/game/` | Rol 01 / Rol 05 | Escenas Phaser 4, canvas 2D de la estación, mapas y gestor de audio procedural (`SoundManager`). |
| `src/integration/` | Rol 01 / Rol 04 | Puente React–Phaser (`missionBridge.ts`), arnés técnico y sincronización de eventos. |
| `src/devtools/` | Rol 01 (Apoyo QA) | Consolas de prueba, simulador `DevMissionGateway`, auditoría de eventos y pruebas automatizadas. |
| `public/assets/` | Rol 05 (Arte 2D) | Ilustraciones, sprites y catálogo con créditos en `README.md`. |
| `docs/` | Todo el equipo | Especificaciones técnicas (`specs/`), guías de integración (`integration/`) y casos de prueba (`qa/`). |

---

## 2. Flujo de Trabajo en Git y Ramas

- **Rama `main`:** Rama protegida de producción y entrega final al jurado. Nunca se realizan commits directos sobre `main`.
- **Ramas de funcionalidad (`feat/*`):** Para nuevos componentes, mecánicas o mejoras visuales (ej. `feat/station-2d-canvas`, `feat/sound-manager`).
- **Ramas de corrección (`fix/*`):** Para resolución de bugs o ajustes de validación (ej. `fix/contact-window-timeout`).
- **Ramas de documentación (`docs/*`):** Para guías de integración y rúbrica (ej. `docs/integration-qa-matrix`).

---

## 3. Convención de Mensajes de Commit

Utilizamos el estándar *Conventional Commits* en español o inglés técnico claro:

- `feat:` Nueva funcionalidad para el usuario o la integración (ej. `feat(game): add 2D pixel art station canvas with guide cat`).
- `fix:` Corrección de errores o fallas de lógica (ej. `fix(gateway): enforce contact seconds depletion on image transmission`).
- `docs:` Actualización de especificaciones o documentación pública (ej. `docs(integration): update player action matrix and test scenarios`).
- `test:` Inclusión o ajuste de pruebas automatizadas (ej. `test(devtools): add edge case tests for battery depletion`).
- `chore:` Tareas de mantenimiento, dependencias o tooling (ej. `chore: update .gitignore to exclude internal reference drafts`).

---

## 4. Requisitos Obligatorios para Abrir un Pull Request (PR)

Antes de abrir o fusionar un PR, es **indispensable** verificar localmente:

```bash
# 1. Comprobar que todas las pruebas pasen con 100% de éxito
corepack pnpm test

# 2. Comprobar que TypeScript compile y Vite genere el build limpio sin advertencias críticas
corepack pnpm build
```

### Plantilla de Descripción del PR
Cada Pull Request debe indicar:
1. **Qué cambió:** Resumen conciso de los archivos añadidos o modificados.
2. **Contrato utilizado:** Confirmar que respeta `schemaVersion: 3` sin inventar campos nuevos.
3. **Cómo se probó:** Indicar los comandos ejecutados (`pnpm test`, `pnpm build`) o pasos de prueba manual en navegador.
4. **Evidencia:** Captura de pantalla o registro de prueba si afecta la interfaz visual.

---

## 5. Idioma y Buenas Prácticas de Código

- **Código y Rutas:** Nombres de variables, interfaces, funciones y archivos siempre en **inglés** (ej. `SoundManager.ts`, `StationCanvas.tsx`, `isMissionAction`).
- **Textos de Interfaz y Pedagogía:** La experiencia actual se presenta en **español**, con redacción empática, comprensible para estudiantes y sin jerga hermética. Mantener cadenas listas para internacionalización futura.
- **Rigor Ético:** Todo dato didáctico debe llevar la etiqueta visible **«SIMULADO»**. No asegurar emergencias reales ni sugerir alertas operativas a INDECI, COEN o autoridades civiles.
