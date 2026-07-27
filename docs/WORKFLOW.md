# Flujo de Trabajo — torneAR

Este documento define el ciclo de desarrollo profesional del proyecto: ramas
(Git Flow), validación automática (CI con GitHub Actions) y manejo de entornos
de base de datos (Supabase Branching).

---

## 1. Git Flow y Ramas

Usamos un Git Flow simplificado con dos ramas de larga vida:

| Rama | Rol | Entorno | Deploy |
|------|-----|---------|--------|
| `main` | **Producción**. Siempre estable y liberable. | Prod | Supabase Prod + build de release |
| `develop` | **Staging / Pruebas**. Integración de features antes de producción. | Staging | Supabase Staging |
| `feature/<nombre>` | Trabajo de una feature puntual. | — | — |
| `hotfix/<nombre>` | Arreglo urgente sobre producción. | — | — |

**Reglas:**

- `main` es **estrictamente producción**. Nunca se commitea directo; solo recibe
  merges vía Pull Request desde `develop` (o desde un `hotfix/*`).
- `develop` es la base de integración. Los features salen de `develop` y vuelven
  a `develop`.
- Cada feature vive en su propia rama `feature/<nombre-descriptivo>`.

### Crear y trabajar una feature

```bash
# Partimos siempre desde develop actualizado
git checkout develop
git pull origin develop

# Nueva rama de feature
git checkout -b feature/caja-del-equipo

# ... trabajás, commiteás ...
git add .
git commit -m "feat(caja): estructura inicial de tesorería"

# Subimos la rama y abrimos PR hacia develop
git push -u origin feature/caja-del-equipo
```

Luego se abre un **Pull Request `feature/... → develop`** en GitHub. Al aprobarse
y pasar CI, se mergea a `develop` (recomendado: *squash merge* para mantener el
historial limpio).

### Promover a Producción

Cuando `develop` está estable y probado en Staging:

```bash
# PR de develop hacia main
# (se hace desde la UI de GitHub: base = main, compare = develop)
```

El PR `develop → main` corre CI de nuevo. Al mergear, `main` queda listo para el
deploy de producción (aplicar migraciones a Supabase Prod + build de release).

### Hotfix urgente

```bash
git checkout main
git pull origin main
git checkout -b hotfix/fix-crash-login
# ... arreglo + commit ...
git push -u origin hotfix/fix-crash-login
# PR hacia main. Después, re-mergear main -> develop para no perder el fix.
```

---

## 2. Integración Continua (CI) — GitHub Actions

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

**Se dispara en:**
- Pull Requests hacia `main` y `develop`.
- Push directo a `main` y `develop`.

**Qué valida (en orden; si algo falla, el check queda rojo):**
1. `npm ci` — instalación reproducible desde `package-lock.json`.
2. `npx tsc --noEmit` — chequeo de tipos TypeScript (modo estricto).
3. `npm run lint` — ESLint (config de Expo).
4. `npm test` — suite de Vitest (una corrida).

### Branch protection (configurar en GitHub una vez)

Para que un PR **no se pueda mergear si CI falla**, activar en
**Settings → Branches → Branch protection rules** para `main` y `develop`:

- ✅ *Require a pull request before merging*.
- ✅ *Require status checks to pass before merging* → seleccionar el check
  **"Type check · Lint · Tests"**.
- ✅ *Require branches to be up to date before merging* (opcional pero recomendado).

> Sin branch protection, CI corre igual e informa el resultado, pero GitHub
> permite mergear a mano. La protección es lo que **bloquea** el merge.

---

## 3. Estrategia de Supabase — Single Project (Free Tier)

**Decisión operativa:** por estar en el **plan gratuito** de Supabase (sin
Branching nativo) y por decisión de proyecto, **NO usamos un proyecto de Staging
separado**. Tanto `main` como `develop` apuntan al **mismo y único proyecto de
Supabase: `yusfykqimalghmmhlfdn` (`tornear-db`) — el de Producción.**

| Entorno | Proyecto Supabase | Rama git |
|---------|-------------------|----------|
| **Producción** | `yusfykqimalghmmhlfdn` (`tornear-db`) | `main` **y** `develop` (comparten DB) |

> ⚠️ **`develop` NO tiene una base de datos aislada.** Cualquier migración,
> RPC, trigger, edge function, seed o test con escritura que se ejecute "desde
> develop" impacta **directamente los datos reales de producción**. No existe
> una red de contención a nivel de base de datos entre `develop` y `main`.

El aislamiento de entornos queda entonces **solo a nivel de código** (ramas + CI).
La base es compartida, así que el cuidado con los datos es **manual y disciplinado**.

