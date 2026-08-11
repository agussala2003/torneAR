# QA Backlog — Auditoría E2E en dispositivos físicos

> Backlog de correcciones derivado de la corrida completa del playbook
> [`TESTING_E2E_DOS_CELULARES.md`](TESTING_E2E_DOS_CELULARES.md) (módulos 1 a 9)
> sobre dos celulares Android físicos.
>
> **Fecha de la auditoría:** 2026-08-10 · rama `develop` · versión de app `1.0.0`
> **Origen de cada hallazgo:** notas, `[❌]` y comentarios de UX/UI dejados por el
> QA a lo largo del playbook. La columna «Origen» apunta al paso exacto.

**Cómo usar este documento:** cada tarea del [Plan de Ataque](#2-plan-de-ataque)
es un checkbox con el ID del hallazgo. Se marca `- [x]` al mergear el fix.

---

## 1. Hallazgos por Categoría

### A · UI/UX y Modales

| ID | Hallazgo | Origen |
|---|---|---|
| **A1** | **Chat: el input queda «despegado» al bajar el teclado.** Al cerrar el teclado el input queda con muchísimo aire sobre la barra del sistema, distinto de cómo se ve al entrar al chat por primera vez. El offset del `KeyboardAvoidingView` no vuelve a su estado de reposo. | 3.3 `[❌]` |
| **A2** | **Chat: falta padding inferior en reposo.** Con el teclado cerrado el input queda pegado/tapado por la gesture bar; falta un colchón proporcional al inset. A1 y A2 son el **mismo bug con dos síntomas** (inset mal aplicado en reposo vs. al replegar el teclado). | 3.3 |
| **A3** | **Modal de crear publicación (Mercado): el teclado tapa la Descripción.** No se ve lo que se escribe. Falta `KeyboardAvoidingView` + scroll en el sheet, o reordenar el campo. | 3.1 |
| **A4** | **Modal de convocatoria: el botón «Confirmar lista» queda tapado por la barra inferior.** | Módulo 5, nota |
| **A5** | **Selector de equipos del header:** (a) faltan los **escudos** de cada equipo, con placeholder por defecto para los que no tienen; (b) falta **padding inferior** — el segundo equipo queda cortado por la barra del celular. | 4.3, nota |
| **A6** | **Modal de «te invitaron a un partido»: falta aire abajo.** | 4.3, nota |
| **A7** | **Patrón transversal de safe area.** Nota literal del QA: *«tener en cuenta esto para otros modales e interfaces UI»*. Hay que auditar todos los sheets con un patrón común, no parchar de a uno. Los modales de **resultado (7.1)** y **WO (8.1)** ya están correctos y son la referencia a replicar. | 5, 7.1, 8.1 |
| **A8** | **Splash inconsistente.** Aparece ~90% de las veces; falla más **cuando ya hay sesión iniciada**. Condición de carrera entre el hide del splash y la hidratación de la sesión. | 1.1 |
| **A9** | **Loaders de login/registro parpadean.** Se muestran muy poco tiempo y desaparecen; no le comunican al usuario que algo está cargando. Falta duración mínima visible. | 1.1 |
| **A10** | **Modal «cuenta creada» con copy erróneo + auto-navegación.** Dice «revisá tu mail para confirmarlo» cuando la confirmación por email **no está activada** en Supabase, y además navega al onboarding **antes** de que el usuario pueda tocar Aceptar. | 1.1 |
| **A11** | **Envío de propuesta de partido: el modal se cierra y se reabre.** Al enviar, reaparece el modal de detalles y hay que cerrarlo a mano para recién ver «propuesta enviada». Debería cerrarse solo al confirmar el envío. | Módulo 5, nota |
| **A12** | **Nomenclatura del concepto central sin unificar.** El mismo dato aparece como **ELO**, **PR** y **Rating** a lo largo de la app. Elegir un nombre único y más atractivo y aplicarlo en UI, copys y labels. | 4.3, nota |
| **A13** | **Chat offline sin feedback.** El mensaje optimista desaparece «en un parpadeo» y **no informa nada**. Documentado como conocido en el código; el QA pide priorizarlo. | 3.3 |
| **A14** | **Mejora sugerida:** al listar los complejos de una zona al armar la propuesta, mostrar la **distancia** a la que está el usuario de cada uno. | Módulo 5, nota |

### B · Formularios y Validaciones

| ID | Hallazgo | Origen |
|---|---|---|
| **B1** | 🚨 **Fecha de nacimiento futura ACEPTADA.** Se cargó `28/02/2027` y pasó la validación. El schema Zod valida formato y fecha imposible (`31/02/1995`) pero **no** el límite superior. Único fallo funcional del módulo 1. | 1.2 `[Incorrecto]` |
| **B2** | **Los errores inline no se limpian al corregir.** Tras rechazar `31/02/1995`, se escribe `18/12/1997` (válida) y el error inline **sigue visible**; encima se puede avanzar igual. Falta re-validación reactiva por campo. | 1.2 |
| **B3** | **Los botones nunca se deshabilitan.** «Crear cuenta» se puede tocar infinitas veces con contraseña inválida sin ningún feedback; «Siguiente» del onboarding avanza aun con error inline visible. Pedido explícito del QA: **habilitar/deshabilitar el botón según la validez del paso actual**. | 1.1, 1.2 |
| **B4** | **La unicidad de `Usuario` se valida recién al final.** El error «Este usuario ya existe» aparece después de completar los **3 pasos** y procesar. Debería chequearse en el paso 1 (onBlur / debounce). | 1.2 |

### C · Lógica de Estado y Caché (React / Zustand)

| ID | Hallazgo | Origen |
|---|---|---|
| **C1** | **El selector de equipos no se invalida al ser expulsado.** El usuario fue expulsado de uno de sus dos equipos y el modal **seguía mostrándolo**; sólo se actualizó **matando la app por completo**. El `teamStore` no se refresca ante cambios de membresía y no hay fallback si el equipo activo desaparece. | 4.3, nota |
| **C2** | **El partido del invitado no aparece en ninguna vista tras entrar.** El canje funciona y el detalle carga, pero después el partido **no figura ni en la pestaña Partidos ni en Inicio** (próximos partidos / cuenta regresiva), así que el invitado no tiene forma de volver a entrar. Las queries de esas vistas filtran por `team_members` y no contemplan `match_participants.is_guest = true`. **Distinción clave del QA:** *unirse* sigue restringido a `CONFIRMADO`, pero *visualizar* el detalle debe persistir en los estados posteriores. | 6.3, nota |

### D · Reglas de Negocio / Backend

| ID | Hallazgo | Origen |
|---|---|---|
| **D1** | **El código de invitado se muestra antes de tiempo.** El `unique_code` se genera y se ve apenas se **acepta el desafío**, no al confirmar la propuesta. El canje sólo es válido con el partido en **`CONFIRMADO`** (comportamiento correcto). Ajuste: mostrar el código **sólo** en `CONFIRMADO`. | 4.3 + 6.3, notas |
| **D2** | **Geofence de 150 m demasiado estricto.** Falla a veces con GPS honesto. Propuesta del QA: subir `checkin_geofence_radius_m` a **500–1000 m** para el lanzamiento, apostando a la honestidad de los usuarios y **registrando la distancia real en logs** para poder bajarlo con datos más adelante. (El mock-location queda anotado como riesgo conocido, no como bug.) | Módulo 5, nota |
| **D3** | 🚨 **Transición de temporada rota — error 500.** `admin.season.handleConfirmTransition` devuelve `21000: UPDATE requires a WHERE clause`. Es un `UPDATE` sin `WHERE` dentro de la RPC, bloqueado por la guarda de la base. **No se puede iniciar ninguna temporada.** | Post-módulo 7 |
| **D4** | **Evolución de ELO vacía.** La pantalla dice que no hay partidos de ranking jugados. Sospecha del QA: es por no haber temporada iniciada. **Bloqueado por D3**: sólo se puede verificar después de arreglarlo. | Post-módulo 7 |
| **D5** | **`update_url` de iOS es un placeholder** (`https://apps.apple.com/app/tornear/id0000000000`). Hoy inofensivo (mínimo iOS = `1.0.0`), pero letal el día que se suba la mínima: modal imposible de cerrar con un botón que no lleva a ningún lado. | 9.5, confirmado |

### E · Diagnóstico de Notificaciones Push

**El dato clave de la auditoría:** funcionaron las push de **cambio de rol a
SUBCAPITÁN** y de **expulsión del equipo**; fallaron las de **postulación al
mercado** (3.2 `[❌]`) y **desafío de ranking** (4.2 `[❌]`, en segundo plano *y*
en cold start). En todos los casos la notificación **in-app llegó bien** y el
`expo_push_token` **está cargado en la base**. Es decir: **el problema no es FCM,
ni el build, ni el permiso de Android 13+, ni el token.**

La asimetría se explica en el código — **hay dos caminos de push distintos**:

1. **Camino directo desde el cliente.** [`lib/team-manage-data.ts`](lib/team-manage-data.ts)
   llama a `sendPushNotification()` de [`lib/push-notifications.ts`](lib/push-notifications.ts),
   que hace `fetch` **directo a `exp.host`** desde el celular. Rol, expulsión y
   solicitud aceptada usan este camino → **por eso llegaron**.
2. **Camino genérico por trigger.** [`lib/challenge-actions.ts`](lib/challenge-actions.ts)
   y [`lib/market-applications-api.ts`](lib/market-applications-api.ts) sólo hacen
   `insert` en `notifications` y delegan en la cadena
   `trg_dispatch_push` → `pg_net` → edge function
   [`push-dispatch`](supabase/functions/push-dispatch/index.ts)
   (migración `20260711032948`) → **este camino está cortado**.

> **Conclusión: no son dos bugs de notificación, es un solo eslabón roto en la
> cadena del servidor.** Todo lo que dependa del trigger falla igual —
> recordatorio 24 h, disputas, aceptación de desafíos, etc.

**Candidatos a causa raíz, por probabilidad:**

- **`verify_jwt` no desactivado en la edge function.** El docstring dice que se
  despliega con `verify_jwt=false`, pero **no existe el bloque
  `[functions.push-dispatch]` en `supabase/config.toml`**. Si quedó activo, el
  gateway responde **401 antes de ejecutar la función** — y el trigger sólo manda
  `x-push-secret`, sin header `Authorization`.
- **El secreto del vault quedó como placeholder.** La migración crea
  `push_dispatch_secret` con el literal `'<AQUI_VA_EL_SECRETO_PUSH_DISPATCH>'`,
  a reemplazar a mano en el proyecto.
- **`pg_net` no habilitado**, migración no aplicada en el proyecto de producción,
  o URL del vault desactualizada.

**Triage de 3 minutos que decide entre esas causas** (primer paso de la Fase 4):

```sql
-- ¿Llegó a correr la función? (pushed_at NULL = nunca corrió)
select id, type, pushed_at, created_at
  from public.notifications
 where type in ('DESAFIO_RECIBIDO', 'POSTULACION_NUEVA')
 order by created_at desc limit 5;

-- ¿Qué respondió el gateway? (401 / timeout / sin filas)
select id, status_code, error_msg, created
  from net._http_response order by created desc limit 20;
```

---

## 2. Plan de Ataque

Orden pensado para resolver de menor a mayor riesgo de regresión, dejando el
backend —que corre contra la **base de producción compartida** (`develop` y
`main`, Free Tier, sin staging)— para el final.

### 🔵 Fase 1 — UI, SafeAreaInsets y Copywriting

> Bajo riesgo: no toca lógica de dominio ni base de datos.

- [x] **A7** — Definir el patrón único de safe area para sheets/modales, tomando como referencia los que ya están correctos (modal de resultado 7.1 y modal de WO 8.1). *(→ `components/ui/SafeAreaBottomSheet.tsx` + `hooks/useBottomInset.ts` + `hooks/useKeyboardHeight.ts`.)*
- [x] **A1 + A2** — Fix del `KeyboardAvoidingView` + insets del chat, replicado en `app/market-chats/[id].tsx` y `app/(modals)/chat.tsx`. *(Causa raíz: dos mecanismos empujando el mismo espacio en Android edge-to-edge. `hooks/useKeyboardAwareBottomInset.ts` pasa a ser el único dueño del espacio inferior y el KAV queda sólo para iOS. Pendiente de verificar en los dos celulares físicos.)*
- [x] **A5a** — Padding inferior del modal selector de equipos. *(Además: tope de alto, para que la lista scrollee en vez de cortarse.)*
- [x] **A4** — Padding inferior de la barra «Confirmar lista» de la convocatoria. *(No era un modal sino una barra absoluta en `app/match-checkin.tsx` con `pb-8` fijo.)*
- [x] **A6** — Padding inferior del modal de invitación a partido (`GuestJoinModal`).
- [x] **A7** — Barrido del resto de sheets aplicando el patrón: `ResultModal`, `WoModal`, `ProposalModal`, `CancellationModal`, `FilterModal` (mercado) y `RankingFilterModal`.
- [x] **A3** — Teclado tapando la Descripción en el modal de crear publicación del Mercado. *(Misma raíz que A1/A2: en Android edge-to-edge la ventana no se redimensiona, así que el ScrollView no tenía recorrido por el que desplazarse.)*
- [x] **A5b** — Escudos de equipo en el selector, con fallback a iniciales. *(Requirió traer `shield_url` al `teamStore`; `TeamShield` se movió a `components/ui/` por ser compartido entre `matches`, `home` y `ui`.)*
- [x] **A10** — Copy del modal «cuenta creada» + que la navegación al onboarding espere al Aceptar. *(La retención del guard vive en `stores/signupGateStore.ts`.)*
- [x] **A12** — Término unificado: **«Rating»**. Barrido hecho en perfil, mercado, gestión de equipo, ranking, disputas, admin, modales de partido y política de privacidad. Los identificadores internos (`elo_rating`, `prRating`, `eloHistory`) quedan como están a propósito: son el contrato con la base.
- [x] **A9** — Duración mínima visible de los loaders de login/registro. *(→ `hooks/useMinimumVisible.ts`, aplicado también en recuperar contraseña.)*
- [x] **A11** — Cerrar el modal de propuesta al confirmar el envío. *(Causa raíz: el efecto de auto-apertura por parámetro de ruta no era de una sola vez y reabría el sheet en cada refresco.)*
- [x] **A8** — Splash inconsistente con sesión iniciada. *(El intro se contaba desde el montaje, corriendo por debajo del splash nativo; ahora arranca cuando ese splash se va.)*

**✅ Fase 1 completa** — 14/14 tareas. Todo pendiente de validación en los dos
celulares físicos: son fallas visuales y de timing que no cubre ningún test.

### 🟢 Fase 2 — Formularios y Validaciones (Zod + React Hook Form)

- [x] **B1** — Límite superior de fecha en el schema Zod (onboarding + edición de perfil comparten `userProfileSchema`). Cubierto por `lib/schemas/userSchema.test.ts`.
- [x] **B2** — `mode: 'onTouched'` en onboarding, edición de perfil y login.
- [x] **B3** — Botones atados a la validez real. `HeroButton` gana estado visual deshabilitado, que no tenía: `disabled` sólo bloqueaba el press y el botón seguía viéndose verde.
- [x] **B4** — Validación temprana de unicidad de `username` (→ `hooks/useUsernameAvailability.ts`), aplicada en el paso 1 del onboarding y en edición de perfil.

**✅ Fase 2 completa** — 4/4 tareas.

### 🟡 Fase 3 — Estado, Caché y Visibilidad (React / Zustand)

> Acá empieza el riesgo de regresión: va después de tener la UI estable.

- [ ] **C1** — Invalidación del `teamStore` ante cambios de membresía + manejo del caso «el equipo activo ya no existe».
- [ ] **C2** — Incluir `match_participants` (con `is_guest`) en las queries de Partidos e Inicio, respetando la distinción unirse (`CONFIRMADO`) vs. visualizar (todos los estados posteriores).
- [ ] **A13** — Feedback del mensaje fallido en el chat offline (reintentar / marcar como no enviado).

### 🟠 Fase 4 — Backend Supabase

> ⚠️ Cada cambio con su reversión y validado en local (`supabase start`) antes
> del `db push`. Ver `docs/WORKFLOW.md`.

- [ ] **E1** — Correr el triage SQL, confirmar la causa raíz y reparar el eslabón roto de la cadena `notifications` → `pg_net` → `push-dispatch`. **Prioridad más alta de la fase:** desbloquea 3.2 y 4.2 y todas las push que comparten esa cadena.
- [ ] **E2** — Revalidar el deep link de la push en cold start (paso 4.2, quedó sin testear por E1).
- [ ] **D3** — Localizar y acotar el `UPDATE` sin `WHERE` en la RPC de transición de temporada.
- [ ] **D4** — Re-verificar la evolución de ELO con una temporada ya iniciada (bloqueado por D3).
- [ ] **D1** — Restringir la visibilidad del `unique_code` al estado `CONFIRMADO`.
- [ ] **D2** — Subir `checkin_geofence_radius_m` a 500–1000 m + loggear la distancia real medida en cada check-in.
- [ ] **D5** — `update_url` de iOS con el App ID real, o documentarlo como bloqueante del release de iOS.
- [ ] **A14** — Mostrar la distancia a cada complejo al elegir sede (cálculo sobre coordenadas ya presentes en `venues`).

---

## Notas de alcance

- Los módulos **8 (Walkover)** y **9 (Force Update)** se cerraron con «TODO
  CORRECTO». El único ítem accionable que salió de ahí es **D5**.
- En el módulo 3.3 los dos primeros checks del chat quedaron marcados `[✅]`,
  pero el texto de la nota describe fallas reales; se registran como bugs
  (**A1** / **A2**), consistente con el `[❌]` que sí figura tres pasos más abajo
  por el mismo síntoma.
- El **mock location** del paso 5.1 queda registrado como **riesgo conocido** del
  geofence por GPS de cliente, no como bug nuevo.
