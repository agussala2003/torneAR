# Auditoría UI/UX — torneAR

**Fecha:** 2026-07-27
**Alcance:** `app/` y `components/` (≈130 archivos)
**Stack:** Expo 54 · React Native 0.81 · Expo Router 6 · NativeWind 4.2 · Zustand 5 · React Hook Form + Zod 4 · Supabase
**Objetivo:** revisión pre-producción sobre 4 pilares — estado/interactividad, usabilidad física, feedback y consistencia.

> Este documento es **solo diagnóstico**. No se modificó ningún archivo de código.

---

## Resumen ejecutivo

| Severidad | Cantidad | Bloquea salida a producción |
|-----------|----------|------------------------------|
| 🔴 Crítico | 5 | Sí |
| 🟡 Medio | 12 | Recomendado resolver |
| 🔵 Bajo | 9 | Deuda técnica |

**Sobre el síntoma reportado** ("selects o toggles que no detectan el cambio visualmente"): la auditoría identificó **dos causas raíz distintas y confirmadas**, no una sola:

1. **El toggle "Modo Oscuro"** (`C1`) sí cambia su estado interno — el thumb del `Switch` se mueve — pero **la app no tiene un solo estilo que dependa del tema**, así que nada más cambia. El usuario percibe "el toggle no hace nada".
2. **Los filtros del Ranking** (`C2`) sí se aplican, pero **un efecto los pisa y los revierte** al volver a la pantalla. El usuario percibe "el select se deselecciona solo".

Ambos son bugs reales pero de naturaleza opuesta: uno es un feature a medio implementar, el otro es una cadena de dependencias inestables. No comparten solución.

---

# 🔴 CRÍTICO

## C1 — El toggle "Modo Oscuro" no produce ningún cambio visual