### ⚠️ Best practices obligatorias (base compartida con Producción)

Como no hay Staging, estas reglas son la única protección de los datos reales:

1. **Probá primero en local, no contra el proyecto compartido.** Para cambios de
   schema o lógica riesgosa, levantá una base local y validá ahí:
   ```bash
   supabase start          # Postgres + stack local (Docker)
   supabase db reset       # aplica TODAS las migraciones sobre la DB LOCAL
   # ... probás ...
   supabase stop
   ```
   El `supabase db reset` es **destructivo**: solo se corre contra la base
   **local**, nunca contra el proyecto compartido.

2. **Tests SQL contra el proyecto real: siempre en transacción abortada.**
   Envolvé cualquier prueba que inserte/actualice en `BEGIN; ... ROLLBACK;`
   (o `savepoint`), como en `supabase/tests/*.sql`. Nunca dejes datos de prueba
   persistidos. Si insertás algo para probar, **borralo en el mismo paso**.

3. **Migraciones = forward-only y directas a Producción.** No hay "ensayo" en
   otra base: cuando corrés `supabase db push`, va a prod. Revisá cada migración
   con cuidado extra, hacela idempotente (`IF NOT EXISTS`, `OR REPLACE`) y evitá
   operaciones destructivas (`DROP`, `DELETE` masivos, `TRUNCATE`).

4. **Nunca corras `db reset` contra el proyecto compartido.** Es solo para la
   base local. Con los seeds hay que distinguir cuál:

   | Archivo | Para qué | Cómo se aplica |
   |---------|----------|----------------|
   | `supabase/seed_testing.sql` | Fixtures de los pgTAP + la liga de 16 equipos / 160 jugadores para probar la UI | Automático en `supabase db reset` / `supabase start` (`sql_paths` de `config.toml`). **Jamás en producción.** |
   | `supabase/seed.sql` | Seed de **producción**: catálogo de zonas, Temporada 1, predios y los perfiles admin | A mano, una sola vez: `psql "$PROD_DB_URL" -f supabase/seed.sql`. Es idempotente y no se aplica en local. |

   Los catálogos `badges` y `format_rules` no están en ningún seed: los siembran
   sus propias migraciones, así que viajan con `db push`.

5. **`.env` apunta al mismo proyecto en ambas ramas.** No hay credenciales de
   Staging; `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` son las de
   producción tanto trabajando en `develop` como en `main`. Tenelo presente: la
   app en modo dev lee/escribe datos reales.

6. **Ventana de bajo tráfico para cambios sensibles.** Al aplicar migraciones o
   probar flujos con escritura, preferí horarios de poco uso y avisá al equipo.

### Flujo de migraciones (single project)

```bash
# Una sola vez: linkear el CLI al proyecto de producción
supabase link --project-ref yusfykqimalghmmhlfdn

# Tras validar en LOCAL, aplicar migraciones y funciones al proyecto (= prod)
supabase db push
supabase functions deploy
```

Las migraciones (`supabase/migrations/`) y edge functions (`supabase/functions/`)
siguen siendo la **única fuente de verdad**; nunca se modifica el schema a mano
por fuera de una migración versionada.

### Secretos

El proyecto tiene sus secretos de Vault y variables de edge functions. El valor
real (ej. `push_dispatch_secret`) se carga a mano en el Vault del dashboard y
**nunca** se versiona en git (los archivos de migración usan placeholders).

### Camino a futuro

Cuando el proyecto justifique el plan Pro, migrar a **dos proyectos
(Staging + Prod)** o a **Supabase Branching nativo** para recuperar el
aislamiento de datos por entorno. Hasta entonces, rige la disciplina de arriba.

---

## 4. Checklist rápido

**Nueva feature:**
1. `git checkout develop && git pull`
2. `git checkout -b feature/<nombre>`
3. Si hay cambios de schema → nueva migración en `supabase/migrations/`, validada
   **en local** (`supabase start` + `supabase db reset`). ⚠️ Recordá: no hay
   Staging; aplicar al proyecto compartido = aplicar a Producción.
4. Commit + `git push -u origin feature/<nombre>` + PR hacia `develop`.
5. CI verde + review → merge.

**Release a producción (base compartida):**
1. PR `develop → main`.
2. CI verde + review → merge.
3. `supabase link --project-ref yusfykqimalghmmhlfdn && supabase db push && supabase functions deploy`
   (impacta la base real — hacerlo con cuidado, en ventana de bajo tráfico).
4. Build de release (EAS).
