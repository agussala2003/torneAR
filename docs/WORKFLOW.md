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

## 3. Estrategia de Supabase Branching (Entornos de DB)

El objetivo: que `develop` nunca toque la base de datos de producción.

### Entornos

| Entorno | Proyecto Supabase | Rama git | Uso |
|---------|-------------------|----------|-----|
| **Producción** | `yusfykqimalghmmhlfdn` (`tornear-db`) | `main` | Datos reales de usuarios. |
| **Staging** | *proyecto separado a crear* (`tornear-staging`) | `develop` | Pruebas de integración con datos de prueba. |
| **Preview** (opcional) | Rama efímera de Supabase por PR | `feature/*` | Solo con Supabase Branching nativo (plan Pro). |

Las migraciones (`supabase/migrations/`) y edge functions (`supabase/functions/`)
son la **única fuente de verdad**: el mismo set de migraciones se aplica a Staging
primero y a Producción después. Nunca se modifica el schema de un entorno a mano
por fuera de una migración versionada.

### Opción recomendada: dos proyectos (Staging + Prod)

Simple, sin costo de plan Pro, control total.

1. **Crear el proyecto de Staging** una sola vez (desde el dashboard de Supabase
   o `supabase projects create tornear-staging`). Guardar su `project-ref`.
2. **Aplicar migraciones a Staging** (trabajando desde `develop`):
   ```bash
   supabase link --project-ref <STAGING_REF>
   supabase db push            # aplica las migraciones pendientes
   supabase functions deploy   # despliega las edge functions
   ```
3. **Probar en Staging.** La app en modo dev apunta a Staging vía `.env`
   (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` del proyecto Staging).
4. **Promover a Producción** (al mergear `develop → main`):
   ```bash
   supabase link --project-ref yusfykqimalghmmhlfdn
   supabase db push
   supabase functions deploy
   ```

> **Regla de oro:** una migración se aplica a Producción **solo después** de
> haberse validado en Staging. Las migraciones son *forward-only* (no se editan
> las ya aplicadas; los cambios van en una migración nueva).

### Opción avanzada: Supabase Branching nativo (plan Pro)

Si se habilita el plan Pro + integración GitHub, Supabase puede crear una **rama
de base de datos efímera por cada Pull Request**, con su propio schema derivado de
las migraciones. Al mergear, se descarta. Ideal para previews aislados por feature,
pero requiere Pro y conectar el repo en el dashboard de Supabase (*Branching*).

### Secretos por entorno

Cada proyecto (Staging / Prod) tiene sus **propios** secretos de Vault y variables
de edge functions. Ejemplo: el `push_dispatch_secret` debe cargarse por separado en
el Vault de cada entorno. **Nunca** se versiona el valor real en git (los archivos
de migración usan placeholders).

---

## 4. Checklist rápido

**Nueva feature:**
1. `git checkout develop && git pull`
2. `git checkout -b feature/<nombre>`
3. Si hay cambios de schema → nueva migración en `supabase/migrations/` + `supabase db push` a Staging.
4. Commit + `git push -u origin feature/<nombre>` + PR hacia `develop`.
5. CI verde + review → merge.

**Release a producción:**
1. PR `develop → main`.
2. CI verde + review → merge.
3. `supabase link --project-ref yusfykqimalghmmhlfdn && supabase db push && supabase functions deploy`.
4. Build de release (EAS).