**Archivos:** [app/(tabs)/profile/settings.tsx:50-55](app/(tabs)/profile/settings.tsx#L50-L55), [app/_layout.tsx:169-216](app/_layout.tsx#L169-L216)

```tsx
// settings.tsx
const { colorScheme, setColorScheme } = useColorScheme();  // de 'nativewind'

<Switch
  value={colorScheme === 'dark'}
  onValueChange={handleToggleTheme}
  ...
/>
```

### Por qué ocurre

El estado del toggle **funciona correctamente**: `setColorScheme()` actualiza el store de NativeWind, `colorScheme` cambia, el `Switch` se re-renderiza y el thumb se mueve. Hasta ahí todo bien.

El problema es que **ningún estilo de la aplicación consume ese valor**. Una búsqueda exhaustiva de variantes de tema en todo el código devuelve **cero resultados**:

```
grep -E '\bdark:|\blight:' app/ components/  →  0 coincidencias
```

Cada pantalla tiene el color oscuro incrustado de forma incondicional: `bg-surface-base`, `text-neutral-on-surface`, `bg-surface-container`. Nunca `dark:bg-… light:bg-…`. Entonces el árbol de estilos es idéntico en ambos modos.

Agravantes que confirman que el feature quedó a medio construir:

- **[app/_layout.tsx:216](app/_layout.tsx#L216)** — `<StatusBar style="light" />` está hardcodeado. En modo claro el texto de la barra de estado quedaría blanco sobre fondo blanco.
- **[app/_layout.tsx:135](app/_layout.tsx#L135)** — `contentStyle: { backgroundColor: Colors.dark.background }` fuerza el fondo oscuro del Stack sin importar el tema.
- **[constants/theme.ts:32-73](constants/theme.ts#L32-L73)** — existe una paleta `Colors.light` completa y perfectamente definida, pero **solo se consume `Colors.dark`** en `_layout.tsx` y `(tabs)/_layout.tsx`.
- **[app/_layout.tsx:169-181](app/_layout.tsx#L169-L181)** — el tema se persiste en `AsyncStorage` y se rehidrata al arrancar. Toda la plomería del estado está hecha; falta únicamente el consumo visual.

### Impacto

El usuario activa/desactiva una preferencia visible en Preferencias y la app no responde. Es el reporte exacto de "toggle que no detecta el cambio".

### Decisión requerida (producto, no técnica)

Son dos caminos y conviene elegir antes de tocar código:

- **(a) Quitar el toggle** de Preferencias y asumir torneAR como app dark-only. Es ~10 líneas y elimina el bug hoy.
- **(b) Implementar el tema claro**: migrar los tokens a variables CSS con `dark:`, revisar los ~270 colores hexadecimales inline (ver `B9`) y hacer dinámico el `StatusBar`. Es un refactor de varios días.

Para salir a producción, **(a) es la opción sensata**; (b) se planifica como feature posterior.

---

## C2 — Los filtros del Ranking se resetean solos al volver a la pantalla

**Archivos:** [app/(tabs)/ranking.tsx:61-108](app/(tabs)/ranking.tsx#L61-L108), [components/GlobalHeader.tsx:73-77](components/GlobalHeader.tsx#L73-L77)

```tsx
// ranking.tsx — loadInitialData
const loadInitialData = useCallback(async () => {
  ...
  if (activeTeamId) {
    const team = await fetchActiveTeamRankingInfo(activeTeamId);
    if (team) {
      initialFilters = { zone: team.zone, category: team.category, format: team.format, rivalesIdeales: false };
      setFilters(initialFilters);        // ⚠️ pisa la selección del usuario, sin condición
    }
  }
  ...
}, [profile, activeTeamId, showAlert, myTeams]);   // ⚠️ myTeams es un array que cambia de identidad

useFocusEffect(useCallback(() => { loadInitialData(); }, [loadInitialData]));
```

### Por qué ocurre — cadena completa

Son tres eslabones que se combinan:

**1. `loadInitialData` llama a `setFilters()` sin condición.**
No distingue entre "primera carga" y "recarga". Cada ejecución sobreescribe los filtros con los valores por defecto del equipo activo.

**2. `myTeams` cambia de identidad referencial constantemente.**
`fetchMyTeams` en [stores/teamStore.ts:50-84](stores/teamStore.ts#L50-L84) construye un **array nuevo** (`formattedTeams`) y lo escribe con `set({ myTeams: formattedTeams })`. Aunque los equipos sean exactamente los mismos, `Object.is(myTeamsAnterior, myTeamsNuevo) === false`.

**3. `GlobalHeader` dispara ese fetch en cada montaje.**

```tsx
// GlobalHeader.tsx:73-77
useEffect(() => {
  if (profile?.id) void fetchMyTeams(profile.id);
}, [profile?.id, fetchMyTeams]);
```

`GlobalHeader` se renderiza en **las cinco tabs** (`index`, `market`, `ranking`, `matches`, `profile`). Cada vez que se monta, refresca el store y genera un `myTeams` nuevo.

**El efecto dominó:**

```
GlobalHeader monta → fetchMyTeams() → myTeams = [array nuevo]
   ↓
RankingScreen re-renderiza con myTeams nuevo
   ↓
loadInitialData cambia de identidad (myTeams está en sus deps)
   ↓
useFocusEffect ve una callback nueva → tear down + re-ejecuta
   ↓
loadInitialData() corre otra vez → setFilters(initialFilters)
   ↓
🔴 Los filtros que el usuario acababa de aplicar se revierten
```

`useFocusEffect` de React Navigation es, internamente, un `useEffect` con la callback en su array de dependencias. Una callback con identidad nueva mientras la pantalla está enfocada **desmonta y vuelve a ejecutar el efecto**. No espera a un cambio de foco real.

### Reproducción

1. Ir a Ranking → abrir Filtros → seleccionar zona "GBA Norte" → Aplicar.
2. Los chips de contexto muestran "GBA Norte" ✅.
3. Tocar cualquier equipo de la tabla → se navega a `/team-stats`.
4. Volver atrás.
5. 🔴 Los filtros volvieron a los del equipo activo. La selección del usuario se perdió sin aviso.

### Efectos secundarios de la misma causa

- **Doble fetch en el montaje inicial** de Ranking: el focus effect corre una vez, `GlobalHeader` refresca `myTeams`, y corre de nuevo. Dos rondas completas de `fetchRankingWithFilters` + `fetchPlayerLeaderboard` por cada entrada a la tab.
- El mismo patrón de `myTeams` inestable afecta a `matches.tsx` y `profile.tsx`, aunque ahí no hay un `setState` que pise input del usuario, así que el costo es solo de red.

### Dirección de arreglo (referencia, no aplicada)

Separar "cargar datos" de "inicializar filtros": mover el `setFilters` a un efecto de inicialización que corra una sola vez por `activeTeamId` (con un `useRef` de guarda), y sacar `myTeams` de las dependencias de `loadInitialData` leyéndolo con `useTeamStore.getState()` dentro de la función. Adicionalmente, subir la llamada a `fetchMyTeams` de `GlobalHeader` a un nivel superior (el layout de tabs) para que no se dispare cinco veces.

---

## C3 — Hitboxes por debajo del mínimo de 44×44

**Estándar aplicado:** 44×44 pt (Apple HIG) / 48×48 dp (Material). Referencia del usuario: 44×44.

Se encontró `hitSlop` en **5 lugares de todo el código** ([market-create.tsx](app/(modals)/market-create.tsx), [market-chats/](app/market-chats/)), sobre cientos de `TouchableOpacity`. El resto depende exclusivamente del tamaño físico del elemento.

### Infracciones graves (controles de uso repetitivo)

| Componente | Ubicación | Tamaño real | Problema |
|---|---|---|---|
| Steppers +/− de goleadores | [ScorerMvpPicker.tsx:86-105](components/matches/ScorerMvpPicker.tsx#L86-L105) | `h-7 w-7` = **28×28** | 🔴 36% por debajo. Es el control **más repetitivo** de la app: el capitán lo toca una vez por gol, por jugador, al cerrar cada partido. |
| Steppers de goles del equipo | [ResultModal.tsx:37-53](components/matches/ResultModal.tsx#L37-L53) | `h-9 w-9` = **36×36** | 🔴 Mismo flujo crítico (carga de resultado). |
| Cerrar modal de filtros | [FilterModal.tsx:90-92](components/market/FilterModal.tsx#L90-L92) | `p-1` + icono 20 = **28×28** | 🔴 |
| Cerrar ProposalModal | [ProposalModal.tsx:134-136](components/matches/ProposalModal.tsx#L134-L136) | icono 22, **sin padding** = **22×22** | 🔴 La mitad del mínimo. |
| Cerrar GuestJoinModal | [GuestJoinModal.tsx:127-129](components/matches/GuestJoinModal.tsx#L127-L129) | icono 22, sin padding = **22×22** | 🔴 |
| Iconos del header (campana, chat, desafíos) | [GlobalHeader.tsx:149-185](components/GlobalHeader.tsx#L149-L185) | iconos 20-21, **sin padding ni hitSlop** | 🔴 Punto de entrada a notificaciones, presente en las 5 tabs. |
| Limpiar búsqueda de rivales | [RivalSearchBar.tsx:25-27](components/ranking/RivalSearchBar.tsx#L25-L27) | `p-1` + icono 16 = **24×24** | 🟡 |
| Botones "atrás" | [team-create.tsx:85](app/team-create.tsx#L85), [team-manage.tsx:460](app/team-manage.tsx#L460), [profile-edit.tsx:133](app/profile-edit.tsx#L133), [notifications.tsx:145](app/notifications.tsx#L145) | `className="w-10"` = **40×24** aprox. | 🟡 Ancho por debajo y **alto sin definir** (solo el del icono, ~22px). |
| Cerrar ActiveTeamSelector | [ActiveTeamSelector.tsx:40-42](components/ui/ActiveTeamSelector.tsx#L40-L42) | `p-2` + icono 24 = **40×40** | 🔵 Muy cerca; sube a 44 con `p-2.5`. |

### Por qué importa más de lo que parece

El stepper de 28×28 de `ScorerMvpPicker` está dentro de una fila con `justify-between` y el `−` está **inmediatamente pegado** al contador de goles. En dedos grandes o con la pantalla mojada (cancha, lluvia — el contexto real de uso de esta app) la tasa de mis-tap es alta, y un mis-tap acá **carga un gol al jugador equivocado** en un resultado que después es difícil de corregir.

### Nota sobre lo que sí está bien

Los botones de filtro cuadrados de Market y Ranking (`h-[48px] w-[48px]`, [market.tsx:233](app/(tabs)/market.tsx#L233), [ranking.tsx:212](app/(tabs)/ranking.tsx#L212)) y el FAB de crear publicación (56×56, [market.tsx:266](app/(tabs)/market.tsx#L266)) cumplen holgadamente. El patrón correcto ya existe en el código — falta propagarlo.

---

## C4 — Inputs de texto sin `KeyboardAvoidingView`

**17 archivos contienen `TextInput`. Solo 5 envuelven en `KeyboardAvoidingView`.**

### ✅ Correctos

[login.tsx:112](app/login.tsx#L112) · [profile-edit.tsx:128](app/profile-edit.tsx#L128) · [chat.tsx:245](app/(modals)/chat.tsx#L245) · [market-chats/[id].tsx:384](app/market-chats/[id].tsx#L384) · [GuestJoinModal.tsx:119](components/matches/GuestJoinModal.tsx#L119)

### 🔴 Sin protección de teclado

| Archivo | Inputs afectados | Gravedad |
|---|---|---|
| [ProposalModal.tsx:392-413](components/matches/ProposalModal.tsx#L392-L413) | "Seña ($)", "Costo total ($)", "Dirección" | 🔴 **El peor caso.** Es un bottom sheet anclado abajo (`justify-end`) y los inputs de costos están **al final del scroll**, justo donde aparece el teclado. En pantallas chicas quedan completamente tapados y el usuario no puede ver lo que escribe. |
| [market-create.tsx:404-414](app/(modals)/market-create.tsx#L404-L414) | Descripción (multiline, `min-h-[100px]`) + Complejo | 🔴 El contador de caracteres `{description.length}/{MAX}` queda oculto justo cuando se necesita. |
| [CancellationModal.tsx](components/matches/CancellationModal.tsx) | Motivo de cancelación | 🔴 Bottom sheet + textarea. |
| [ConfirmDialog.tsx:56-64](components/ui/ConfirmDialog.tsx#L56-L64) | Notas opcionales (`showNotesInput`) | 🔴 Diálogo centrado; al abrirse el teclado los botones Confirmar/Cancelar quedan debajo del teclado y el diálogo no scrollea. |
| [team-manage.tsx:532-539](app/team-manage.tsx#L532-L539) | Nombre de equipo (modal Editar) | 🟡 |
| [onboarding.tsx](app/onboarding.tsx) + [ProfileFormFields.tsx](components/profile/ProfileFormFields.tsx) | Nombre, usuario, fecha de nacimiento | 🟡 Mitigado por `ScrollView` + `keyboardShouldPersistTaps="handled"`, pero sin `KeyboardAvoidingView` el input activo no se desplaza. Contrasta con `profile-edit.tsx`, que **usa los mismos campos y sí lo tiene** — inconsistencia entre dos pantallas hermanas. |
| [team-create.tsx:97-104](app/team-create.tsx#L97-L104) | Nombre del equipo | 🟡 |
| [team-join.tsx](app/team-join.tsx) | Código de invitación | 🟡 |
| [forgot-password.tsx](app/forgot-password.tsx) | Email | 🟡 |
| [admin/season.tsx](app/admin/season.tsx) | Campos de temporada | 🔵 Pantalla de admin. |

### Nota técnica sobre Android

Varios de los que sí lo tienen usan `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` ([profile-edit.tsx:129](app/profile-edit.tsx#L129)) — es decir, **en Android no hacen nada** y delegan en `android:windowSoftInputMode`. Conviene verificar el valor efectivo en `app.json` / el manifest antes de asumir que Android está cubierto.

---

## C5 — Clases de Tailwind inexistentes → estilos que se descartan en silencio

Las clases que no existen en `tailwind.config.js` **no generan error**: NativeWind simplemente no aplica nada. Cuando la clase omitida es un color de texto, el `Text` cae al color por defecto de React Native (**negro**) sobre fondos oscuros.

### 🔴 Texto invisible confirmado

**[app/(modals)/market-create.tsx:204-205](app/(modals)/market-create.tsx#L204-L205)**

```tsx
<View className="bg-surface-high p-6 rounded-xl mb-6 border border-error/20">
  <Text className="text-error font-uiBold text-base mb-2 text-center">Acceso Restringido</Text>
```

`error` **no es un color de primer nivel** en la config. La paleta define `danger.error` → la clase válida es `text-danger-error`. Resultado:

- `text-error` → no aplica → el texto renderiza en **negro (#000) sobre `bg-surface-high` (#2A2A2A)**. Prácticamente ilegible.
- `border-error/20` → no aplica → el borde no se dibuja.

**El impacto es mayor de lo que sugiere el tamaño del bloque:** es el mensaje que ve un usuario **sin permisos de capitán** al intentar crear una publicación de equipo. Es exactamente la explicación de por qué el botón "Crear Publicación" está deshabilitado ([market-create.tsx:420](app/(modals)/market-create.tsx#L420)) — y el usuario no puede leerla. Queda con un formulario bloqueado y sin motivo aparente.

**[components/ranking/RankingFilterBar.tsx:44](components/ranking/RankingFilterBar.tsx#L44)**

```tsx
{activeCount === 0 && <Text className="px-2 font-ui text-xs text-outline">Todos los equipos</Text>}
```

`outline` está anidado bajo `neutral` → la clase correcta es `text-neutral-outline`. El texto "Todos los equipos" (el estado por defecto de la barra de filtros) renderiza en negro sobre `bg-surface-base`.

### 🟡 Fuente inexistente — `font-uiMedium` (14 usos)

`tailwind.config.js` define únicamente `ui`, `uiBold`, `uiBlack`, `display`, `displayBlack`, `epic`. **No existe `uiMedium`.** Cada uso cae a la fuente del sistema, rompiendo la identidad tipográfica:

- [market-create.tsx](app/(modals)/market-create.tsx) — líneas 217, 242, 269, 283, 329, 362, 371, 391 (8 usos, incluidos los **labels de todos los campos del formulario**)
- [MarketCards.tsx](components/market/MarketCards.tsx) — líneas 182, 191, 200, 209
- [MarketListSection.tsx:125](components/market/MarketListSection.tsx#L125) — **el empty state del mercado**
- [market-chats/index.tsx:208](app/market-chats/index.tsx#L208) — **el empty state de chats**

Es visualmente sutil pero sistemático: los dos empty states principales del Mercado usan una fuente distinta al resto de la app.

### 🔵 Clases sin equivalente en React Native

- **[RankingFilterModal.tsx:37](components/ranking/RankingFilterModal.tsx#L37)** — `max-h-[60vh]`. La unidad `vh` no existe en React Native; el modal no tiene tope de altura efectivo y con muchas zonas puede desbordar la pantalla.
- **[RankingFilterModal.tsx:79](components/ranking/RankingFilterModal.tsx#L79)** — `transition-all` sobre el thumb del toggle "Rivales ideales". RN no tiene transiciones CSS: el thumb **salta** entre `left-[3px]` y `right-[3px]` sin animar. Funciona, pero se siente tosco comparado con un `Switch` nativo.

### Recomendación transversal

Ninguno de estos se detecta con `tsc` ni con el ESLint actual. Vale la pena agregar `eslint-plugin-tailwindcss` con `no-custom-classname` apuntando a `tailwind.config.js`, o un chequeo en el CI de `.github/workflows/ci.yml`. Es la única forma de que esta clase de bug no reaparezca.

---

# 🟡 MEDIO

## M1 — `AuthContext` no memoiza su value: re-render global en cascada

**[context/AuthContext.tsx:126](context/AuthContext.tsx#L126)**

```tsx
<AuthContext.Provider value={{ session, user, profile, loading, hydrated, signOut, refreshProfile }}>
```

Objeto literal inline → **identidad nueva en cada render del provider**. Además, `signOut` ([:121](context/AuthContext.tsx#L121)) y `refreshProfile` ([:65](context/AuthContext.tsx#L65)) son funciones declaradas en el cuerpo del componente, recreadas en cada render.

**Consecuencias:**

1. Todo componente que llame a `useAuth()` re-renderiza cuando el provider re-renderiza, aunque solo le interese `profile`. `useAuth()` se usa en más de 20 archivos.
2. Peor: `refreshProfile` inestable **contamina las dependencias aguas abajo**. En [profile-edit.tsx:119](app/profile-edit.tsx#L119), `onSubmit` lo tiene en sus deps, así que `onSubmit` nunca se estabiliza — y `handleSubmit(onSubmit)` se reconstruye en cada render.

**Contraste:** `UIContext` **sí** memoiza (`useMemo`, [UIContext.tsx:51](context/UIContext.tsx#L51)). El patrón correcto ya está en el repo.

**Dirección:** envolver `signOut`/`refreshProfile` en `useCallback` y el value en `useMemo` con las deps correctas.

## M2 — `UIContext`: `useMemo` con dependencias vacías congela closures

**[context/UIContext.tsx:35-54](context/UIContext.tsx#L35-L54)**

```tsx
const showAlert = (title, message) => { setAlertConfig({ visible: true, title, message }); };
const showLoader = (label) => { setLoaderConfig({ visible: true, label }); };
const hideLoader = () => { setLoaderConfig((prev) => ({ ...prev, visible: false })); };

const value = useMemo(() => ({ showAlert, showLoader, hideLoader }), []);  // ⚠️ deps vacías
```

El `useMemo` con `[]` **congela las tres funciones del primer render** para toda la vida del provider.

**Hoy funciona por accidente:** las tres solo capturan `setAlertConfig` / `setLoaderConfig`, que React garantiza estables. Pero es frágil por construcción — si alguien agrega una lectura de estado o prop dentro de cualquiera de ellas, quedará leyendo permanentemente el valor del primer render y el bug será desconcertante de diagnosticar.

Es además una violación de `react-hooks/exhaustive-deps` que el lint actual no está reportando. **No es un bug activo, pero es una trampa cargada.**

## M3 — `team-create`: estado inicializado desde contexto que nunca se sincroniza

**[app/team-create.tsx:21](app/team-create.tsx#L21)**

```tsx
const [zone, setZone] = useState(profile?.zone ?? '');
```

Antipatrón clásico. El argumento de `useState` **solo se evalúa en el primer render**. Si `TeamCreateScreen` monta antes de que `AuthContext` termine de hidratar el perfil (escenario real en cold start o navegación rápida desde `HomeOnboardingState`), `profile` es `null`, `zone` queda `''` y **jamás se actualiza** cuando el perfil llega.

**Síntoma:** el usuario ve "Selecciona una zona" aunque su perfil ya tenga una. Es funcionalmente la misma familia de bug que el usuario reportó ("el select no refleja el valor").

**Contraste:** [profile-edit.tsx:82-84](app/profile-edit.tsx#L82-L84) resuelve exactamente este problema con un `useEffect` + `reset()`, y hasta lo documenta en un comentario. La solución ya existe en el repo, no se aplicó acá.

## M4 — Market dispara dos cargas por cada entrada a la tab

**[app/(tabs)/market.tsx:71-80](app/(tabs)/market.tsx#L71-L80)**

```tsx
useFocusEffect(useCallback(() => {
  void loadMarketData(true);
  if (profile?.id) void fetchMyTeams(profile.id);
}, [loadMarketData, profile?.id, fetchMyTeams]));

useEffect(() => {
  if (profile) void loadMarketData(false);
}, [profile, filterZone, filterSort, loadMarketData]);
```

Ambos efectos llaman a `loadMarketData` y ambos se disparan al montar. El `useEffect` es redundante: `loadMarketData` ya tiene `filterZone` y `filterSort` en sus propias deps ([:69](app/(tabs)/market.tsx#L69)), así que cambiar un filtro **ya** regenera la callback y re-dispara el focus effect.

Peor: el focus effect llama a `fetchMyTeams`, que actualiza `myTeams` en el store, lo que re-renderiza el screen... alimentando el mismo patrón descrito en `C2`. Consumo de red y de cuota de Supabase duplicado en la tab más pesada de la app.

## M5 — Búsqueda de rivales: sin debounce y con condición de carrera

**[app/(tabs)/ranking.tsx:252](app/(tabs)/ranking.tsx#L252) + [:133-144](app/(tabs)/ranking.tsx#L133-L144)**

```tsx
<RivalSearchBar value={searchQuery} onChangeText={(q) => handleSearch(q, filters)} />

async function handleSearch(query, currentFilters = filters) {
  setSearchQuery(query);
  setSearchLoading(true);
  const results = await searchRivalTeams(query, currentFilters, userTeamIds, activeTeamElo);
  setSearchResults(results);   // ⚠️ sin verificar si esta respuesta sigue siendo la vigente
  ...
}
```

**Dos problemas:**

1. **Sin debounce.** Escribir "Boca" dispara 4 queries a Supabase (`B`, `Bo`, `Boc`, `Boca`). Un nombre de 12 caracteres = 12 round-trips.
2. **Condición de carrera.** No hay cancelación ni token de vigencia. Si la respuesta de `"Bo"` llega **después** de la de `"Boca"` (perfectamente posible en redes móviles), `setSearchResults` la escribe igual y el usuario ve **resultados que no corresponden a lo que tiene escrito**.

El síntoma del punto 2 —"escribo y aparece otra cosa"— es fácil de confundir con el bug de sincronización de estado reportado, pero su causa es distinta.

**Dirección:** debounce de ~300ms + un `useRef` con un id de request incremental (o `AbortController`) para descartar respuestas obsoletas.

## M6 — `HeroButton` pierde el guard de `isLoading`

**[components/ui/HeroButton.tsx:35-42](components/ui/HeroButton.tsx#L35-L42)**

```tsx
<TouchableOpacity
  onPress={handlePress}
  disabled={isLoading || props.disabled}   // (1) se calcula bien
  activeOpacity={1}
  {...props}                                // (2) ...y acá se pisa
>
```

El spread `{...props}` va **después** de `disabled`. Como solo se desestructuran `label`, `onPress`, `isLoading` y `style`, la prop `disabled` sigue viva dentro de `props`. Si el caller la pasa explícitamente, **su valor gana y el guard de `isLoading` se pierde**.

**Caso real —** [login.tsx:198-204](app/login.tsx#L198-L204):

```tsx
<HeroButton onPress={handleSubmit(onSubmit)} isLoading={loading} disabled={googleLoading} ... />
```

Mientras `loading === true` y `googleLoading === false`, el botón queda `disabled={false}`: **el usuario puede seguir tocando "Iniciar Sesión" durante la petición**. El texto dice "CARGANDO..." pero el botón responde.

**Mitigación existente:** `onSubmit` tiene `if (loading) return;` ([login.tsx:48](app/login.tsx#L48)), así que no se disparan logins duplicados. El bug es de **feedback**, no de integridad de datos — pero el `GlobalLoader` a pantalla completa ([:229](app/login.tsx#L229)) tapa el botón, así que el impacto real es bajo. Igual el componente está mal y afecta a todo caller futuro.

**Dirección:** mover `{...props}` **antes** de `disabled`.

## M7 — Loader a pantalla completa en cada focus: el contenido "parpadea"

**Archivos:** [matches.tsx:96](app/(tabs)/matches.tsx#L96) · [index.tsx:97](app/(tabs)/index.tsx#L97) · [profile.tsx:87](app/(tabs)/profile.tsx#L87) · [match-detail.tsx:219](app/match-detail.tsx#L219) · [team-manage.tsx:436](app/team-manage.tsx#L436) · [notifications.tsx:137](app/notifications.tsx#L137)

```tsx
if (loading) return <GlobalLoader label="Cargando partidos..." />;
```

El patrón combinado con `useFocusEffect` → `setLoading(true)` produce esto: **cada vez que el usuario vuelve a una tab, el contenido ya renderizado desaparece** y es reemplazado por una animación Lottie a pantalla completa, aunque los datos vayan a ser casi idénticos.

En navegación normal (Partidos → detalle → atrás) el usuario ve un flash de loader completo en vez de la lista que ya estaba ahí. Se percibe como que la app "se reinicia".

**El patrón correcto ya está en el repo:**
- [ranking.tsx:238-239](app/(tabs)/ranking.tsx#L238-L239) usa `RankingRowSkeleton` y preserva el layout.
- [MarketListSection.tsx:42-51](components/market/MarketListSection.tsx#L42-L51) usa `MarketCardSkeleton`.
- Existen `components/ui/Skeleton.tsx`, `MarketCardSkeleton.tsx`, `RankingRowSkeleton.tsx` — la infraestructura está construida y **no se usa en 6 pantallas**.

**Dirección:** distinguir "primera carga" (loader/skeleton) de "refresco" (mantener contenido, `RefreshControl` o indicador sutil). `market.tsx` ya modela esto con `loadMarketData(showFullLoader)` — es el patrón a replicar.

## M8 — Overlays con `absolute inset-0` pueden quedar tapados por `<Modal>` nativo

**Archivos:** [CustomAlert.tsx:36](components/ui/CustomAlert.tsx#L36) · [ConfirmDialog.tsx:46](components/ui/ConfirmDialog.tsx#L46) · [GlobalLoader.tsx:10](components/GlobalLoader.tsx#L10) · [ZonePickerDialog.tsx:39](components/ui/ZonePickerDialog.tsx#L39) · [OptionPickerDialog.tsx:45](components/ui/OptionPickerDialog.tsx#L45)

Estos componentes se posicionan con `absolute inset-0` + `z-[999]` dentro del árbol de React, **no** con `<Modal>`. En iOS y Android, un `<Modal>` nativo se presenta en una **ventana separada del sistema**, por encima de todo el árbol React. Ningún `zIndex` de RN puede superarlo.

**Consecuencia:** si un `<Modal>` está abierto y algo dispara un `CustomAlert` o `GlobalLoader`, el alert queda **detrás** del modal. Invisible.

**Evidencia de que el equipo ya chocó con esto:** [ResultModal.tsx:169](components/matches/ResultModal.tsx#L169) renderiza `{AlertComponent}` **dentro** del `<Modal>`, y [GuestJoinModal.tsx:220](components/matches/GuestJoinModal.tsx#L220) hace lo mismo. Es el workaround correcto, pero aplicado ad-hoc en 2 de los ~8 modales.

**Riesgo concreto no cubierto:** [ProposalModal](components/matches/ProposalModal.tsx) y [CancellationModal](components/matches/CancellationModal.tsx) **no** renderizan alert propio; delegan en `match-detail.tsx`, cuyo `{AlertComponent}` ([match-detail.tsx:573](app/match-detail.tsx#L573)) está **fuera** del modal. Si `submitProposal` falla mientras el modal está abierto, el mensaje de error se muestra detrás. El usuario ve el modal congelado sin explicación.

## M9 — `FlatList` sin `extraData`: trampa latente en los selects

**Archivos:** [OptionPickerDialog.tsx:52-85](components/ui/OptionPickerDialog.tsx#L52-L85) · [ZonePickerDialog.tsx:51-71](components/ui/ZonePickerDialog.tsx#L51-L71) · [ActiveTeamSelector.tsx:45-70](components/ui/ActiveTeamSelector.tsx#L45-L70)

```tsx
<FlatList
  data={options}
  // ❌ falta extraData={selected}
  renderItem={({ item }) => (
    <TouchableOpacity className={selected === item ? 'border-brand-primary' : '...'}>
```

`renderItem` cierra sobre `selected` / `selectedZone` / `activeTeamId`, pero esos valores **no están en `data` ni en `extraData`**. `FlatList` extiende `PureComponent` y decide re-renderizar por comparación superficial de props.

**Por qué hoy no se rompe:** `renderItem` está declarado inline, así que su identidad cambia en cada render del padre, la comparación superficial falla y `FlatList` re-renderiza igual. **Funciona por efecto colateral, no por diseño.**

**Cuándo se rompe:** en el momento en que alguien "optimice" envolviendo `renderItem` en `useCallback` o extrayéndolo a nivel de módulo — una refactorización que parece inocua. Ahí sí: seleccionar un ítem cambia el estado pero **la fila no repinta**. Ese es, textualmente, el síntoma "el select no detecta el cambio visualmente".

Vale la pena agregar `extraData` ahora, de forma preventiva, aunque no haya bug activo.

## M10 — Empty states incompletos e inconsistentes

**Con empty state ✅ (8 archivos):** [MarketListSection.tsx:122-129](components/market/MarketListSection.tsx#L122-L129) · [chat.tsx:258-265](app/(modals)/chat.tsx#L258-L265) · [ZonePickerDialog.tsx:68-70](components/ui/ZonePickerDialog.tsx#L68-L70) · [OptionPickerDialog.tsx:82-84](components/ui/OptionPickerDialog.tsx#L82-L84) · [matches.tsx:214-226](app/(tabs)/matches.tsx#L214-L226) · [PlayerLeaderboard.tsx:59-60](components/ranking/PlayerLeaderboard.tsx#L59-L60) · [ranking.tsx:258-261](app/(tabs)/ranking.tsx#L258-L261) · [market-applications.tsx](app/market-applications.tsx)

**Sin empty state ❌:**

| Ubicación | Qué ve el usuario cuando está vacío |
|---|---|
| [RankingTable](components/ranking/RankingTable.tsx) vía [ranking.tsx:242](app/(tabs)/ranking.tsx#L242) | Nada. Con filtros restrictivos (zona + formato + categoría) es fácil llegar a cero equipos: **pantalla en blanco sin explicación ni forma de saber que hay que aflojar los filtros.** 🔴 |
| [notifications.tsx:170-176](app/notifications.tsx#L170-L176) | Espacio vacío bajo "0 sin leer". |
| [ProfileBadgesSection](components/profile/ProfileBadgesSection.tsx) / [TeamBadgesSection](components/team-stats/TeamBadgesSection.tsx) | Sección vacía para usuarios nuevos (el caso más común). |
| [CareerTimeline](components/profile/CareerTimeline.tsx) | Sin trayectoria, no comunica nada. |
| [TeamManagePendingRequests](components/team-manage/TeamManagePendingRequests.tsx) | Sin solicitudes. |

**Calidad desigual de los que sí existen:** [matches.tsx](app/(tabs)/matches.tsx#L214-L226) tiene un empty state ejemplar — título, explicación **y llamada a la acción** ("Aceptá un desafío en el Ranking"). [PlayerLeaderboard.tsx:60](components/ranking/PlayerLeaderboard.tsx#L60) resuelve con un escueto "Sin datos registrados.". El primero es el estándar a seguir.

## M11 — Errores silenciados que dejan al usuario sin explicación

Varios `catch` vacíos ocultan fallos reales:

- **[GlobalHeader.tsx:85](components/GlobalHeader.tsx#L85) y [:109](components/GlobalHeader.tsx#L109)** — `catch { }`. Si falla el conteo de chats o desafíos, el badge simplemente no aparece. El usuario nunca se entera de que tiene mensajes.
- **[market.tsx:62](app/(tabs)/market.tsx#L62)** — `.catch(() => {})` en `fetchApplicationCounts`. Comentado como "no crítico", y es defendible.
- **[chat.tsx:112-116](app/(modals)/chat.tsx#L112-L116)** — el `catch` del `init` solo hace `console.error`. Si falla la carga del chat, el usuario queda con un header vacío ("Chat del partido") y una lista sin mensajes, **indistinguible de un chat vacío legítimo**. No hay estado de error. 🔴
- **[ProposalModal.tsx:64](components/matches/ProposalModal.tsx#L64)** — `.catch(() => {})` al cargar zonas. Si falla, `zonesLoaded` pasa a `true` y se muestra "No hay zonas disponibles" — mensaje engañoso: el problema fue de red, no de datos.

## M12 — `market-create`: el picker de zona se resetea y el estado derivado puede desincronizarse

**[app/(modals)/market-create.tsx:76-95](app/(modals)/market-create.tsx#L76-L95)**

```tsx
useEffect(() => {
  if (!zone) { setVenues([]); setSelectedVenue(null); setComplex(''); return; }
  setLoadingVenues(true);
  setSelectedVenue(null);
  setComplex('');
  fetchVenuesByZoneName(zone).then(setVenues)...
}, [zone]);

useEffect(() => { if (selectedVenue) setComplex(selectedVenue.name); }, [selectedVenue]);
```

Dos efectos encadenados escribiendo sobre el mismo estado (`complex`). Además, `fetchVenuesByZoneName` **no se cancela**: si el usuario cambia de zona rápido (A → B), la respuesta de A puede llegar después de la de B y sobreescribir `venues` con complejos de la zona equivocada. Misma familia de race condition que `M5`.

También: `complex` es un `TextInput` libre cuando no hay zona, y estado derivado del venue cuando sí la hay. Dos fuentes de verdad para un mismo campo.

---

# 🔵 BAJO

## B1 — Manejo inconsistente del área segura

**Con `SafeAreaView` (12 archivos):** team-requests, team-manage, team-join, team-create, profile-edit, onboarding, forgot-password, notifications, terms, privacy, settings, market-create.

**Con padding hardcodeado (6 archivos):**
- `pt-14` (56px): [match-detail.tsx:288](app/match-detail.tsx#L288) · [match-checkin.tsx:157](app/match-checkin.tsx#L157) · [chat.tsx:223](app/(modals)/chat.tsx#L223) · [admin/wo-review.tsx:105](app/admin/wo-review.tsx#L105) · [admin/season.tsx:124](app/admin/season.tsx#L124) · [admin/index.tsx:58](app/admin/index.tsx#L58)
- `pt-12` (48px): [GlobalHeader.tsx:133](components/GlobalHeader.tsx#L133) — **presente en las 5 tabs**

`react-native-safe-area-context` ya es dependencia. Los valores fijos son una apuesta sobre el inset superior: quedan cortos en dispositivos con Dynamic Island y sobran en Android sin notch. `useSafeAreaInsets()` resolvería los 6 casos.

## B2 — Escala tipográfica dispersa

**269 usos de tamaños arbitrarios** conviviendo con la escala de Tailwind:

| Clase | Usos |
|---|---|
| `text-[10px]` | 107 |
| `text-[11px]` | 93 |
| `text-[9px]` | 20 |
| `text-[13px]` | 15 |
| `text-[12px]` | 12 |
| resto (`[8px]`, `[14px]`…`[32px]`) | 22 |

`text-[12px]` es idéntico a `text-xs`, y `text-[14px]` a `text-sm` — se usan ambas formas indistintamente. Además, **`text-[8px]` y `text-[9px]` (24 usos)** aparecen en los badges de contador del header ([GlobalHeader.tsx:153](components/GlobalHeader.tsx#L153), [:167](components/GlobalHeader.tsx#L167), [:180](components/GlobalHeader.tsx#L180)) — por debajo del mínimo legible recomendado (11px).

**Dirección:** definir `fontSize` en `theme.extend` (ej. `micro: 10px`, `tiny: 11px`) y migrar.

## B3 — Dos fuentes de verdad para la paleta

La paleta está duplicada en [constants/theme.ts:8-30](constants/theme.ts#L8-L30) (objeto `palette`) y [tailwind.config.js:15-64](tailwind.config.js#L15-L64). Los valores hoy coinciden, pero nada lo garantiza. `theme.ts` solo se consume en `_layout.tsx` y `(tabs)/_layout.tsx` (navegación); el resto usa NativeWind.

**Dirección:** que `tailwind.config.js` importe la paleta de `theme.ts`.

## B4 — 269+ colores hexadecimales inline en vez de tokens

| Hex | Usos | Observación |
|---|---|---|
| `#003914` | 81 | Verde oscuro para texto sobre `brand-primary`. **No está en la paleta** — merece un token (`brand-on-primary`). |
| `#BCCBB9` | 80 | = `neutral-on-surface-variant` |
| `#53E076` | 69 | = `brand-primary` |
| `#869585` | 41 | = `neutral-outline` |
| `#00E65B` | 11 | 🔴 **No existe en la paleta** y no coincide con `brand-primary` (#53E076). Usado en [market-create.tsx:186](app/(modals)/market-create.tsx#L186), [:202](app/(modals)/market-create.tsx#L202) y [MarketListSection.tsx:118-119](components/market/MarketListSection.tsx#L118-L119). Es un verde distinto que convive con el oficial. |
| `#88998D` | 12 | 🔴 Placeholder en market-create. El resto de la app usa `#869585` o `#3A3939`. **Tercer gris de placeholder.** |
| `#FF8A80` / `rgba(255,84,73,…)` | 3 | 🔴 [market.tsx:313-315](app/(tabs)/market.tsx#L313-L315). Rojo fuera de paleta; `danger-error` es `#FFB4AB`. |
| `#8FD5FF` | — | [team-manage.tsx:512](app/team-manage.tsx#L512). `info-secondary` es `#8CCDFF`. Casi igual, pero distinto. |
| `#5E5A58`, `#3F4943`, `#6F6D6C`, `#595959` | 14 | Grises ad-hoc sin token. |

Muchos son inevitables (`AppIcon` recibe `color` como string, no acepta `className`), pero los valores **fuera de paleta** (`#00E65B`, `#88998D`, `#FF8A80`, `#8FD5FF`) son inconsistencias reales: producen tonos ligeramente distintos en pantallas distintas para el mismo rol semántico.

## B5 — Feedback táctil inconsistente

`activeOpacity` toma al menos 6 valores distintos: `0.6`, `0.7`, `0.75`, `0.8`, `0.85`, `0.9`, `1`. En la misma pantalla conviven varios (ej. [market-create.tsx](app/(modals)/market-create.tsx) usa `0.7`, `0.75`, `0.8`, `0.9`).

Además, el háptico es desparejo: `HeroButton` ([:29](components/ui/HeroButton.tsx#L29)) y `PitchSelector` ([:47](components/ui/PitchSelector.tsx#L47)) vibran; el resto de chips, toggles y selects no. `CustomAlert` vibra según el tipo ([:16-29](components/ui/CustomAlert.tsx#L16-L29)) pero `ConfirmDialog` no vibra nunca.

## B6 — `renderStatusBadge` construye clases por `split()` en runtime

**[app/match-detail.tsx:254-283](app/match-detail.tsx#L254-L283)**

```tsx
const colors = { PENDIENTE: 'bg-neutral-outline/20 text-neutral-on-surface-variant', ... };
const cls = colors[status] ?? '...';
<View className={cls.split(' ')[0]}>
  <Text className={cls.split(' ')[1]}>
```

**Funciona** porque las clases completas aparecen literalmente en el archivo, así que el JIT de Tailwind las detecta. Pero es frágil: depende de que cada string tenga exactamente dos clases separadas por un espacio. Agregar una tercera (ej. `border`) rompe silenciosamente el `[1]`. Un `Record<string, {bg: string; text: string}>` sería equivalente y a prueba de errores.

## B7 — Tabs y toggles con `style` inline en vez de `className`

**[MarketTabs.tsx:14](components/market/MarketTabs.tsx#L14) y [:20](components/market/MarketTabs.tsx#L20)** · **[ranking.tsx:187](app/(tabs)/ranking.tsx#L187), [:191](app/(tabs)/ranking.tsx#L191), [:198](app/(tabs)/ranking.tsx#L198), [:202](app/(tabs)/ranking.tsx#L202)**

```tsx
style={activeTab === 'TEAMS_LOOKING' ? { backgroundColor: '#53E076' } : undefined}
style={{ color: activeTab === 'TEAMS_LOOKING' ? '#003914' : '#BCCBB9' }}
```

Ambos archivos implementan el **mismo componente de tabs** con estilos inline, mientras el resto de la app usa `className` condicional (que funciona bien: ver `PositionFilterScroll`, `FilterModal`, `ProposalModal`). Esto contradice la regla del `CLAUDE.md` ("Only NativeWind `className` props") y duplica lógica: las tabs de Ranking son una copia manual de `MarketTabs` en vez de reutilizarlo.

Relacionado — [PitchSelector.tsx:39-51](components/ui/PitchSelector.tsx#L39-L51) tiene comentarios "SOLUCIÓN" documentando que se reemplazó `last:border-b-0` por lógica JS. Correcto (NativeWind no soporta el modificador `last:`), pero sugiere que hubo forcejeo con el motor de estilos y quedaron workarounds heterogéneos.

## B8 — `ZonePickerDialog` reintenta el fetch indefinidamente si no hay zonas

**[components/ui/ZonePickerDialog.tsx:30-33](components/ui/ZonePickerDialog.tsx#L30-L33)**

```tsx
if (visible && zones.length === 0) { void fetchZones(); }
```

La condición de guarda es `zones.length === 0`. Si `fetchActiveZoneNames()` devuelve un array vacío legítimamente (sin zonas activas en la BD), el efecto se re-evalúa cada vez que el modal se abre y **vuelve a pedir**. El fallback del `catch` ([:25](components/ui/ZonePickerDialog.tsx#L25)) mitiga el caso de error pero no el de "respuesta vacía válida". Un flag `hasFetched` sería más preciso — el patrón correcto ya está en [ProposalModal.tsx:57](components/matches/ProposalModal.tsx#L57) con `zonesLoaded`.

## B9 — `console.error` / `console.log` en código de producción

[AuthContext.tsx:60](context/AuthContext.tsx#L60) · [teamStore.ts:86](stores/teamStore.ts#L86) · [chat.tsx:113](app/(modals)/chat.tsx#L113) · [matches.tsx:36](app/(tabs)/matches.tsx#L36) · [market-create.tsx:65](app/(modals)/market-create.tsx#L65)

En varios casos el `console.error` es **el único manejo del error** — no hay feedback al usuario (ver `M11`). Conviene enrutar a un servicio de telemetría antes del release.

---

# Plan de acción sugerido

## Antes de salir a producción

| # | Acción | Esfuerzo |
|---|---|---|
| 1 | **C5** — Corregir `text-error`/`border-error` → `text-danger-error`, `text-outline` → `text-neutral-outline`, y los 14 `font-uiMedium` → `font-ui`. Bug visible con arreglo trivial. | 30 min |
| 2 | **C1** — Decidir dark-only y quitar el toggle de Preferencias (opción **a**). | 1 h |
| 3 | **C2** — Separar inicialización de filtros de la carga de datos en `ranking.tsx`; sacar `myTeams` de las deps. | 2-3 h |
| 4 | **C3** — Subir a 44×44 los steppers de `ScorerMvpPicker` y `ResultModal`, los cierres de modal y los iconos del `GlobalHeader` (vía `hitSlop` donde el diseño no permita crecer). | 3-4 h |
| 5 | **C4** — `KeyboardAvoidingView` en `ProposalModal`, `market-create`, `CancellationModal` y `ConfirmDialog`. | 2-3 h |
| 6 | **M8** — Mover `{AlertComponent}` dentro de `ProposalModal` y `CancellationModal`. | 1 h |
| 7 | **M10** — Empty state en `RankingTable` (el más grave: pantalla en blanco sin salida). | 1 h |

## Sprint siguiente

**M1** (memoizar `AuthContext`) · **M3** (`team-create` zone) · **M4** (doble fetch Market) · **M5** (debounce + race en búsqueda) · **M6** (`HeroButton`) · **M7** (skeletons en las 6 pantallas) · **M9** (`extraData` preventivo) · **M11** (feedback de errores) · **M12** (race de venues)

## Deuda técnica

Todos los 🔵, priorizando **B1** (safe area), **B2** (escala tipográfica) y **B4** (colores fuera de paleta: `#00E65B`, `#88998D`, `#FF8A80`).

## Prevención

Agregar al CI (`.github/workflows/ci.yml`) `eslint-plugin-tailwindcss` con `no-custom-classname` apuntando a `tailwind.config.js`, y activar `react-hooks/exhaustive-deps` como error. Entre los dos habrían detectado **C5**, **M2** y buena parte de **C2** de forma automática.

---

## Lo que está bien resuelto

Vale registrarlo, porque marca el estándar a replicar:

- **Guard síncrono contra doble submit** en `ResultModal` ([:70](components/matches/ResultModal.tsx#L70), [:89](components/matches/ResultModal.tsx#L89)) con `useRef`, correctamente documentado sobre por qué `disabled={loading}` no alcanza.
- **Reset de estado al reabrir modal** en `ResultModal` ([:74-82](components/matches/ResultModal.tsx#L74-L82)) y `ProposalModal` ([:83-94](components/matches/ProposalModal.tsx#L83-L94)).
- **Optimistic update con rollback** en el chat ([chat.tsx:145-169](app/(modals)/chat.tsx#L145-L169)): mensaje temporal, reemplazo por el real, y eliminación si falla.
- **Hidratación de formulario con `reset()`** en `profile-edit` ([:82-84](app/profile-edit.tsx#L82-L84)), con un comentario que explica el bug que previene.
- **Manejo de versión de sesión** en `AuthContext` ([:73](context/AuthContext.tsx#L73), [:98](context/AuthContext.tsx#L98)) con `syncVersionRef` para descartar respuestas obsoletas — exactamente el patrón que le falta a la búsqueda de rivales (`M5`).
- **Skeletons y `RefreshControl`** en Market y Ranking.
- **`tabBarHideOnKeyboard: true`** en [(tabs)/_layout.tsx:36](app/(tabs)/_layout.tsx#L36).
- **`keyboardShouldPersistTaps="handled"`** aplicado consistentemente en los ScrollView de formularios.

La base es sólida. Los hallazgos críticos son puntuales y acotados, no estructurales.
