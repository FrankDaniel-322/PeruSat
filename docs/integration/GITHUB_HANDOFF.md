# Entrega GitHub de arquitectura e integración

La rama local es `feat/integration-and-verification`. El remoto `origin` observado apunta a `https://github.com/USUARIO/PERUSAT-CREW.git`, que devuelve «Repository not found»; es una dirección de ejemplo y no se debe usar para push. El commit de integración conserva el contrato v3 del commit base, incluye pnpm 10.34.9, pruebas, mocks, demos y el [traspaso al Rol 02](ROLE02_SUPABASE_HANDOFF.md). No se debe hacer merge directo a `main`.

## Conectar el repositorio correcto

El Tech Lead debe proporcionar la URL HTTPS del repositorio **PERUSAT CREW** del equipo. No usar un repositorio público con nombre parecido. Desde `D:\PROJECTS\PeruSat`:

```bash
git remote -v
git remote set-url origin <URL-HTTPS-DEL-REPOSITORIO-DEL-EQUIPO>
git remote -v
git ls-remote --heads origin
git fetch origin
git branch -vv
```

Comprobar que el historial local comparte base con la rama principal remota (`git merge-base HEAD origin/main`, o reemplazar `main` por el nombre real que devolvió `ls-remote`). Si no hay ancestro común, detener el push y coordinar la alineación de historiales; no usar `--force` ni `--allow-unrelated-histories` para ocultar el problema.

Cuando el remoto y la base estén confirmados:

```bash
git push -u origin feat/integration-and-verification
```

Abrir un **PR en borrador** hacia la rama principal remota. Adjuntar el resultado de `corepack pnpm test` (17/17), `corepack pnpm build` (dos entradas HTML) y `corepack pnpm install --frozen-lockfile`. Pedir revisión del [contrato de Supabase](ROLE02_SUPABASE_HANDOFF.md) al Rol 02 y de las pantallas al Rol 04. El PR debe dejar explícito que las demos actuales comparten estado solo en memoria dentro de una pestaña.

## Decisión pendiente de contrato

El Documento Maestro se incorporó en `docs/specs/GAME_SPEC.md` y `docs/specs/CONTRACTS_V3.md`. El estado canónico es `MissionStatus = 'ready' | 'running' | 'won' | 'lost'`; el tipo, validador y mocks locales quedaron alineados. Rol 02 debe usar estos cuatro valores en SQL y Realtime. La diferencia pendiente en la forma de las acciones se detalla en `ROLE02_SUPABASE_HANDOFF.md`.
