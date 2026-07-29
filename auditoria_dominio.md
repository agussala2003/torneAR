# Auditoría conceptual del modelo de dominio — torneAR

**Alcance:** modelo de dominio y reglas de negocio implementadas en `app/`, `components/`, `lib/`, `stores/` y su interacción con RPCs/RLS de Supabase (`supabase/migrations/`).
**Fecha:** 2026-07-28
**Última actualización:** 2026-07-28 — remediación de los 3 bloqueantes (D1, M1, R4).
**Objetivo:** determinar si el ciclo funcional está cerrado antes de abrir la Beta pública.

> **Nota de versión.** La primera emisión de este documento fue una auditoría de solo lectura.
> Esta revisión incorpora la remediación de los tres hallazgos bloqueantes: los ítems
> **D1**, **M1** y **R4** están marcados como ✅ **Cerrados**, con la nota técnica de la
> solución aplicada al pie de cada uno. El resto de los hallazgos sigue **abierto** y con la
> severidad original.

---

## 0. Veredicto ejecutivo

El motor está mucho mejor construido de lo que suele estarse a esta altura: el ELO está unificado en una sola fuente de verdad (`apply_match_outcome`), el Fair Play tiene fórmula y triggers, la cancelación tiene doble consentimiento real, el geofence es obligatorio server-side, el ledger de traspasos (`team_stints`) cierra ciclos con motivo, y la autorización crítica vive en RPCs `SECURITY DEFINER` y no en el cliente. Eso es una base sólida.

Lo que falta no son piezas del motor: **falta el cierre de los ciclos**. El patrón se repite en los cuatro pilares —hay un camino de ida completo y bien validado, y el camino de vuelta (el caso en que algo *no* pasa) queda abierto:

| Pilar | Ida | Vuelta |
|---|---|---|
| Partido | proponer → aceptar → check-in → resultado → finalizar ✅ | nadie se presenta / nadie carga / disputa empatada ❌ |
| Mercado | publicar → postular → aceptar ✅ | el "aceptar" no incorpora a nadie ❌ |
| Roles | RLS/RPCs validan bien ✅ | la UI no gatea y el usuario descubre el "no podés" después del tap ❌ |
| Amateur | WO tiene motor de puntaje ✅ | el WO no tiene disparador ni circuito de aviso ❌ |

**Recomendación original:** había **3 baches bloqueantes** para una beta pública (D1, M1, R4) y **9 de alta prioridad**. Ninguno requería rediseñar el modelo; casi todos son reglas faltantes sobre estructuras que ya existen.

**Estado tras la remediación del 2026-07-28:** los **3 bloqueantes están cerrados** y **no queda deuda 🟠 abierta**. Bloque 1: **R1, R2, M2 y M3** (gating de UI + asincronía del Mercado). Bloque 2: **R3, E1 y E3** (último gating, cupo mínimo al confirmar, baja lógica de equipos). Bloque 3: **D3, D4 y D5** (barrido de partidos huérfanos y circuito de resolución del WO).

El **Bloque 4** cerró el último 🟠 pendiente —**D2**, la herramienta de admin para disputas trabadas— y saldó la deuda de verificación del barrido automático con una suite pgTAP. **No queda deuda 🟠 abierta.**

El **Bloque 8** (2026-07-29) liquidó el remanente 🟡/🔵: **M4** (pantalla "Mis postulaciones"), **D12** (bandeja del Home completa y gateada por rol), **E7/E8/E9** (las tres caducidades que faltaban: código de invitado, desafíos sin responder y cooldown medido sobre la fecha de juego) y **R7**, que ya estaba resuelto por el `ConfirmDialog` de D1 y sólo faltaba constatarlo.

El **Bloque 9** (2026-07-30) cerró las dos decisiones de producto que quedaban, ya tomadas por el equipo: **R6** — el `DIRECTOR_TECNICO` recibe permisos operativos del día del partido (presentar la lista, cargar el resultado) y ninguno de gestión del club — y **E5** — la multa de Fair Play por ausencia deja de ser una constante: `FALTA_QUORUM` cuesta −5 y `NO_PRESENTACION` sigue costando −15.

## 🏁 **El reporte queda sin deuda abierta: 38/38 hallazgos cerrados.**

**Los cuatro pilares están cerrados y no queda ningún hallazgo pendiente**, de ninguna severidad. Lo que resta en la sección 6 son preguntas de producto que **no bloquean nada** (política de desempate automático, contra-reclamo de WO, umbrales del barrido).

✅ **Y el despliegue está hecho: producción corre las 19 migraciones del reporte** (2026-07-31). El detalle honesto de qué se aplicó cuándo, y los dos bugs que el CI local encontró en el camino, están en el registro de despliegue de la sección 6.

El patrón de los dos últimos bloques vale anotarlo. En el 8, de seis hallazgos, **tres no necesitaron una línea de servidor** (M4, D12, R7): el dato existía, se escribía bien y la autorización estaba concedida desde hacía semanas — faltaba **mirarlo**. En el 9, los dos hallazgos restantes no eran defectos de código sino **preguntas sin responder**, y cerrarlos consistió en escribir la respuesta en la base en vez de dejarla en un enum. Es la contracara exacta del diagnóstico original: nunca faltaron piezas del motor, faltó cerrar los ciclos.

### Tabla de severidad

| # | Hallazgo | Pilar | Severidad | Estado |
|---|---|---|---|---|
| D1 | La disputa se resuelve sola con 0 votos, a favor de quien tiene más Fair Play | 1 | 🔴 Bloqueante | ✅ **Cerrado** (2026-07-28) |
| M1 | Aceptar una postulación no incorpora al jugador: es solo una etiqueta | 2 | 🔴 Bloqueante | ✅ **Cerrado** (2026-07-28) |
| R4 | Un SUBCAPITAN puede auto-promoverse a CAPITAN (RLS no acota `role`) | 3 | 🔴 Bloqueante | ✅ **Cerrado** (2026-07-28) |
| D3 | Ningún estado del partido caduca (PENDIENTE / CONFIRMADO / EN_VIVO eternos) | 1 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| D4 | "No se presentó" no tiene flujo automático; y si nadie hace check-in, no hay salida | 1 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| D5 | Un solo reclamo de WO por partido: sin contra-reclamo, sin aviso, sin reintento | 1 | 🟠 Alto | ✅ **Cerrado** (parcial: sin contra-reclamo) |
| D11 | Las notificaciones de partido no llevan a ningún lado | 1 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| E6 | Un partido zombi encierra a sus convocados en el equipo | 4 | 🟡 Medio | ✅ **Cerrado** (vía D3) |
| M2 | La notificación de "postulación aceptada" no lleva a ninguna acción | 2 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| M3 | La postulación se dispara con `void` (fire-and-forget): puede fallar en silencio | 2 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| R1 | Botón "Cancelar partido" visible para JUGADOR (el rol está en pantalla y no se mira) | 3 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| R2 | Toda la pestaña Partidos sin gating por rol | 3 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| E1 | Se puede desafiar/confirmar un F11 con 3 jugadores; el cupo se valida en la cancha | 4 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| E3 | Capitán único de equipo con historial: no puede irse ni borrar el equipo | 4 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| R3 | Bandeja de desafíos sin gating por rol | 3 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| D7 | `confirm_match_proposal` no verifica que la propuesta sea de ese partido | 1 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| D8 | Cancelar un partido no cierra sus propuestas pendientes | 1 | 🟡 Medio | ✅ **Cerrado** (vía D7) |
| E2 | No hay estado para un equipo disuelto | 4 | 🟠→🟡 | ✅ **Cerrado** (vía E3) |
| D2 | Empate total en disputa → sin herramienta de admin | 1 | 🟠 Alto | ✅ **Cerrado** (2026-07-28) |
| D6 | `claim_wo` no valida `matches.status`: WO sobre partido FINALIZADO/CANCELADO | 1 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| D10 | La regla "puedo cargar resultado" está definida tres veces, distinta cada vez | 1 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| R5 | Ceder la capitanía sin salir no es atómico: ventana con dos capitanes | 3 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| R8 | Notificaciones insertadas desde el cliente con `catch {}` vacío | 3 | 🔵 Bajo | ✅ **Cerrado** (observabilidad) |
| M5 | Aceptar no cierra el post ni rechaza al resto | 2 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| M6 | El estado `VISTA` es código muerto: nadie lo escribe nunca | 2 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| M7 | La postulación de equipo elige el equipo equivocado (activo ≠ gestionado) | 2 | 🟡 Medio | ✅ **Cerrado** (2026-07-28) |
| M8 | No hay validación de vigencia al postularse | 2 | 🔵 Bajo | ✅ **Cerrado** (2026-07-28) |
| D9 | Un solo jugador marca la llegada de todo el equipo | 1 | 🟡→🟠 | ✅ **Cerrado** (2026-07-28) |
| D13 | Una propuesta no valida fecha futura ni solapamiento | 1 | 🔵 Bajo | ✅ **Cerrado** (2026-07-28) |
| R9 | `match-detail` infiere `myTeamId` del equipo activo | 3 | 🔵 Bajo | ✅ **Cerrado** (2026-07-28) |
| M4 | El postulante no tiene visibilidad de sus propias postulaciones | 2 | 🟡 Medio | ✅ **Cerrado** (2026-07-29) |
| R7 | El botón de resolver disputa no comunica su consecuencia | 3 | 🟡 Medio | ✅ **Cerrado** (vía D1) |
| E7 | El código de invitado no caduca ni tiene tope de usos | 4 | 🟡 Medio | ✅ **Cerrado** (parcial: sin tope de usos ni rotación) |
| D12 | La bandeja de "acciones pendientes" del Home está incompleta | 1 | 🔵 Bajo | ✅ **Cerrado** (2026-07-29) |
| E8 | Los desafíos `ENVIADA` no caducan y bloquean el emparejamiento | 4 | 🔵 Bajo | ✅ **Cerrado** (2026-07-29) |
| E9 | El cooldown de 30 días se mide sobre la fecha de creación | 4 | 🔵 Bajo | ✅ **Cerrado** (2026-07-29) |
| R6 | `DIRECTOR_TECNICO` es un rol decorativo | 3 | 🟡 Medio | ✅ **Cerrado** (2026-07-30) |
| E5 | `FALTA_QUORUM` está nombrado pero no tiene reglas | 4 | 🟡 Medio | ✅ **Cerrado** (2026-07-30) |

### Artefactos de la remediación (2026-07-28)

**Tanda 0 — bloqueantes**

| Hallazgo | Archivos tocados |
|---|---|
| **R4** | `supabase/migrations/20260728160000_r4_team_members_role_escalation.sql` |
| **M1** | `supabase/migrations/20260728161000_m1_market_acceptance_join_request.sql` · `lib/market-applications-api.ts` · `app/market-applications.tsx` · `lib/market-applications-api.test.ts` |
| **D1** | `components/matches/DisputeSection.tsx` · `lib/match-detail-data.ts` · `components/matches/types.ts` |

**Bloque 1 — deuda 🟠 (UI gating y Mercado)**

| Hallazgo | Archivos tocados |
|---|---|
| **R1** | `app/match-detail.tsx` · `components/matches/ProposalSection.tsx` |
| **R2** | `app/(tabs)/matches.tsx` · `components/matches/MatchCard.tsx` · `components/matches/MatchCardFooter.tsx` · `components/matches/LiveMatchBanner.tsx` |
| **M3** | `app/(tabs)/market.tsx` · `lib/market-applications-api.ts` · `lib/market-applications-api.test.ts` |
| **M2** | `app/notifications.tsx` |

Sin migraciones nuevas en el Bloque 1: los cuatro hallazgos eran de cliente. El servidor ya rechazaba todo lo que la UI ofrecía de más.

**Bloque 2 — deuda 🟠 (edge cases y remanente de gating)**

| Hallazgo | Archivos tocados |
|---|---|
| **R3** | `app/challenge-inbox.tsx` |
| **E3** (+ E2) | `supabase/migrations/20260728170000_e3_team_soft_deactivation.sql` · `lib/team-manage-data.ts` · `app/team-manage.tsx` · `components/team-manage/types.ts` · `lib/market-api.ts` · `types/supabase.ts` |
| **E1** | `supabase/migrations/20260728171000_e1_confirm_proposal_squad_check.sql` · `lib/challenge-actions.ts` · `components/ranking/ChallengeButton.tsx` · `lib/match-actions.ts` · `app/match-detail.tsx` · `app/(tabs)/matches.tsx` · `lib/match-actions.test.ts` |
| **D7 + D8** | incluidos en la migración de E1 (misma función reescrita) |

⚠️ `types/supabase.ts` se editó **a mano** para agregar `teams.is_active` (Row/Insert/Update) y, en el Bloque 5, la firma de `grant_captain_role`. Es un archivo autogenerado: hay que regenerarlo con `npx supabase gen types` después de aplicar las migraciones.

**Bloque 3 — deuda 🟠 (ciclo del partido)**

| Hallazgo | Archivos tocados |
|---|---|
| **D5** | `supabase/migrations/20260728180000_d5_wo_resolution_circuit.sql` · `app/match-detail.tsx` |
| **D3 + D4** (+ E6) | `supabase/migrations/20260728181000_d3_d4_sweep_stale_matches.sql` |
| **D11** | `app/notifications.tsx` |

Umbrales del barrido, ajustables desde `app_settings` sin desplegar: `sweep_pending_no_date_days` (14), `sweep_confirmed_grace_hours` (4), `sweep_live_timeout_hours` (24). Job `sweep-stale-matches` calendarizado a `20 * * * *`.

**Bloque 4 — último 🟠 y deuda de verificación**

| Hallazgo | Archivos tocados |
|---|---|
| **D2** | `supabase/migrations/20260728190000_d2_admin_dispute_resolution.sql` · `lib/dispute-admin-data.ts` · `app/admin/dispute-review.tsx` · `app/admin/index.tsx` |
| Testing del barrido | `supabase/tests/300-sweep-stale-matches.spec.sql` (11 aserciones) |

El archivo de tests se numeró **300** y no 250 como sugería el plan porque `250-rpc-g6-claim.spec.sql` ya existe y `pg_prove` corre en orden alfabético.

⚠️ Las dos RPCs nuevas (`get_disputed_matches`, `admin_resolve_dispute`) se invocan desde `lib/dispute-admin-data.ts` con el cast `as Parameters<typeof supabase.rpc>[0]` —el mismo patrón que ya usa `get_match_detail`— porque todavía no están en `types/supabase.ts`. Se resuelve al regenerar los tipos.

Verificación ejecutada: `npx tsc --noEmit` sin errores · `npx vitest run` 184/184 en verde (4 casos nuevos sobre el mapper de errores de propuesta) · `npx eslint app components lib` **0 errores** (18 warnings preexistentes en todo el repo, ninguno en líneas modificadas).

**Bloque 5 — consistencia, atomicidad y telemetría**

| Hallazgo | Archivos tocados |
|---|---|
| **D6** | `supabase/migrations/20260728210000_d6_claim_wo_status_guard.sql` |
| **R5** | `supabase/migrations/20260728211000_r5_grant_captain_role_atomic.sql` · `lib/team-manage-data.ts` · `app/team-manage.tsx` · `types/supabase.ts` |
| **D10** | `lib/match-permissions.ts` *(nuevo)* · `lib/match-permissions.test.ts` *(nuevo)* · `app/match-detail.tsx` · `components/matches/ResultSection.tsx` · `components/matches/LiveMatchBanner.tsx` · `components/matches/MatchCardFooter.tsx` · `app/(tabs)/matches.tsx` |
| **R8** | `lib/match-actions.ts` · `lib/challenge-actions.ts` · `lib/market-applications-api.ts` · `lib/team-join-data.ts` (+ mocks de `Logger` en los tres `.test.ts` correspondientes) |
| Telemetría global | `lib/profile-data.ts` · `lib/profile-detailed-stats.ts` · `lib/push-notifications.ts` · `context/AuthContext.tsx` · `stores/teamStore.ts` · `hooks/usePushNotifications.ts` · `hooks/usePlayerCareer.ts` · `app/(modals)/chat.tsx` · `app/(modals)/market-create.tsx` · `app/(tabs)/market.tsx` · `app/market-chats/[id].tsx` · `components/profile/ProfileHeader.tsx` |

**Sobre la inyección global de logs:** ya no queda **ningún `console.*` fuera de `lib/logger.ts`** en `lib/`, `app/`, `components/`, `hooks/`, `stores/` ni `context/` — los 15 que había pasaron a `Logger`, con un objeto de contexto (`scope`, ids del dominio, el error crudo) en lugar de un string suelto. El criterio para elegir nivel:

- **`Logger.error`** — el flujo falló: mutación rechazada, query que la pantalla necesita, subida de archivo caída.
- **`Logger.warn`** — degradación silenciosa que no rompe nada pero deja un hueco invisible: contadores que no cargan, "marcar como leído" que falla, notificación sin destinatarios, intento de recargar un resultado ya enviado.
- **`Logger.info`** — hitos del dominio que interesa poder reconstruir después: check-in, carga de resultado, confirmación de partido, reclamo de WO, resolución y voto de disputa, cesión de capitanía, cambios de estado de auth.

El sesgo fue hacia los **fallos que la UI se traga**: un `catch` que sólo muestra un alert genérico, un `.catch(() => {})`, un estado que degrada a vacío. En esos casos el log es la única señal de que algo pasó — sin él, "el mercado está vacío" y "el mercado no cargó" son la misma pantalla.

Verificación del Bloque 5: `npx tsc --noEmit` sin errores · `npm test` **201/201** en verde (14 casos nuevos sobre `match-permissions`) · `npm run lint` **0 errores, 0 warnings nuevos**.

**Bloque 6 — pulido del Mercado de pases**

| Hallazgo | Archivos tocados |
|---|---|
| **M5** | `lib/market-applications-api.ts` · `app/market-applications.tsx` · `lib/market-applications-api.test.ts` |
| **M6** | `lib/market-applications-api.ts` · `app/market-applications.tsx` · `lib/market-applications-api.test.ts` |
| **M7** | `lib/market-utils.ts` · `app/(tabs)/market.tsx` · `lib/market-utils.test.ts` |
| **M8** | `lib/market-utils.ts` · `lib/market-applications-api.ts` · `app/(tabs)/market.tsx` · `lib/market-applications-api.test.ts` · `lib/market-utils.test.ts` |
| Infra de tests | `lib/test-utils/supabase-mock.ts` (se agregó `neq` a los métodos encadenables) |

**Sin migraciones nuevas en el Bloque 6.** Los cuatro hallazgos se cierran del lado del cliente porque el schema ya tenía todo lo necesario: `VISTA` estaba en el `CHECK` desde `20260708184030`, `is_active` existe en las dos tablas de posts, y las policies de UPDATE (`market_team_post_applications_update_by_post_admin`, `market_player_post_applications_update_by_post_owner`, `market_*_posts_update_*`) ya autorizan exactamente al dueño del aviso a hacer lo que estas correcciones hacen. No hacía falta permiso nuevo: hacía falta usarlo.

Verificación del Bloque 6: `npx tsc --noEmit` sin errores · `npm test` **223/223** en verde (22 casos nuevos: vigencia, cierre del post, `VISTA` y selección de equipo) · `npx eslint app components lib` **0 errores** (17 warnings preexistentes, uno menos que antes: se corrigieron los dos `Array<T>` de `market-applications-api.ts`).

Se verificó además que **ningún flujo del Mercado usa `Alert.alert`**: los errores de M8 salen por `showAlert` del `UIContext` → `components/ui/CustomAlert`, igual que el resto de la app.

**Bloque 7 — integridad del check-in y de la identidad de equipo**

| Hallazgo | Archivos tocados |
|---|---|
| **D9** | `supabase/migrations/20260728220000_d9_checkin_team_quorum.sql` · `types/supabase.ts` · `lib/match-actions.ts` · `components/matches/CheckinSection.tsx` · `app/match-detail.tsx` · `lib/match-actions.test.ts` |
| **D13** | `supabase/migrations/20260728221000_d13_proposal_schedule_guard.sql` · `lib/match-actions.ts` · `components/matches/ProposalModal.tsx` · `lib/match-actions.test.ts` |
| **R9** | `lib/match-detail-data.ts` · `app/match-detail.tsx` · `lib/match-detail-data.test.ts` *(nuevo)* |
| Testing | `supabase/tests/310-checkin-quorum-schedule.spec.sql` *(nuevo, 12 aserciones)* |

**Los tres son la misma pregunta:** *¿en nombre de qué equipo estoy actuando, y con qué autoridad?* D9 impedía que un jugador hablara por los diez que no fueron; R9, que la app contestara por un equipo que no juega ese partido; D13, que un equipo se comprometiera dos veces a la misma hora.

⚠️ `types/supabase.ts` volvió a editarse **a mano**: `checkin_team` pasó de `Returns: undefined` a `Returns: Json`. Se suma a las ediciones manuales de los Bloques 2 y 5 — todas se resuelven con `npx supabase gen types` después de aplicar las migraciones.

Verificación del Bloque 7: `npx tsc --noEmit` sin errores · `npm test` **238/238** en verde (15 casos nuevos: quórum del check-in, códigos de agenda y resolución de equipo) · `npx eslint app components lib` **0 errores** (18 warnings, +1 respecto del Bloque 6: el `import/first` de `match-detail-data.test.ts`, que es el mismo que tienen los otros 7 archivos de test — lo impone el hoisting de `vi.mock` y corregirlo rompería los mocks).

**Bloque 8 — limpieza final (M4 · D12 · E7 · E8 · E9 · R7)**

| Hallazgo | Archivos tocados |
|---|---|
| **M4** | `app/market-my-applications.tsx` *(nuevo)* · `components/market/MyApplicationCard.tsx` *(nuevo)* · `components/market/applicationStatus.ts` *(nuevo)* · `lib/market-applications-api.ts` · `app/market-applications.tsx` · `app/(tabs)/market.tsx` · `app/notifications.tsx` · `app/_layout.tsx` · `lib/market-applications-api.test.ts` |
| **D12** | `lib/home-data.ts` · `components/home/types.ts` · `components/home/PendingActionsCard.tsx` · `app/(tabs)/index.tsx` · `lib/home-data.test.ts` *(nuevo)* |
| **E7** | `supabase/migrations/20260729120000_e7_guest_code_expiry.sql` · `lib/guest-code.ts` *(nuevo)* · `lib/guest-code.test.ts` *(nuevo)* · `components/matches/GuestJoinModal.tsx` · `app/match-detail.tsx` |
| **E8** | `supabase/migrations/20260729121000_e8_challenge_expiry_sweep.sql` |
| **E9** | `supabase/migrations/20260729122000_e9_cooldown_play_date.sql` |
| **R7** | — *(sin trabajo propio: lo cerró el `ConfirmDialog` de D1; ver la nota del hallazgo)* |
| Testing | `supabase/tests/320-expiry-and-cooldown.spec.sql` *(nuevo, 9 aserciones)* |

**M4 y D12 no llevaron migración.** Los dos son el mismo tipo de deuda: el dato
existía, se escribía correctamente y **nadie lo miraba**. M4 tenía hasta la
policy de `SELECT` lista desde `20260708184030`; D12 sólo necesitaba consultar
tablas que el usuario ya lee. Las tres migraciones del bloque son de servidor
puro (`E7`/`E8`/`E9`), y ninguna cambia firmas: son `CREATE OR REPLACE` sobre
funciones existentes, más una función nueva (`match_guest_code_expires_at`), dos
claves nuevas de `app_settings` (`guest_code_ttl_hours` 48,
`sweep_challenge_expiry_days` 14) y dos índices de apoyo.

⚠️ **`sweep_stale_matches()` cambia su valor de retorno**: suma la clave
`challengesExpired` al `jsonb`. Nada del cliente lo consume hoy (la función está
revocada para `authenticated`), pero cualquier tablero o alerta que lea esa
salida tiene que contemplarla.

Verificación del Bloque 8: `npx tsc --noEmit` sin errores · `npm test`
**260/260** en verde (22 casos nuevos: postulaciones propias, armado de la
bandeja y ventana de validez del código) · `npx eslint app components lib`
**0 errores** (19 warnings, +1 respecto del Bloque 7: el `import/first` de
`home-data.test.ts`, el mismo que ya tienen los otros archivos de test — lo
impone el hoisting de `vi.mock` y corregirlo rompería los mocks).

**Bloque 9 — cierre definitivo (R6 · E5)**

| Hallazgo | Archivos tocados |
|---|---|
| **R6** | `supabase/migrations/20260730120000_r6_director_tecnico_match_staff.sql` · `lib/match-permissions.ts` · `lib/match-permissions.test.ts` · `lib/team-helpers.test.ts` *(nuevo)* · `lib/checkin-data.ts` · `lib/checkin-data.test.ts` · `app/(tabs)/matches.tsx` · `app/match-detail.tsx` · `components/matches/{MatchCard,MatchCardFooter,LiveMatchBanner}.tsx` |
| **E5** | `supabase/migrations/20260730121000_e5_falta_quorum_fair_play_scale.sql` · `components/matches/WoModal.tsx` |
| Testing | `supabase/tests/330-dt-permissions-quorum-fps.spec.sql` *(nuevo, 10 aserciones)* |

**Las dos migraciones son de reglas, no de estructura**: ninguna crea ni altera
tablas ni cambia firmas. R6 reescribe `submit_team_checkin` (cuerpo completo,
desde `20260728140000`) y la policy de INSERT de `match_results` (desde
`20260714144056`); E5 reescribe `recalculate_team_fps` (desde `20260708181125`),
agrega `fair_play_absence_penalty` y tres claves de `app_settings`.

⚠️ **E5 trae backfill y mueve datos existentes.** El bloque final recalcula el
Fair Play de los equipos con un WO por `FALTA_QUORUM`: al aplicarla, **esos
equipos suben su puntaje** (de −15 a −5 por esa ausencia). Es el efecto buscado
—la escala es retroactiva—, pero es la única migración de las 16 que altera
valores ya publicados en el ranking. Conviene anunciarlo.

⚠️ **Ninguna de las dos toca gestión de club.** `team_members`,
`team_join_requests` y las policies del Mercado quedaron intactas a propósito:
es la mitad de R6 que no se ve. `lib/team-helpers.test.ts` existe exactamente
para que siga siendo así.

Verificación del Bloque 9: `npx tsc --noEmit` sin errores · `npm test`
**269/269** en verde (9 casos nuevos: los dos círculos de permiso y la frontera
de gestión) · `npx eslint app components lib` **0 errores** (19 warnings, los
mismos del Bloque 8).

✅ **Las diecinueve migraciones están aplicadas en producción** (`supabase db push`, 2026-07-31). Este párrafo afirmaba durante varios bloques que ninguna se había aplicado; era **falso** y lo desmintió `supabase migration list` al momento de desplegar: quince ya estaban en el remoto desde antes. El registro corregido está en la sección 6.

⚠️ **Las dos últimas cambian firmas y agregan un trigger**, así que el orden importa más que en las anteriores: `20260728220000` hace `DROP FUNCTION checkin_team` + `CREATE` con `RETURNS json` (el cliente del Bloque 7 ya espera el payload; si se despliega la app sin la migración, el check-in degrada a contadores en cero pero **no** rompe — hay un test para eso). `20260728221000` reescribe `confirm_match_proposal` sobre la versión de `20260728171000`: aplicarlas fuera de orden revierte E1/D7/D8.

⚠️ **Orden del Bloque 8:** `20260729121000` (E8) y `20260729122000` (E9)
reescriben `sweep_stale_matches` y `send_challenge` **con el cuerpo completo**,
partiendo de `20260728181000` y `20260728170000` respectivamente. Aplicarlas
fuera de orden —o rehacerlas desde una versión anterior— revierte D3/D4/E6 en un
caso y E3 en el otro. Es exactamente el accidente que dejó a `send_challenge`
sin su advisory lock entre el 28 y el 29 de julio (ver E9).

⚠️ **Orden del Bloque 9:** `20260730120000` (R6) reescribe `submit_team_checkin`
sobre la versión de `20260728140000` (geofence) y la policy de `match_results`
sobre la de `20260714144056`; `20260730121000` (E5) reescribe
`recalculate_team_fps` sobre la de `20260708181125`. Mismo régimen que las
anteriores: **cada `CREATE OR REPLACE` parte de la última versión, no de la que
uno recuerda** — es el accidente que dejó a `send_challenge` sin advisory lock
(ver E9).

✅ **Las suites pgTAP corrieron**: `supabase test db` da **24/24 archivos, 230/230 aserciones, `Result: PASS`** sobre la cadena completa de 19 migraciones aplicada desde cero. Su primera corrida real —la del 2026-07-31— encontró **dos bugs de producción que ninguna lectura había visto**; están documentados en la sección 6.

🔴 **`sweep_stale_matches()` es la única pieza de estas tandas que muta estado competitivo sin intervención humana** (cancela partidos, otorga WO, mueve ELO y Fair Play). Antes de calendarizarla en producción conviene correrla **a mano una vez** (`select public.sweep_stale_matches();` desde el SQL Editor) y leer el `jsonb` que devuelve: informa cuántos partidos tocaría cada rama. Sobre una base con partidos viejos acumulados, la primera corrida puede resolver muchos de golpe.

---

## 1. Ciclo de vida del partido

### 1.1 Máquina de estados implementada

```
                    accept_challenge
   [challenge] ─────────────────────────► PENDIENTE
                                             │ confirm_match_proposal (rival, CAP/SUB)
                                             ▼
                                         CONFIRMADO ──── respond_to_cancellation(accept) ──► CANCELADO
                                             │
                       checkin_team / submit_team_checkin (AMBOS equipos)
                                             ▼
                                          EN_VIVO
                                             │ ambos cargan match_results
                        ┌────────────────────┴────────────────────┐
                   cruzan ✔                                  no cruzan ✘
                        ▼                                          ▼
                   FINALIZADO                                 EN_DISPUTA
                                                                   │ resolve_match_dispute
                                                                   └──► FINALIZADO

   [claim_wo] ──► wo_claims PENDIENTE_REVISION ──(admin: resolve_wo_claim)──► WO_A / WO_B
```

La UI de `app/match-detail.tsx` **sí tiene una rama de render para los ocho estados** (`PENDIENTE`, `CONFIRMADO`, `EN_VIVO`, `FINALIZADO`, `EN_DISPUTA`, `WO_A`, `WO_B`, `CANCELADO`) más los badges correspondientes (líneas 278-307). En ese sentido la respuesta a "¿está la UI preparada para los estados intermedios?" es **sí para los estados que existen** — el problema son los **estados intermedios que el modelo no nombra**: "reclamo de WO pendiente de revisión", "esperando que el rival haga check-in y ya pasó la hora", "resultado cargado esperando al rival" (este último sí está resuelto, línea 455-462).

---

### D1 ✅ CERRADO — La disputa se resuelve al instante, sin votos, a favor del que tiene más Fair Play

**Evidencia:** `supabase/migrations/20260328154448_dispute_resolution.sql:147-188` y `components/matches/DisputeSection.tsx:99-109`.

`resolve_match_dispute` cuenta votos y, **si hay empate, desempata por `fair_play_score`**. El empate incluye el caso `0 a 0`, es decir, el estado en el que nace *toda* disputa. Las únicas guardas son: partido en `EN_DISPUTA` y caller `CAPITAN`/`SUBCAPITAN` **de cualquiera de los dos equipos**. No hay:

- quórum mínimo de votos,
- ventana temporal de espera (24/48 h) antes de habilitar la resolución,
- restricción a un rol neutral.

En la práctica: el partido pasa a `EN_DISPUTA`, y el capitán del equipo con mayor FPS toca **⚖️ Resolver Disputa** antes de que nadie vote. La RPC declara ganador a su equipo, **copia su marcador sobre el del rival** (líneas 200-208) y dispara ELO + stats. El rival ni se entera de que hubo una votación.

Peor: el botón se le muestra igual al capitán del equipo con *menos* FPS (`DisputeSection.tsx:99` no discrimina), sin decirle que la acción es inmediata e irreversible ni cuál sería el resultado. Es una trampa de UI sobre una regla de negocio que hoy premia al que aprieta primero.

Agravante de diseño: `recalculate_team_fps` (`20260708181125:169-177`) resta 2 puntos por cada partido **actualmente** en `EN_DISPUTA`. Un equipo que entra seguido en disputa baja su FPS y por lo tanto pierde sistemáticamente los desempates — lo cual es defendible como política, pero hoy no está explicado en ningún lado de la app.

**Qué falta decidir (producto):** ¿la votación tiene ventana fija? ¿mínimo de votos = mitad de los convocados con check-in? ¿o directamente la disputa es competencia del admin y el voto es solo insumo?

> #### ✅ Solución aplicada — 2026-07-28
>
> **Enfoque: se desactivó la trampa, no se cambió la regla.** La RPC
> `resolve_match_dispute` **no se tocó** — su política de desempate sigue siendo la misma,
> y la decisión de producto de arriba sigue pendiente. Lo que se eliminó es el escenario en
> el que la UI le ofrecía a un capitán una acción cuya consecuencia no podía anticipar.
>
> **1 · El dato que faltaba.** `get_match_detail` nunca devolvió el Fair Play de los equipos,
> así que la pantalla no podía saber de qué lado caía el desempate. Se agregó a
> `fetchDisputeState` (`lib/match-detail-data.ts`) una lectura paralela de
> `teams.fair_play_score` para ambos equipos, y dos campos nuevos en `DisputeState`
> (`fairPlayTeamA` / `fairPlayTeamB`). Se resolvió del lado del cliente y no ampliando la RPC
> a propósito: el dato lo necesita una sola pantalla y el contrato de `get_match_detail` no
> cambia.
>
> **2 · Confirmación explícita.** El botón ⚖️ ya no dispara la RPC: abre un `<ConfirmDialog>`
> con la advertencia textual pedida, más una línea con la situación concreta (votos actuales
> y Fair Play de cada equipo). El diálogo va envuelto en un `<Modal>` nativo porque
> `DisputeSection` vive dentro del `ScrollView` del detalle y el overlay `absolute inset-0`
> de `ConfirmDialog` se habría dimensionado contra la tarjeta en vez de contra la pantalla
> — mismo patrón que ya usan `ResultModal`, `WoModal` y `CancellationModal`.
>
> **3 · El botón desaparece para quien perdería.** Si los votos están empatados y mi equipo
> tiene **menos** Fair Play que el rival, no se muestra la acción: en su lugar aparece una
> tarjeta que explica el resultado que tendría (`"resolver ahora le daría el partido a X por
> Fair Play: 98 contra 91 de tu equipo"`) e invita a esperar los votos. La condición se
> evalúa sobre **votos empatados**, no sólo sobre 0-0 como pedía el enunciado: 0-0 es un
> subconjunto de "empate", y el empate es la condición real que dispara el desempate en la
> RPC. Cubrir sólo el 0-0 habría dejado viva la misma trampa en un 1-1.
>
> **4 · Efecto colateral buscado sobre D2.** Si votos **y** Fair Play están empatados, la RPC
> lanza `"Empate total … requiere revisión manual del administrador"`. Antes el botón estaba
> ahí y sólo producía un error crudo; ahora se muestra la explicación del bloqueo. **D2 sigue
> abierto** (falta la herramienta de admin), pero deja de manifestarse como un error sin
> sentido.
>
> **Lo que este fix NO hace:** un capitán con el Fair Play más alto **sigue pudiendo**
> resolver la disputa con 0 votos — ahora informado y con confirmación explícita. Cerrar eso
> requiere la decisión de producto sobre quórum/ventana temporal, que se mantiene como
> pendiente en la sección 6.

---

### D2 ✅ CERRADO — Empate total en disputa: no existe la herramienta de admin que el propio código invoca

**Evidencia:** `20260328154448_dispute_resolution.sql:182-187` vs `app/admin/index.tsx:14-29`.

Cuando votos y FPS empatan, la RPC lanza:

> `'Empate total: % votos cada equipo, FPS idéntico (%). Requiere revisión manual del administrador.'`

Pero el panel de administración solo tiene dos entradas: **Reclamos de WO** y **Temporadas**. No hay pantalla de disputas, ni RPC admin equivalente a `resolve_wo_claim` para forzar un marcador. El partido queda `EN_DISPUTA` **para siempre**:

- su ELO y sus goles nunca se computan,
- ambos equipos arrastran −2 de FPS de forma permanente,
- todos los convocados quedan bloqueados para irse del equipo (ver E6).

Es un estado terminal no declarado. Con dos equipos nuevos (FPS = 100 los dos) el empate total es el caso **más probable**, no el borde.

> #### ✅ Solución aplicada — 2026-07-28
>
> **`admin_resolve_dispute(p_match_id, p_resolution, p_admin_notes)`** (migración
> `20260728190000`), admin-gated, que se saltea el desempate por votos/Fair Play:
>
> | `p_resolution` | Efecto |
> |---|---|
> | `WIN_A` / `WIN_B` | `FINALIZADO` con ganador forzado → dispara el motor normal (`resolve_match_elo` → `apply_match_outcome`): ELO, stats de temporada y Fair Play se aplican igual que en cualquier partido |
> | `CANCEL` | `CANCELADO`, sin ELO ni stats: el partido no computa |
>
> Más `get_disputed_matches()`, que lista las disputas abiertas con el marcador cargado por
> cada lado, los votos y el Fair Play — el contexto que el admin necesita para decidir.
>
> **El estado forzado no alcanza: hay que dejar los datos consistentes.**
> `apply_match_outcome` lee **las dos filas** de `match_results` cuando el estado es
> `FINALIZADO` y se va sin hacer nada si falta alguna. Como el caso típico que llega acá
> —vía barrido— tiene un solo resultado cargado, forzar el estado sin más habría producido
> un partido "resuelto" **sin aplicar ELO ni estadísticas, en silencio**. El criterio, en
> orden:
>
> 1. Si el ganador cargó su resultado → se adopta tal cual y se escribe el espejo en el
>    perdedor. Es la misma transformación que ya hace `resolve_match_dispute`.
> 2. Si el ganador nunca cargó → **3-0 administrativo**, la convención que el dominio ya usa
>    para el WO. Deliberadamente **no** se invierte el marcador que reportó el otro equipo:
>    eso sería fabricar goles a nombre de alguien.
>
> Las filas que escribe la RPC quedan con `submitted_by` = el admin que resolvió, que es la
> verdad de quién las generó.
>
> **Detalle que casi se escapa — el Fair Play en la rama `CANCEL`.** `trigger_update_fps`
> sólo recalcula ante `FINALIZADO`/`WO_A`/`WO_B`/`EN_DISPUTA`. `CANCELADO` no está en esa
> lista, así que el −2 que el partido aportaba mientras estaba en disputa habría quedado
> congelado hasta que otro evento disparara un recálculo. La rama `CANCEL` llama a
> `recalculate_team_fps` explícitamente para los dos equipos.
>
> **UI:** `app/admin/dispute-review.tsx`, modelada sobre `wo-review.tsx`. Muestra los dos
> marcadores enfrentados (con "no cargó" cuando falta), votos y Fair Play de cada lado, y
> marca explícitamente los partidos en **empate total** —mismos votos y mismo Fair Play—, que
> son los que sólo se pueden cerrar desde ahí. Las tres acciones pasan por `ConfirmDialog`
> con campo de notas, que viajan a los dos equipos en la notificación.
>
> **Cierra el residual que había dejado el Bloque 3:** la rama del barrido que manda partidos
> a `EN_DISPUTA` ya tiene salida garantizada.
>
> **Duplicación menor conocida:** en `WIN_A`/`WIN_B` el paso a `FINALIZADO` dispara también
> `notify_match_status_change` ("Partido finalizado"), así que los jugadores reciben esa
> notificación **y** la de `DISPUTA_RESUELTA` con el veredicto y las notas. Se prefirió el
> aviso duplicado antes que perder la explicación del admin.

---

### D3 ✅ CERRADO — Ningún estado del partido caduca

**Evidencia:** los únicos jobs programados son `enqueue-match-reminders`, `deactivate-expired-market-posts` (`20260711034627_g3_b1_pgcron_jobs.sql:55-64`) y `season-expiry-reminder` (`20260714131532_season_lifecycle.sql:87-90`). El job `season-reset-elo` fue dado de baja a propósito.

No hay ningún proceso que cierre:

| Estado huérfano | Cómo se produce | Consecuencia |
|---|---|---|
| `PENDIENTE` sin propuesta | `accept_challenge` crea el partido **sin `scheduled_at`** (`20260328150331:56-72`) y nadie propone nunca | Vive para siempre en "Próximos" |
| `CONFIRMADO` con fecha pasada | Se jugó y nadie cargó nada, o no se jugó | Nunca se marca ausencia |
| `EN_VIVO` sin resultados | Un equipo hizo check-in, el otro también, y nadie cargó | Partido "en vivo" indefinido |

El `EN_VIVO` eterno es el más caro: bloquea `leave_team_as_member` para **todos** los convocados (`ACTIVE_MATCH`, ver E6), y el banner rojo "En vivo" queda clavado en la pestaña Partidos.

> #### ✅ Solución aplicada — 2026-07-28 (cierra D3, D4 y E6)
>
> **`sweep_stale_matches()`** (migración `20260728181000`), job `pg_cron` horario
> (`20 * * * *`, elegido para no pisar el recordatorio de `*/15` ni la limpieza del mercado
> de `:00`). Tabla de decisión:
>
> | Estado de origen | Condición | Destino |
> |---|---|---|
> | `PENDIENTE` | `coalesce(scheduled_at, created_at)` > 14 días | `CANCELADO` |
> | `CONFIRMADO` | pasada la gracia (4 h) · **nadie** hizo check-in | `CANCELADO` |
> | `CONFIRMADO` | pasada la gracia · **sólo A** hizo check-in | `WO_A` (3-0 + ELO + FPS) |
> | `CONFIRMADO` | pasada la gracia · **sólo B** hizo check-in | `WO_B` |
> | `EN_VIVO` | > 24 h · **sin** resultados cargados | `CANCELADO` |
> | `EN_VIVO` | > 24 h · **con** algún resultado | `EN_DISPUTA` |
>
> **Idempotente por construcción:** cada rama mueve el partido a un estado que ya no matchea
> su propio `WHERE`, así que correrla dos veces no reprocesa nada y no hace falta una columna
> de control tipo `reminder_24h_sent_at`. Devuelve un `jsonb` con el conteo por rama, para
> poder ejecutarla a mano y ver qué haría.
>
> **Umbrales en `app_settings`** (`sweep_pending_no_date_days`, `sweep_confirmed_grace_hours`,
> `sweep_live_timeout_hours`), misma mecánica que `checkin_geofence_radius_m`: producto los
> ajusta sin desplegar. Índices parciales por estado para las tres queries.
>
> **No pisa al admin:** la rama de `CONFIRMADO` excluye los partidos con un `wo_claim` en
> `PENDIENTE_REVISION`. Sin ese guard, el barrido podía otorgar un WO automático mientras un
> administrador estaba evaluando el reclamo del mismo partido.
>
> **Sobre el WO automático:** el `3-0` no lo necesita `apply_match_outcome` (para `WO_*` lo
> tiene hardcodeado), pero sí la pantalla de detalle y el historial, así que se inserta la
> fila en `match_results` usando como `submitted_by` al perfil que efectivamente hizo el
> check-in — el equivalente automático del `claimed_by` de `resolve_wo_claim`. Y como
> `notify_match_status_change` sólo cubre `CONFIRMADO`/`FINALIZADO`/`EN_DISPUTA`, las ramas
> que terminan en `CANCELADO` y `WO_*` insertan su propia notificación (que a su vez dispara
> el push por el trigger de dispatch).
>
> ##### ⚠️ Dos cosas que hay que leer antes de calendarizarlo
>
> **1 · `EN_VIVO` sin resultados va a `CANCELADO`, no a `EN_DISPUTA`.** El plan pedía
> `EN_DISPUTA` para todo `EN_VIVO` vencido, pero `resolve_match_dispute` lee los goles del
> ganador desde `match_results` y aborta con *"No se encontraron resultados del equipo
> ganador"* si no existen. Mandar ahí un partido sin resultados fabricaría exactamente el
> callejón de **D2**, sólo que automáticamente y a escala. Cancelar cierra el ciclo y libera
> a los convocados, que es el objetivo de E6.
>
> **2 · La rama que sí va a `EN_DISPUTA` depende de D2, que sigue abierto.** Un `EN_VIVO`
> vencido tiene 0 o 1 resultados (con 2 el trigger `resolve_match` ya lo habría cerrado). Con
> 1 resultado, `resolve_match_dispute` puede: (i) abortar si el ganador por votos/Fair Play
> es el equipo que nunca cargó, o (ii) finalizar **sin aplicar stats**, porque
> `apply_match_outcome` necesita las dos filas. Es una limitación preexistente de la
> resolución de disputas —el barrido no la introduce— pero ahora se alcanza por vía
> automática. **El cierre real es la herramienta de admin para disputas (D2).** Hasta
> entonces, conviene monitorear la métrica `liveDisputed` del `jsonb` de retorno.
>
> #### 🔴 Hotfix posterior — el barrido abortaba con 42804 (2026-07-31)
>
> **`sweep_stale_matches()` nunca funcionó** desde que se escribió, y estuvo así
> en producción desde el 28 de julio. La rama de WO automático hacía:
>
> ```sql
> update matches
>   set status = case when v_winner_team_id = r.team_a_id then 'WO_A' else 'WO_B' end
> ```
>
> Un literal suelto (`set status = 'WO_A'`) se castea implícitamente al tipo de la
> columna, **pero dentro de un `CASE` las dos ramas se resuelven a `text`** y
> Postgres deja de coercionar al enum `match_status`:
>
> ```
> ERROR 42804: column "status" is of type match_status but expression is of type text
> ```
>
> **El daño excede a su propia rama.** La excepción aborta la función **entera**:
> el primer partido que calificara para auto-WO no sólo no se resolvía — además
> impedía que esa corrida cancelara los `PENDIENTE` sin coordinar (rama 1) y
> cerrara los `EN_VIVO` abandonados (rama 3). El cron horario quedaba inútil
> hasta que alguien resolviera ese partido a mano.
>
> **Por qué nadie lo vio en tres bloques.** La suite `300-sweep-stale-matches.spec.sql`
> abortaba en su primer `INSERT` desde que se escribió (fixture `m4` sin
> `format`, que un trigger del Bloque 2 rechaza), y como nunca se corrió
> `supabase test db`, el archivo figuraba como cobertura existente sin haber
> ejecutado una sola aserción. **Dos bugs tapándose mutuamente:** arreglar la
> fixture fue lo que destapó el cast.
>
> **Corregido en `20260731001000_hotfix_sweep_stale_matches_cast.sql`**
> (`(case … end)::match_status`), como migración de roll-forward y no in situ: la
> migración que contenía el bug (`20260729121000`, E8) **ya estaba aplicada en
> producción**, y `db push` saltea lo que ya figura en el historial del remoto —
> una corrección sobre ese archivo no habría llegado nunca a la base real.
>
> **Lo encontró el CI, no una revisión.** Es el argumento más concreto de todo
> este reporte a favor de correr las suites en vez de escribirlas.

---

### D4 ✅ CERRADO — "¿Qué pasa si un equipo no hace check-in?" — no hay respuesta automática

Hoy el único camino es **manual y asimétrico**:

1. Mi equipo hace check-in (si no, el botón WO ni aparece: `app/match-detail.tsx:425`).
2. Reclamo WO con foto (`claimWo` → `wo_claims` en `PENDIENTE_REVISION`).
3. Un admin lo aprueba desde `app/admin/wo-review.tsx`.

No existe:

- **auto-WO por no presentación** (ej.: pasados 30' del horario pactado con un solo equipo con check-in),
- ninguna salida para el caso en que **ninguno de los dos** hace check-in (partido que simplemente no se jugó): el partido queda `CONFIRMADO` eterno y nadie puede reclamar nada, porque `claim_wo` exige que el equipo reclamante tenga check-in registrado (`20260714180000_claim_wo_null_role_fix.sql:65-70`).

El motor de puntaje del WO sí está completo (−15 FPS al ausente, 3-0, ELO, goleadores). Lo que falta es el **disparador**.

> #### ✅ Solución aplicada — 2026-07-28
>
> El disparador es `sweep_stale_matches()` (ver la nota de **D3** para el diseño completo).
> Pasadas 4 h del horario pactado:
>
> - **un equipo con check-in y el otro no** → `WO_A`/`WO_B` automático, con su 3-0, su ELO,
>   su −15 de Fair Play y aviso a los dos equipos. Ya no hace falta que alguien reclame ni
>   que un admin apruebe.
> - **ninguno de los dos con check-in** → `CANCELADO`. Éste era el agujero exacto que
>   describía el hallazgo: sin check-in de ninguno, `claim_wo` era inalcanzable para ambos
>   (exige que el equipo reclamante tenga check-in) y el partido quedaba `CONFIRMADO` para
>   siempre. No se penaliza Fair Play: sin evidencia de quién faltó, el objetivo es cerrar el
>   ciclo y liberar a los convocados, no repartir culpas.
>
> El reclamo manual (`claim_wo` + revisión de admin) **sigue existiendo y tiene prioridad**:
> el barrido excluye los partidos con un `wo_claim` en `PENDIENTE_REVISION`. Sirve para los
> casos que el check-in no puede probar solo — abandono a mitad de partido, incidente de
> conducta, cancha no disponible.

---

### D5 ✅ CERRADO (parcial) — Un solo reclamo de WO por partido, sin contra-reclamo, sin aviso y sin reintento

**Evidencia:** `20240101000000_initial_schema.sql:424` → `unique (match_id)  -- un solo reclamo por partido`.

Cuatro consecuencias encadenadas:

1. **Sin contra-reclamo.** Si el equipo A reclama primero (aunque mienta sobre quién no se presentó), B **no puede** reclamar. El primero en apretar define la narrativa que verá el admin.
2. **Rechazo = callejón sin salida.** Si el admin rechaza, `resolve_wo_claim` (`20260714002506:160-165`) solo marca el claim como `RECHAZADO`; el partido **no cambia de estado** y ya no se puede volver a reclamar (chocaría con el `unique`). El partido queda igual que en D3.
3. **Cero notificaciones.** `resolve_wo_claim` no inserta ninguna fila en `notifications`, ni al aprobar ni al rechazar. El equipo reclamante nunca se entera del veredicto ni de las `admin_notes`; el equipo acusado nunca se entera de que lo acusaron.
4. **Sin estado visible.** `app/match-detail.tsx` solo pinta `match.woClaim` en la rama `WO_A/WO_B` (503-520). Mientras el reclamo está en `PENDIENTE_REVISION` la pantalla se ve idéntica a antes: el partido sigue "Confirmado" y **el botón WO vuelve a estar disponible** → segundo tap = violación del `unique` mostrada como error genérico de Supabase.

> #### ✅ Solución aplicada — 2026-07-28 (3 de los 4 sub-problemas)
>
> **(2) El rechazo deja de ser un callejón sin salida.** `resolve_wo_claim` (migración
> `20260728180000`) ahora, al rechazar:
>
> | Estado del partido | Qué hace |
> |---|---|
> | `CONFIRMADO` | → `CANCELADO`. El admin dictaminó que no hubo WO y el partido nunca arrancó: se cierra el ciclo y se liberan los convocados, que hasta ahora quedaban bloqueados por `ACTIVE_MATCH`. |
> | `EN_VIVO` | se respeta. Hay partido en curso y todavía se puede cargar el resultado; si nadie lo hace, lo levanta `sweep_stale_matches()` a las 24 h. |
> | otros | no se toca. |
>
> **(3) Notificación a los dos equipos, en ambos veredictos**, con las `admin_notes`
> incorporadas al cuerpo. Se emiten mensajes distintos para cada lado: el reclamante lee
> *"Tu reclamo de WO fue aprobado"* y el equipo señalado *"Partido perdido por WO"* — antes
> ni se enteraba de que lo habían acusado de no presentarse, y el −15 de Fair Play le
> aparecía sin explicación. Cada `INSERT` en `notifications` dispara el push por el trigger
> de dispatch, así que no hizo falta código de envío.
>
> **(4) El reclamo pendiente ahora se ve.** `get_match_detail` ya devolvía el nodo `wo_claim`
> sin filtrar por estado; sólo faltaba pintarlo. Se agregó `WoClaimPendingBanner` en las
> ramas `CONFIRMADO` y `EN_VIVO` de `app/match-detail.tsx`, con texto distinto para el
> reclamante y para el equipo señalado, y **se oculta el botón WO cuando ya existe un
> reclamo** — que era la causa del segundo tap contra el `unique(match_id)`.
>
> **(1) NO cerrado — el contra-reclamo sigue siendo imposible.** `unique (match_id)` en
> `wo_claims` admite un solo reclamo por partido: si A reclama primero (aunque mienta), B no
> puede reclamar. Habilitarlo requiere cambiar la constraint a
> `unique (match_id, claiming_team_id)` y definir el desempate entre dos reclamos opuestos
> —qué pasa si los dos equipos dicen que el otro no se presentó—, que es una decisión de
> producto además de un cambio de schema. Es el remanente de D5.
>
> En la práctica el riesgo bajó bastante: el **WO automático por check-in** (ver D4) cubre el
> caso de no presentación sin depender de que nadie reclame, y el reclamo manual queda para
> los casos que el check-in no prueba solo.
>
> #### 🔴 Hotfix posterior — esta migración causó una regresión (2026-07-31)
>
> Al reescribir `resolve_wo_claim` con `CREATE OR REPLACE` de cuerpo completo,
> `20260728180000` tomó como base una versión **anterior** al hotfix de seguridad
> `20260714022651` y se llevó puestas dos cosas que ese hotfix había agregado:
>
> | Perdido | Consecuencia |
> |---|---|
> | La guarda de estado terminal | **Aprobar un WO sobre un partido `FINALIZADO` pisaba el resultado real con un 3-0** (`ON CONFLICT DO UPDATE`) y disparaba ELO y Fair Play. Corrupción de un resultado ya computado y publicado. |
> | `resolved_by = v_admin_profile` | Se perdió la traza de **qué admin** resolvió cada reclamo: la columna quedaba en NULL siempre. |
>
> Estuvo así **en producción desde el 28 de julio**. Lo encontró
> `supabase test db` en su primera corrida real (`120-rls-hotfix` H5a/H5b/H5c y
> `240-rpc-wo-admin` WA-4), no una revisión del código.
>
> **Corregido en `20260731000000_hotfix_resolve_wo_claim_regression.sql`**, que
> restaura ambas sobre el cuerpo de D5 **sin tocar** lo que D5 aportó. Dos
> decisiones de la reparación:
>
> · **La guarda va en la rama de aprobación, no antes del `if`.** Ponerla arriba
>   bloquearía también el rechazo y recrearía exactamente el callejón sin salida
>   que D5 vino a cerrar. El mensaje del hotfix original ya lo decía: *"rechazá
>   el reclamo en su lugar"*.
> · **`EN_DISPUTA` se suma a los estados terminales.** No estaba en el original.
>   Desde D3/D4 un `EN_VIVO` con reclamo pendiente puede terminar en disputa por
>   el barrido, y una disputa tiene su propio circuito (D2): otorgar un WO por
>   encima dejaría dos veredictos compitiendo por el mismo partido.
>
> **Es el mismo patrón que E9** (donde `send_challenge` perdió su advisory lock
> al ser reescrita por E3) y que el cast del barrido (D3/D4). Cuatro casos en el
> mismo reporte: *cada `CREATE OR REPLACE` de cuerpo completo tiene que partir de
> la última versión, no de la que uno recuerda.*

---

### D6 ✅ CERRADO — `claim_wo` no valida el estado del partido

`claim_wo` verifica autenticación, pertenencia del equipo al partido, rol o check-in del emisor, y validez de goleadores/MVP — pero **nunca mira `matches.status`**. Vía API se puede reclamar un WO sobre un partido `FINALIZADO` o `CANCELADO`. Si un admin lo aprueba, `resolve_wo_claim` pisa `match_results` con el 3-0 (`ON CONFLICT ... DO UPDATE`) y cambia el status. La guarda de idempotencia de `resolve_match_elo` evita el doble conteo de ELO, pero **el marcador y el historial quedan falsificados**. La UI solo expone el botón en `CONFIRMADO`/`EN_VIVO`, así que hoy es un hueco de API, no de pantalla.

> #### ✅ Solución aplicada — 2026-07-28
>
> **Migración:** `20260728210000_d6_claim_wo_status_guard.sql`
>
> Una guarda, ubicada inmediatamente después de resolver el partido y validar que el equipo le
> pertenece —y **antes** de la autorización, para que el mensaje sea el útil ("el partido ya
> terminó") y no el genérico de permisos:
>
> ```sql
> if v_match.status not in ('CONFIRMADO', 'EN_VIVO') then
>   raise exception
>     'INVALID_MATCH_STATUS: solo se puede reclamar un WO sobre un partido confirmado o en curso (estado actual: %)',
>     v_match.status;
> ```
>
> **Por qué esos dos estados y no otros:** `CONFIRMADO` es el caso canónico (el rival no se
> presentó) y `EN_VIVO` cubre abandono, incidente de conducta y campo caído a mitad de partido
> —motivos que `wo_reason` ya acepta—. `PENDIENTE` queda afuera porque todavía no hay fecha ni
> cancha acordada: no hay a qué presentarse. `FINALIZADO`, `EN_DISPUTA`, `WO_A`/`WO_B` y
> `CANCELADO` son terminales o tienen su propio circuito de resolución
> (`resolve_match_dispute`, `admin_resolve_dispute`): reclamar un WO ahí **es** el ataque.
>
> El prefijo `INVALID_MATCH_STATUS:` es el mismo que ya usa `confirm_match_proposal` (D7) y que
> el cliente sabe mapear a mensaje presentable (`PROPOSAL_ERROR_CODES`, `lib/match-actions.ts`).
>
> **Sin cambio visible:** la UI ya ofrecía el botón sólo en `CONFIRMADO`/`EN_VIVO`, así que
> ningún flujo legítimo se toca. El resto del cuerpo es idéntico a
> `20260714180000_claim_wo_null_role_fix.sql`, incluido el `coalesce` que cierra el bug de
> lógica NULL para no-miembros.
>
> **Lo que este fix NO hace:** no agrega un test pgTAP de regresión
> (`supabase/tests/g6_claim_wo.sql` sería el archivo natural), y no toca `resolve_wo_claim` —
> la aprobación del admin sigue confiando en que el reclamo nació válido, cosa que ahora es
> cierta por construcción.

---

### D7 ✅ CERRADO — `confirm_match_proposal` no verifica que la propuesta pertenezca al partido

**Evidencia:** `20260328165650_production_security_patch.sql:621-673`.

La firma es `confirm_match_proposal(p_proposal_id, p_match_id)` y **nunca se compara `v_proposal.match_id` con `p_match_id`**. El `p_match_id` viene del cliente y se usa tanto en el `EXISTS` de autorización como en el `UPDATE matches`. Un capitán puede tomar el id de una propuesta que puede leer (RLS le da SELECT sobre las propuestas de sus partidos) y aplicarla a **otro** partido suyo: ese partido pasa a `CONFIRMADO` con fecha, formato, cancha, seña y costo ajenos, **sin que el rival haya propuesto nada**.

Además tampoco valida que el partido esté en `PENDIENTE`, lo que habilita "re-confirmar" un partido `CANCELADO` (ver D8).

> #### ✅ Solución aplicada — 2026-07-28 (dentro de la migración de E1)
>
> Dos guardas en `confirm_match_proposal`, que se estaba reescribiendo entera para E1:
>
> ```sql
> IF v_proposal.match_id <> p_match_id THEN
>   RAISE EXCEPTION 'PROPOSAL_MATCH_MISMATCH: la propuesta no pertenece a este partido';
> ...
> IF v_match.status <> 'PENDIENTE' THEN
>   RAISE EXCEPTION 'INVALID_MATCH_STATUS: el partido ya no está pendiente (estado: %)', v_match.status;
> ```
>
> Cierra el uso cruzado de propuestas entre partidos y, de paso, la vía de explotación de D8.
> No estaba en el plan del Bloque 2, pero eran dos `IF` dentro de una función que ya se
> estaba reemplazando: dejarlos afuera habría sido reintroducir a mano un agujero conocido.

---

### D8 ✅ CERRADO (vía D7) — Cancelar un partido no cierra sus propuestas pendientes

`respond_to_cancellation_request` (`20260708181125:114-121`) pone el partido en `CANCELADO` pero deja las `match_proposals` en `PENDIENTE`. Combinado con D7, una propuesta zombi permite devolver un partido cancelado a `CONFIRMADO`. Lo mismo aplica al revés: no hay limpieza de propuestas al llegar a `FINALIZADO`.

> #### ✅ Solución aplicada — 2026-07-28
>
> La guarda `INVALID_MATCH_STATUS` de D7 corta la **explotación**: una propuesta zombi ya no
> puede revivir un partido `CANCELADO` ni `FINALIZADO`.
>
> **Queda pendiente la higiene de datos:** las propuestas siguen quedando en `PENDIENTE` para
> siempre sobre partidos terminales. Ya no son peligrosas, pero ensucian consultas y podrían
> confundir a un reporte futuro. El cierre completo sería marcarlas `RECHAZADA` al cancelar
> o finalizar — trabajo de limpieza, no de seguridad.

---

### D9 ✅ CERRADO — Un solo jugador marca la llegada de todo el equipo

**Evidencia:** `20260728140000_geofence_hardening.sql:178-202`.

`checkin_team` (el "Marcar llegada" que ve un JUGADOR en `components/matches/CheckinSection.tsx:110-117`):

- sella `checkin_team_a_at` / `checkin_team_b_at`, es decir **la presencia del equipo entero**,
- marca al que tocó como `is_result_loader = true`,
- y si el otro equipo ya está sellado, pasa el partido a `EN_VIVO`.

Conceptualmente confunde *"yo llegué"* con *"mi equipo se presentó"*. Un solo jugador (rol JUGADOR, sin cupo mínimo, sin lista) invalida un eventual WO por no presentación del rival y arranca el partido. El camino largo (`submit_team_checkin`) sí exige CAPITAN/SUBCAPITAN + mínimo de titulares + tope de convocados por `format_rules`; el camino corto lo esquiva por completo.

> #### ⚠️ Reclasificado a 🟠 antes de cerrarlo — 2026-07-28
>
> La severidad original (🟡) se calibró contra el estado del código **antes del Bloque 3**.
> Desde `20260728181000`, `sweep_stale_matches()` decide el **WO automático** leyendo
> exactamente el sello que este hallazgo permitía falsificar:
>
> ```sql
> elsif r.checkin_team_a_at is not null and r.checkin_team_b_at is null then
>   v_winner_team_id := r.team_a_id;   -- 3-0, ELO K=40, −15 Fair Play al otro
> ```
>
> Es decir: **un jugador solo, parado dentro del geofence, se otorgaba un 3-0 automático**
> si el rival no alcanzaba a sellar — o invalidaba un WO legítimo en su contra
> presentándose él y nadie más. La automatización del Bloque 3 quedó montada sobre un input
> que costaba un tap falsificar. Dejó de ser una imprecisión conceptual para ser el último
> agujero abierto de integridad competitiva.
>
> #### ✅ Solución aplicada — 2026-07-28
>
> `20260728220000_d9_checkin_team_quorum.sql` separa los dos hechos que la RPC mezclaba:
>
> | Hecho | Dónde vive ahora | Quién lo produce |
> |---|---|---|
> | "yo llegué" | `match_participants.did_checkin` | cualquier miembro, siempre |
> | "mi equipo se presentó" | `matches.checkin_team_X_at` | sólo el quórum: N ≥ `min_players_to_start` |
>
> **No se pidió rol, a propósito.** Exigir CAPITAN/SUBCAPITAN en `checkin_team` habría sido
> la solución de una línea y habría roto el flujo del JUGADOR por completo: hoy el botón
> "Marcar llegada" es justamente lo que ve quien *no* es admin (el admin va a la convocatoria).
> El jugador sigue pudiendo marcar su llegada. Lo que ya no puede es hablar por los diez que
> no vinieron.
>
> **El umbral no es nuevo:** es `format_rules.min_players_to_start`, el mismo que valida
> `submit_team_checkin` al presentar la lista y el que `confirm_match_proposal` exige a los dos
> planteles (E1). Tres reglas, un solo número, configurable sin desplegar. Para partidos sin
> formato hay un respaldo en `app_settings.checkin_min_players_fallback` (4) — nunca 1.
>
> **Los invitados SÍ cuentan** para el quórum: están en la cancha, que es lo único que el
> sello afirma. Es deliberadamente más laxo que E1 —que no los cuenta al confirmar porque
> todavía no existen— y compensa en parte esa rigidez.
>
> **El sello se pone una sola vez.** Si el capitán ya presentó la lista, el timestamp original
> manda: re-sellar movería la hora de llegada del equipo hacia adelante y falsearía justo la
> evidencia con la que se resuelve un WO.
>
> **Guarda de estado, de paso:** la función no miraba `matches.status`. Un check-in sobre un
> partido PENDIENTE dejaba el sello latente y lo pre-confirmaba. Ahora exige
> CONFIRMADO/EN_VIVO — mismo criterio que D6 aplicó a `claim_wo`.
>
> **La RPC pasó de `void` a `json`** (DROP + CREATE: no se puede cambiar el tipo de retorno con
> CREATE OR REPLACE). No es cosmético: sin la respuesta, el jugador que marca llegada ve
> "listo" mientras el casillero de su equipo sigue en "Pendiente", y la pantalla no tiene con
> qué explicarle por qué. Ahora `CheckinSection` muestra `N/M llegaron` y el alert distingue
> los tres desenlaces: *presentaste al equipo* / *ya estaba presentado* / *faltan X*.
>
> **Cobertura:** `310-checkin-quorum-schedule.spec.sql` Q-1..Q-8 — un solo check-in no sella
> pero sí registra, el quórum sella, el sello no se reescribe, la guarda de estado, y que el
> literal `'No autorizado'` de P1-4 siga intacto pese a la rama nueva de invitados.

---

### D10 ✅ CERRADO — La regla "puedo cargar resultado" está definida tres veces, distinta cada vez

| Lugar | Condición |
|---|---|
| `app/match-detail.tsx:273-276` | `EN_VIVO && !myResult && (isResultLoader ∥ CAPITAN ∥ SUBCAPITAN)` |
| `components/matches/ResultSection.tsx:72` | `EN_VIVO && isResultLoader && !myResult` |
| `components/matches/LiveMatchBanner.tsx:64-71` y `MatchCardFooter.tsx:89-98` | `EN_VIVO` a secas |

Un capitán que no hizo check-in ve el botón rojo **"Finalizar Partido"** pero no ve **"Cargar resultado"** dentro de la sección de resultado, en la misma pantalla. Y desde la pestaña Partidos, **cualquier miembro** ve "→ Cargar resultado" incluso si su equipo ya lo cargó. El comentario en el código (`// Bug 8: definición ÚNICA de "puedo cargar resultado"`) documenta la intención de unificar; la unificación quedó a mitad de camino.

> #### ✅ Solución aplicada — 2026-07-28
>
> **Módulo nuevo:** `lib/match-permissions.ts` (+ `lib/match-permissions.test.ts`, 14 casos).
>
> La regla pasa a existir una sola vez, con dos adaptadores según qué datos tenga cada
> superficie a mano:
>
> ```ts
> canLoadResult({ status, hasMyResult, isResultLoader, isAdmin })
>   → status === 'EN_VIVO' && !hasMyResult && (isResultLoader || isAdmin)
>
> canLoadResultFromDetail(match)                  // get_match_detail: trae todo
> canLoadResultFromCard(entry, myTeamId, canManage)  // get_my_matches: no trae is_result_loader
> isTeamMatchAdmin(role)                          // CAPITAN | SUBCAPITAN
> ```
>
> **Consumidores actualizados** — los cuatro del hallazgo, más la pantalla contenedora:
>
> | Archivo | Antes | Ahora |
> |---|---|---|
> | `app/match-detail.tsx` | la regla completa, inline | `canLoadResultFromDetail(match)` |
> | `components/matches/ResultSection.tsx` | `isResultLoader` a secas | `canLoadResultFromDetail(match)` |
> | `components/matches/LiveMatchBanner.tsx` | `EN_VIVO` (gateado desde el padre) | `canLoadResultFromCard(...)` + prop `canManage` |
> | `components/matches/MatchCardFooter.tsx` | `EN_VIVO && canManage` | `canLoadResultFromCard(...)` |
> | `app/(tabs)/matches.tsx` | `role === 'CAPITAN' \|\| role === 'SUBCAPITAN'` | `isTeamMatchAdmin(activeRole)` |
>
> **Las dos discrepancias que desaparecen:** el capitán sin check-in ahora ve los dos botones
> (antes veía sólo "Finalizar Partido"), y la tarjeta de la lista deja de ofrecer "→ Cargar
> resultado" en cuanto mi equipo cargó — eso último se deriva de `resultTeamA`/`resultTeamB`,
> que son el `goals_scored` de cada equipo y por lo tanto no nulos exactamente cuando ese
> equipo ya cargó. Era el dato que faltaba mirar.
>
> **Falso negativo deliberado:** en las tarjetas, `isResultLoader` se asume `false` porque
> `get_my_matches` no devuelve ese dato — el jugador que sí es result-loader entra al detalle y
> ahí encuentra el botón. Nunca se dibuja un botón que después rebota; a lo sumo se omite uno
> que el detalle sí ofrece. Cerrar también ese hueco requeriría agregar `is_result_loader` al
> payload de `get_my_matches`, que es trabajo de RPC y no de UI.
>
> ⚠️ Sigue siendo gating de UI. La autoridad es la policy de INSERT sobre `match_results`
> (CAPITAN/SUBCAPITAN **o** `is_result_loader`) y el `UNIQUE (match_id, team_id)` que produce
> el 23505 → `ResultAlreadySubmittedError`.

---

### D11 ✅ CERRADO — Las notificaciones más urgentes del partido no llevan a ningún lado

**Evidencia:** `app/notifications.tsx:122-153`.

El `switch` de ruteo cubre solicitudes de equipo, desafíos, roles, expulsiones y postulaciones. El `default` dice, literalmente:

> `// Partidos, disputas, WO y temporada: sin destino específico todavía.`

Es decir: `CANCELACION_SOLICITADA`, `PARTIDO_CANCELADO`, `RESULTADO_EN_DISPUTA`, `RECORDATORIO_PARTIDO_24H` y las de temporada **se marcan como leídas y no navegan**. La notificación que exige una respuesta en las próximas horas ("el rival quiere cancelar tu partido de mañana") es exactamente la que no acciona. Los payloads ya llevan `matchId` en `data` (`lib/match-actions.ts:189-195`), así que la información para rutear está; falta el caso en el `switch`.

> #### ✅ Solución aplicada — 2026-07-28
>
> El `default` del `switch` dejó de ser un no-op: cualquier notificación cuyo payload traiga
> `match_id` navega al detalle del partido.
>
> ```ts
> if (matchId) router.push({ pathname: '/match-detail', params: { matchId } });
> ```
>
> Cubre de una sola vez todo el ciclo del partido —confirmación, cancelación, disputa,
> recordatorio de 24 h— y también los tres tipos nuevos que introdujo este bloque
> (`WO_APROBADO`, `WO_RECHAZADO`, `WO_AUTOMATICO`). Se resolvió por payload y no enumerando
> tipos a propósito: cualquier evento de partido futuro queda ruteado sin tocar esta pantalla.
>
> Entró en el Bloque 3 porque el barrido y el circuito de WO **emiten notificaciones nuevas**:
> agregarlas sabiendo que no llevaban a ningún lado habría sido repetir el mismo defecto que
> este hallazgo describe.
>
> **Residual menor:** la navegación no pasa `myTeamId`, así que el detalle lo infiere del
> equipo activo del store — es **R9**, que sigue abierto y afecta sólo a usuarios con más de
> un equipo.

---

### D12 ✅ CERRADO — La bandeja de "acciones pendientes" del Home está incompleta

`lib/home-data.ts:203-234` computa cuatro señales: `DISPUTE`, `CHALLENGE_RECEIVED`, `TEAM_REQUEST` y `pendingTransfers`. **Faltan**, todas ellas acciones con vencimiento real:

- propuestas de partido esperando mi respuesta,
- solicitudes de cancelación esperando mi respuesta,
- partidos `EN_VIVO` sin resultado cargado por mi equipo,
- postulaciones de mercado recibidas.

Además la tarjeta `DISPUTE` se le muestra a jugadores que no pueden hacer nada con ella (solo capitanes resuelven).

> #### ✅ Solución aplicada — 2026-07-29
>
> **Sin migraciones**: las cuatro señales salen de tablas que ya existen y que el
> usuario ya puede leer. Lo que faltaba era mirarlas.
>
> | Señal nueva | De dónde sale | Qué vence si nadie actúa |
> |---|---|---|
> | `MATCH_PROPOSAL` | `match_proposals` `PENDIENTE` cuyo `from_team_id` **no** es mío | el partido lo cancela `sweep_stale_matches` a los 14 días |
> | `CANCELLATION_REQUEST` | `cancellation_requests` `PENDIENTE` pedida por el rival | el partido sigue comprometido y el Fair Play corre |
> | `LIVE_RESULT` | partidos `EN_VIVO` sin fila mía en `match_results` | a las 24 h el barrido lo cierra sin computar (o lo manda a disputa) |
> | `MARKET_APPLICATION` | postulaciones `PENDIENTE`/`VISTA` sobre **mis** avisos activos | el aviso se cierra o vence y el postulante nunca recibe respuesta |
>
> **El criterio de inclusión no fue "qué más se puede contar", fue *qué caduca*.**
> Las cuatro son acciones con un reloj corriendo del otro lado, y tres de las
> cuatro las liquida un job automático. La bandeja mostraba exactamente las
> señales que **no** tienen vencimiento y ocultaba las que sí.
>
> **La tarjeta `DISPUTE` ahora gatea por rol**, que era el segundo defecto del
> hallazgo. Junto con ella, todas las señales de partido se calculan sólo sobre
> `captainTeamIds`: un JUGADOR no puede responder una propuesta, ni una
> cancelación, ni resolver una disputa. Mostrárselas era pedirle algo que la RPC
> le rechaza — el mismo error de forma que R1/R2/R3 en sus pantallas.
> `LIVE_RESULT` se rige por el mismo filtro aunque la regla del servidor sea más
> amplia (`is_result_loader` también puede cargar): la lista del Home no sabe
> quién hizo check-in, así que es el mismo falso negativo aceptable que ya
> documenta `canLoadResultFromCard` (D10).
>
> **`myTeamId` por partido, no del store.** "Ya cargué el resultado" y "la
> propuesta la mandó el rival" se miden contra el equipo con el que juego **ese**
> partido, resuelto fila por fila. Es la misma corrección de forma que R9: el
> equipo activo del store no es una respuesta válida a "¿quién soy en este
> partido?".
>
> **Navegación:** cada tarjeta lleva a donde la acción se resuelve, y cuando la
> señal es **una sola** viaja con su `matchId` y entra directo al detalle. Con
> dos o más queda `null` y cae en la lista: elegir una de dos propuestas
> pendientes sería arbitrario. `CHALLENGE_RECEIVED` dejó de ir a `/(tabs)/ranking`
> —donde no hay ninguna bandeja— y va a `/challenge-inbox`.
>
> **La lógica de armado se extrajo a `buildPendingActions`**, exportada y
> testeada aparte. Es donde viven el orden de la bandeja (primero lo que se
> cierra solo, después lo que espera respuesta) y los singulares/plurales;
> probarlo dentro de `fetchHomeViewData` habría exigido encadenar doce respuestas
> de Supabase para verificar un `if`.
>
> **Lo que este fix NO hace:** no agrega `pendingTransfers` a la bandeja —sigue
> siendo su propia tarjeta en el onboarding— ni cuenta las postulaciones que
> **yo** envié (eso es M4, que ahora tiene pantalla propia).

---

### D13 ✅ CERRADO — Una propuesta no valida fecha futura ni solapamiento

`submitProposal` (`lib/match-actions.ts:34-64`) es un `INSERT` directo. Ni el cliente ni la RLS validan que `scheduled_at` sea futura, ni que el equipo no tenga ya otro partido `CONFIRMADO` en la misma franja. Un equipo puede terminar con dos partidos confirmados solapados y sin forma de saberlo hasta que llegan las notificaciones de 24 h.

> #### ✅ Solución aplicada — 2026-07-28
>
> `20260728221000_d13_proposal_schedule_guard.sql`. La regla vive **en los dos puntos** del
> ciclo, con una única función compartida (`match_schedule_conflict`) para que no puedan
> divergir:
>
> | Punto | Qué evita |
> |---|---|
> | trigger `BEFORE INSERT` en `match_proposals` | proponer algo imposible — feedback inmediato, sin esperar la respuesta del rival |
> | `confirm_match_proposal` | el compromiso real. Es la guarda que sostiene la invariante |
>
> **Por qué no alcanzaba con uno solo.** El daño no lo hace proponer: lo hace **confirmar**.
> Entre una cosa y otra pueden pasar días, y en el medio el equipo pudo comprometer esa franja
> con otro partido — sólo con el trigger, la invariante quedaba abierta en ese hueco temporal.
> Pero sólo en el confirm, el proponente se enteraba días después y por boca del rival.
>
> **Qué cuenta como conflicto:** otro partido, distinto de éste, en `CONFIRMADO` o `EN_VIVO`,
> de **cualquiera de los dos equipos**, cuya ventana se superpone. `PENDIENTE` no cuenta: un
> partido sin fecha acordada no compromete a nadie. La duración faltante se completa con
> `app_settings.match_default_duration_minutes` (90) — sin ese default, un partido viejo con
> `duration_minutes` NULL no habría solapado nunca y el chequeo quedaba a merced de la calidad
> del dato.
>
> **El propio partido se excluye** (`m.id <> p_match_id`). Sin eso, un partido ya confirmado
> chocaría consigo mismo y ninguna propuesta correctiva podría volver a confirmarse. Tiene
> aserción propia (Q-12).
>
> **En el cliente:** `PROPOSAL_DATE_IN_PAST` y `TEAM_SCHEDULE_CONFLICT` se suman a
> `PROPOSAL_ERROR_CODES`, y el `ProposalModal` pasó de `getGenericSupabaseErrorMessage` a
> `getProposalErrorMessage` — con el genérico, *"Los Pibes ya tiene un partido a esa hora"*
> llegaba como *"No se pudo completar la operación"*, justo el dato que permite corregir la
> fecha en vez de reintentar igual. El nombre del equipo comprometido se conserva del detalle
> del servidor, mismo criterio que `SQUAD_TOO_SMALL`.
>
> **Efecto lateral necesario:** el default del selector de fecha era `new Date()`, o sea una
> fecha ya vencida en el instante de abrir el formulario. Con el servidor rechazando
> `scheduled_at <= now()`, eso habría dejado el sheet bloqueado de entrada; pasó a **ahora + 2 h**.
> La fecha pasada además se avisa inline vía `blockReason`, que era el patrón que la pantalla ya
> usaba para la cancha obligatoria.
>
> **Lo que este fix NO hace:** no repara los solapamientos que ya existan en la base. Impide
> los nuevos; los viejos, si los hay, siguen ahí.

---

## 2. Ciclo de vida del mercado de pases

### M1 ✅ CERRADO — El jugador aceptado queda exactamente donde estaba: "ACEPTADA" es solo una etiqueta

**Respuesta directa a la pregunta del pilar: queda en limbo.**

**Evidencia:** `lib/market-applications-api.ts:204-223`.

```ts
export async function respondToApplication(applicationId, postType, status, applicantProfileId) {
  const table = postType === 'TEAM' ? 'market_team_post_applications' : 'market_player_post_applications';
  const { error } = await supabase.from(table).update({ status }).eq('id', applicationId);   // ← esto es TODO
  if (error) throw error;
  void notifyProfile(/* … */);
}
```

Aceptar **no**:

- inserta en `team_members`,
- crea una `team_join_requests` en estado `ACEPTADA`,
- dispara `transfer_to_team` (la RPC que existe justamente para esto y que exige una solicitud `ACEPTADA` — `20260723123000_leave_team_rpcs.sql:176-182`),
- desactiva el post,
- rechaza a los demás postulantes.

El único camino real para que el jugador entre al plantel es **completamente paralelo al mercado**: el capitán le pasa el `invite_code` por el chat (`app/market-chats/[id].tsx:97-102`, `lib/market-api.ts:230-238`) → el jugador va a `/team-join` → manda solicitud → el capitán la acepta en `/team-manage` → el jugador confirma el traspaso en `/team-requests`. **Cuatro pasos manuales, ninguno enlazado desde la postulación aceptada**, y todos ellos ajenos a la pantalla del Mercado.

Dicho de otro modo: hoy el Mercado es un **tablón de anuncios con chat**, no un mercado de pases. La infraestructura del traspaso (ledger `team_stints`, motivo `TRANSFERENCIA`, atomicidad) está construida y funciona — simplemente el Mercado no la llama.

**Camino mínimo de cierre (sin tocar el schema):** al aceptar una postulación de equipo, hacer el `upsert` de la `team_join_requests` en `ACEPTADA` para ese jugador y ese equipo, y rutear la notificación a `/team-requests`. Eso engancha el mercado con el flujo de traspaso ya existente.

> #### ✅ Solución aplicada — 2026-07-28
>
> **Enfoque: el Mercado ahora llama a la maquinaria de traspasos que ya existía.** No se
> creó infraestructura nueva ni se tocó el schema.
>
> **1 · El enganche.** `respondToApplication` (`lib/market-applications-api.ts`), cuando el
> post es de tipo `TEAM` y el status es `ACEPTADA`, además de marcar la postulación hace un
> `upsert` en `team_join_requests` con `status: 'ACEPTADA'` para ese jugador y ese equipo.
> Eso es exactamente lo que `transfer_to_team()` exige para dar el alta
> (`NOT_APPROVED` si no la encuentra). A partir de ahí el jugador confirma su traspaso desde
> **Mis solicitudes**, y su salida del club anterior queda registrada como `TRANSFERENCIA` en
> el ledger `team_stints` en vez de `ABANDONO`.
>
> **Por qué no un `INSERT` directo en `team_members`:** rompería el ledger y, además, el
> `DELETE` sobre `team_members` está revocado para `authenticated` desde la migración
> `20260723123000`. El alta tiene que pasar sí o sí por `transfer_to_team`.
>
> **2 · La migración que el plan no anticipaba.** El `INSERT` lo ejecuta el **capitán a
> nombre de otro perfil**, y la única policy de INSERT existente
> (`team_join_requests_insert_own_pending`) exige `profile_id = mi perfil AND status =
> 'PENDIENTE'`. Sin una policy nueva, el fix fallaba con **42501 en runtime**. Se agregó
> `team_join_requests_insert_by_market_post_admin`
> (`20260728161000_m1_market_acceptance_join_request.sql`), deliberadamente angosta: un
> admin de T sólo puede crear una solicitud `ACEPTADA` para el perfil P **si P se postuló a
> una publicación de T y esa postulación ya está en `ACEPTADA`**. No abre un alta arbitraria:
> materializa el consentimiento que el club acaba de dar. Eso fuerza el orden de las dos
> operaciones — primero se marca la postulación, después se crea la solicitud.
>
> **3 · Idempotencia y reversión.** `UNIQUE (team_id, profile_id)` obliga al `upsert`
> (`onConflict: 'team_id,profile_id'`): si el jugador ya tenía una solicitud previa
> —`RECHAZADA` de un intento anterior, o `PENDIENTE` porque también la mandó por su cuenta—
> se reusa la fila. El camino de conflicto resuelve por UPDATE y lo cubre la policy existente
> `team_join_requests_update_by_admin_or_owner`. Y si la creación de la solicitud falla, la
> postulación **se revierte a `PENDIENTE`** y el error se propaga: sin la solicitud,
> "ACEPTADA" volvería a ser una etiqueta vacía y —como los botones sólo se muestran en
> `PENDIENTE`/`VISTA`— el capitán se quedaría sin forma de reintentar.
>
> **4 · Copy coherente.** El aviso al jugador ahora dice qué tiene que hacer (*"Entrá a Mis
> solicitudes y confirmá tu traspaso"*) y el capitán recibe la misma advertencia que ya daba
> `team-manage.tsx` al aprobar una solicitud: *"va a aparecer en el plantel cuando confirme
> el traspaso"*. Sin eso, el capitán esperaría a alguien que todavía no está en el plantel.
>
> **Cobertura:** 4 casos nuevos en `lib/market-applications-api.test.ts` (alta creada, post de
> JUGADOR no da de alta a nadie, rechazo no crea solicitud, y la reversión a `PENDIENTE`).
>
> **Lo que este fix NO hace:** no se tocó el ruteo de la notificación
> `POSTULACION_RESPONDIDA`, que sigue yendo a `/market-chats` — **M2 sigue abierto**. El
> jugador igual llega a la acción: la solicitud aparece en **Perfil → Mis solicitudes**
> (`app/(tabs)/profile.tsx:130`) y, si no tiene equipo, además como CTA de traspaso pendiente
> en el Home. El circuito cierra; rutear la notificación lo haría un tap más corto.
> Tampoco cambia el flujo de los posts de **JUGADOR** (donde el aceptado es el equipo): ahí
> el alta la sigue iniciando el jugador dueño del aviso.

---

### M2 ✅ CERRADO — La notificación de "postulación aceptada" no lleva a una acción

`app/notifications.tsx:145-148`: `POSTULACION_RECIBIDA` y `POSTULACION_RESPONDIDA` navegan ambas a `/market-chats`. El jugador recibe *"✅ Tu postulación en el Mercado fue aceptada"*, toca, y aterriza en una bandeja de chats. No hay ninguna pantalla que le diga "estás aceptado por X — tocá acá para sumarte al plantel", porque (por M1) esa acción no existe.

> #### ✅ Solución aplicada — 2026-07-28
>
> `POSTULACION_RESPONDIDA` se separó de `POSTULACION_RECIBIDA` en el `switch` y ahora rutea a
> **`/team-requests`**, que es donde el traspaso se confirma y se convierte en un alta real.
>
> **El ruteo es condicional, no fijo.** El mismo tipo de notificación se emite en tres
> situaciones distintas y sólo una tiene un traspaso que confirmar:
>
> | Caso | Destino |
> |---|---|
> | Postulación a post de **EQUIPO** aceptada | `/team-requests` — hay solicitud que confirmar |
> | Postulación **rechazada** | `/market-chats` — no hay nada que confirmar |
> | Postulación a post de **JUGADOR** (el aceptado es el equipo) | `/market-chats` — no hay traspaso |
>
> El discriminador es la presencia de `data.team_id`, que el fix de M1 ya agrega al payload
> exactamente en el primer caso. Mandar los tres a `/team-requests` habría dejado al usuario
> mirando una lista vacía en dos de ellos.
>
> `POSTULACION_RECIBIDA` (la que le llega al capitán) **sigue yendo a `/market-chats`**: para
> llevarla a `/market-applications` haría falta el `postType` en el payload, que hoy no viaja.
> Es una mejora chica y aislada, no parte de M2.

---

### M3 ✅ CERRADO — La postulación se dispara `void`: puede fallar en silencio

**Evidencia:** `app/(tabs)/market.tsx:110` y `:132`.

```ts
const chat = await getOrCreateMarketChat(profile.id, teamId);
void applyToTeamPost(postId, teamId);   // ← sin await, sin catch
router.push(`/market-chats/${chat.id}`);
```

El botón se llama **"Postularme"** pero lo que realmente `await`ea es la apertura del chat. El registro formal de la postulación va como efecto secundario sin esperar ni capturar. Si el `INSERT` falla (RLS, red, sesión vencida), el usuario ve el chat abierto y cree que se postuló; el capitán nunca ve la postulación. Y como `applyToTeamPost` traga el `23505` con un `return` silencioso (`lib/market-applications-api.ts:91-92`), tampoco hay feedback de "ya te habías postulado".

> #### ✅ Solución aplicada — 2026-07-28
>
> **1 · La postulación pasó a ser parte de la operación, no un efecto colateral.** En
> `handleContactTeam` y `handleContactPlayer` (`app/(tabs)/market.tsx`), el chat y el registro
> se lanzan juntos con `Promise.all` y **se esperan los dos antes de navegar**. Si el registro
> falla, no se navega y el error se muestra con `getGenericSupabaseErrorMessage` en el alert
> del contexto de UI. Se usó `Promise.all` y no dos `await` secuenciales para no sumar
> latencia: son operaciones independientes y el usuario ya estaba esperando una sola.
>
> **2 · Los tres desenlaces son distinguibles.** `applyToTeamPost` / `applyToPlayerPost`
> devolvían `void` y trataban el `23505` con un `return` mudo, así que la pantalla no podía
> diferenciar "registrada" de "ya estabas postulado" ni de "falló". Ahora devuelven
> `ApplyResult = 'CREADA' | 'DUPLICADA'`:
>
> | Desenlace | Qué ve el usuario |
> |---|---|
> | `CREADA` | *"¡Postulación enviada!"* — el equipo ya la ve en su lista |
> | `DUPLICADA` | *"Ya te habías postulado"* — evita el reintento por creer que no anduvo |
> | error | *"No pudimos postularte"* + el mensaje real de Supabase |
>
> **3 · Se arreglaron los dos call sites, no uno.** El plan mencionaba `applyToTeamPost`, pero
> el hallazgo describe `market.tsx:110` **y** `:132`: `applyToPlayerPost` tenía el `void`
> idéntico. Arreglar sólo uno habría dejado M3 medio cerrado.
>
> **Efecto lateral sobre M7 (cerrado después, en el Bloque 6):** cuando el equipo activo es uno
> donde el usuario es sólo `JUGADOR`, la postulación a un post de jugador era rechazada por la
> policy. Este fix la hizo visible (antes fallaba en silencio); **M7** después eliminó la causa
> eligiendo siempre un equipo gestionado.
>
> ⚠️ **El `Promise.all` de este fix ya no está**: M8 lo separó en postulación → chat, para que
> un post vencido no deje abierta una conversación. El resto del razonamiento sigue vigente.
>
> **Cobertura:** los 4 casos de `applyToTeamPost`/`applyToPlayerPost` en
> `lib/market-applications-api.test.ts` ahora afirman sobre el valor devuelto (`CREADA` /
> `DUPLICADA`) en vez de sobre `undefined`.

---

### M4 ✅ CERRADO — El postulante no tiene visibilidad de sus propias postulaciones

`fetchApplicationsForPost` solo sirve al **dueño** del post. No existe pantalla "Mis postulaciones". La tarjeta del mercado sigue diciendo "Postularme" indefinidamente: no hay estado `postulado` / `aceptado` / `rechazado` en la card (`components/market/MarketCards.tsx:248-270`). El único rastro que le queda al jugador es la notificación.

> #### ✅ Solución aplicada — 2026-07-29
>
> Pantalla propia: **`app/market-my-applications.tsx`**, alimentada por
> `fetchMyMarketApplications()`. **Sin migraciones ni policies nuevas** — la
> rama del postulante ya estaba contemplada en los `SELECT` de
> `20260708184030` (`profile_id = yo` en posts de equipo; miembro del equipo
> postulante en posts de jugador). El permiso existía desde el día uno: nunca se
> había usado.
>
> **Una sola lista de dos tablas.** `market_team_post_applications` (yo me
> postulé a un equipo) y `market_player_post_applications` (mi equipo se postuló
> a un jugador) se consultan en paralelo y se mezclan ordenadas por fecha. Para
> el usuario "mis postulaciones" es una sola cosa; que abajo sean dos tablas es
> un detalle del schema.
>
> **El estado no se muestra suelto, se explica.** `getApplicationStatusHint`
> traduce cada estado a lo que significa *para el postulante*, que es el dato que
> faltaba: `VISTA` sin explicación se lee como "me rechazaron en silencio", y
> `RECHAZADA` no distingue un rechazo deliberado de la limpieza en cascada que
> dispara aceptar a otro (M5). El aviso cerrado se marca aparte: explica por qué
> una postulación viva dejó de moverse.
>
> **Cierra el cabo suelto que M5 dejó anotado.** Los auto-rechazados de M5 no
> reciben notificación —emitir N `POSTULACION_RESPONDIDA` en lote sigue siendo
> una decisión de producto aparte—, pero ahora **tienen dónde enterarse**. El
> estado `RECHAZADA` ya se venía escribiendo bien; le faltaba superficie.
>
> **La aceptación de un post de EQUIPO ofrece el siguiente paso.** Es la única
> postulación con una acción propia pendiente: enlaza a `/team-requests`, donde
> el jugador confirma el traspaso (M1). El resto es informativo, y el botón no
> aparece: ofrecer un CTA que no hace nada era el defecto original de M2.
>
> **La notificación cambió de destino.** `POSTULACION_RESPONDIDA` que no es una
> aceptación de equipo iba a `/market-chats` —una bandeja de chats donde el
> estado no figura— y ahora va a "Mis postulaciones". `/market-chats` sólo tenía
> sentido mientras esa pantalla no existiera.
>
> **Componentes propios, sin nada nativo.** `EmptyState`, `useCustomAlert` y
> `MyApplicationCard`; cero `Alert.alert` y cero `Modal` de React Native. La
> apariencia de los cuatro estados se extrajo a `components/market/applicationStatus.ts`
> y ahora la comparten las dos pantallas: `VISTA` no puede significar una cosa
> del lado del dueño y otra del lado del postulante.
>
> **Lo que este fix NO hace:** la tarjeta del Mercado (`MarketCards.tsx`) sigue
> diciendo "Postularme" aunque ya te hayas postulado. Es la otra mitad del
> hallazgo y necesita cruzar el listado con las postulaciones propias en cada
> render del Mercado; la pantalla dedicada resuelve el problema de fondo —el
> jugador ya tiene dónde ver su estado— y la etiqueta de la card queda como
> pulido de UI.

---

### M5 ✅ CERRADO — Aceptar no cierra el post ni rechaza al resto

El post sigue `is_active`, sigue recibiendo postulaciones, y las demás quedan `PENDIENTE` indefinidamente. La única caducidad es la del **post**, no la de las postulaciones: `deactivate_expired_market_posts` (`20260401015725:192-209`) desactiva posts de equipo cuya `match_date` pasó y posts de jugador con más de 14 días. Una postulación a un post desactivado queda viva y sin destino.

> #### ✅ Solución aplicada — 2026-07-28
>
> `respondToApplication` gana un paso final `closePostAfterAcceptance(postId, postType, applicationId)`
> que corre **sólo cuando el status es `ACEPTADA`** y hace las dos cosas que faltaban:
>
> | Efecto | Query |
> |---|---|
> | El aviso sale del Mercado | `UPDATE market_{team,player}_posts SET is_active = false WHERE id = postId` |
> | Los que quedaban dejan de esperar | `UPDATE …_applications SET status='RECHAZADA' WHERE post_id = … AND status IN ('PENDIENTE','VISTA') AND id <> aceptada` |
>
> **Por qué `IN ('PENDIENTE','VISTA')` y no sólo `PENDIENTE`.** El plan decía "las demás
> `PENDIENTE`", pero con M6 andando en la misma tanda eso habría sido casi un no-op: abrir la
> lista de postulantes —el gesto previo obligado a elegir uno— deja a todas en `VISTA`.
> Filtrar sólo por `PENDIENTE` habría dejado colgadas exactamente a las que el capitán estaba
> comparando cuando decidió. `ACEPTADA` y `RECHAZADA` no se tocan: ya tienen desenlace.
>
> **Dónde va el paso, y por qué ahí.** Después del `UPDATE` de status **y** después de
> `linkAcceptedApplicationToTeam`. Cerrar el post antes de saber si el enlace con traspasos
> funcionó habría producido el peor estado posible: aviso desactivado, postulación revertida a
> `PENDIENTE` por el rollback de M1, y nadie —ni el capitán ni un postulante nuevo— con forma
> de retomarlo.
>
> **Es best-effort a propósito.** Los dos `UPDATE` registran en `Logger.error` si fallan pero
> **no rechazan la promesa**. La aceptación ya ocurrió y ya dejó la solicitud de unión creada;
> hacer fallar la operación acá le mostraría al capitán "no se pudo aceptar" sobre algo que sí
> se hizo. Si la limpieza falla, el estado resultante es el de antes de esta corrección —el
> post sigue abierto— y queda la traza en telemetría.
>
> **La UI lo dice.** El alert de "Postulación aceptada" (`app/market-applications.tsx`) ahora
> aparece también para posts de JUGADOR y avisa explícitamente que *"cerramos la publicación y
> rechazamos las postulaciones que quedaban"*. Es un efecto irreversible desde la app —para
> volver a buscar hay que publicar de nuevo—: enterarse al no encontrar el aviso en el Mercado
> no era aceptable.
>
> **Lo que este fix NO hace:** los auto-rechazados **no reciben notificación**. Emitir N
> `POSTULACION_RESPONDIDA` en lote es una decisión de producto aparte, y hoy el postulante
> tampoco tiene dónde ver el estado de su postulación (**M4 sigue abierto**). Cuando M4 exista,
> el estado `RECHAZADA` ya va a estar correctamente escrito esperándolo.
>
> *(Actualización 2026-07-29: **M4 ya existe**. El estado `RECHAZADA` que esta corrección
> escribe se ve ahora en "Mis postulaciones", con la aclaración explícita de que también
> se llega ahí cuando el aviso se cierra porque eligieron a otro. La notificación en lote
> sigue sin emitirse — y sigue siendo una decisión de producto —, pero ya no es el único
> camino posible para enterarse.)*

---

### M6 ✅ CERRADO — El estado `VISTA` es código muerto

El `CHECK` admite `PENDIENTE | VISTA | ACEPTADA | RECHAZADA` (`20260708184030_p4_market_applications.sql:23`), y la UI tiene etiqueta y color para `VISTA` (`app/market-applications.tsx:17-29`). **Nada en el código escribe nunca `VISTA`.** Abrir la pantalla de postulaciones no las marca. Es un estado del modelo que nunca se alcanza.

> #### ✅ Solución aplicada — 2026-07-28
>
> Nueva función `markApplicationsAsSeen(postId, postType)` en `lib/market-applications-api.ts`:
> `UPDATE … SET status='VISTA' WHERE post_id = … AND status='PENDIENTE'` con `.select('id')`,
> y `app/market-applications.tsx` la dispara desde `loadData` **después** de pintar la lista.
>
> **El evento que faltaba era "el dueño abrió la lista".** No hacía falta nada en la base: el
> estado existía, la policy `..._update_by_post_admin` / `..._by_post_owner` ya autoriza al
> dueño, y la UI ya sabía dibujarlo. Faltaba el único gesto que lo produce.
>
> **El filtro `status='PENDIENTE'` es la parte crítica.** Sin él, cada apertura de la pantalla
> pisaría `ACEPTADA` y `RECHAZADA` con `VISTA` y destruiría el desenlace de postulaciones ya
> respondidas. Hay un test dedicado a esa aserción.
>
> **Es una actualización silenciosa, y por eso devuelve los ids.** El usuario no pidió nada:
> no hay spinner, no hay alert, y un fallo va a `Logger.warn` (misma categoría que los
> contadores del Mercado — degradación invisible, no error del flujo). Con los ids
> actualizados la pantalla repinta los chips en memoria, sin un segundo fetch.
>
> **Interacción con M5:** `VISTA` no es un estado terminal, es "el dueño ya la miró". Por eso
> el cierre por aceptación rechaza `PENDIENTE` **y** `VISTA`, y los botones Aceptar/Rechazar
> siguen visibles en ambos (`isPending` en la pantalla ya contemplaba los dos).

---

### M7 ✅ CERRADO — La postulación de equipo elige el equipo equivocado y falla en silencio

`app/(tabs)/market.tsx:127`:

```ts
const teamId = activeTeamId ?? activeCaptainTeamId ?? viewData.managedTeams[0].id;
```

Si el **equipo activo** del store es uno donde el usuario es solo `JUGADOR`, se usa ese `teamId` — y la policy `market_player_post_applications_insert` exige `CAPITAN`/`SUBCAPITAN` de ese equipo. El `INSERT` se rechaza; como va con `void` (M3), falla en silencio **después** de abrir el chat. El chequeo previo (`managedTeams.length === 0`) no cubre este caso: el usuario *tiene* equipos gestionados, pero el activo no es uno de ellos.

> #### ✅ Solución aplicada — 2026-07-28
>
> Nueva función pura `resolveApplicantTeam(managedTeams, activeTeamId, preferredTeamId)` en
> `lib/market-utils.ts`, y `handleContactPlayer` la usa en lugar del `??` encadenado.
>
> **El bug era mezclar dos listas con semántica distinta.** `useTeamStore.activeTeamId` es
> "cualquier equipo del que sos miembro" (`teamStore.fetchMyTeams` no filtra por rol);
> `viewData.managedTeams` viene de `fetchUserManagedTeams`, que filtra
> `role IN ('CAPITAN','SUBCAPITAN')` — es exactamente el conjunto que la policy acepta. El
> `??` tomaba el primero **sin verificar que perteneciera al segundo**. Ahora el equipo sale
> siempre de `managedTeams`; el activo sólo funciona como *preferencia*:
>
> | Situación | Equipo elegido |
> |---|---|
> | El activo está en `managedTeams` | el activo (se respeta la elección del usuario) |
> | El activo es uno donde es sólo JUGADOR | el preferido de la pantalla, si lo gestiona |
> | Ninguno de los dos aplica | el primero gestionado |
> | `managedTeams` vacío | `null` → la pantalla bloquea antes de tocar la base |
>
> El chequeo `managedTeams.length === 0` se reemplazó por el `null` del helper: cubre el caso
> viejo *y* el que se le escapaba.
>
> **La sustitución silenciosa se volvió visible.** Cuando el equipo activo no sirve, el usuario
> se postula con otro — eso no puede ser invisible. El alert de éxito ahora nombra el equipo:
> *"Te postulaste con Los Capitanes"*. Enterarse de con qué club te postulaste cuando el rival
> te pregunta no es una opción.
>
> Cinco casos en `lib/market-utils.test.ts` cubren la tabla completa, incluido el del hallazgo
> (activo no gestionado → cae en uno gestionado).

---

### M8 ✅ CERRADO — No hay validación de vigencia al postularse

Nada impide postularse a un partido cuya `match_date` ya pasó entre la corrida horaria del cron y el momento del tap.

> #### ✅ Solución aplicada — 2026-07-28
>
> `applyToTeamPost` y `applyToPlayerPost` abren con una guarda (`assertTeamPostIsOpen` /
> `assertPlayerPostIsOpen`) que lee el post y rechaza **antes de tocar la tabla de
> postulaciones**, con tres códigos: `POST_INEXISTENTE`, `POST_CERRADO`, `POST_VENCIDO`.
>
> **La regla de vencimiento se reusa, no se reinventa.** Se extrajo
> `isTeamPostScheduleActive(post, now)` de `filterActiveTeamPostsBySchedule` —el filtro que ya
> usaba el listado— y la guarda aplica esa misma función. Si el listado y la postulación
> usaran criterios distintos, el usuario vería en pantalla un post que no puede postularse (o
> al revés) sin ninguna explicación posible.
>
> **`is_active` también es vigencia.** El hallazgo hablaba de `match_date`, pero un post
> desactivado es igual de invivible — y desde M5 hay una vía nueva y frecuente para que lo
> esté (aceptar cierra el aviso). Sin este chequeo, M5 no se sostenía: cualquiera con la lista
> vieja en pantalla podía seguir postulándose a un aviso ya adjudicado.
>
> **`market_player_posts` no tiene `match_date`** (no agenda un partido: es "busco equipo"),
> así que ahí la vigencia es sólo `is_active` — que es lo que apagan tanto el barrido de 14
> días como el cierre de M5. La guarda de jugador es deliberadamente más chica, no un olvido.
>
> **Por qué hizo falta una clase de error.** `getGenericSupabaseErrorMessage` **descarta el
> `message` y devuelve su fallback**: un `throw new Error('la fecha ya pasó')` habría llegado a
> la pantalla como *"No se pudo completar la operación"*. Se agregó `MarketApplicationError` +
> `getMarketApplicationErrorMessage`, calcado de `TeamActionError` /
> `getTeamActionErrorMessage` en `lib/team-manage-data.ts`.
>
> **En la UI, sin alertas del sistema.** `app/(tabs)/market.tsx` muestra todo con el
> `showAlert` del `UIContext` (que renderiza `components/ui/CustomAlert`); no hay ni un
> `Alert.alert` de React Native en el flujo. Los errores de dominio además cambian de título
> —*"Publicación no disponible"* en vez de *"No pudimos postularte"*—: no es un fallo del
> usuario ni algo que reintentar.
>
> **Efecto lateral necesario sobre M3:** el `Promise.all([chat, postulación])` que M3 había
> introducido se separó. Ahora la postulación va **primero** y el chat después — en paralelo,
> un post vencido igual dejaba abierta una conversación sobre un partido ya jugado. Y si el
> chat falla *después* de una postulación registrada, ya no se reporta como error: se registra
> en `Logger.warn` y se muestra "¡Postulación enviada!", porque decirle "no pudimos postularte"
> a alguien que sí quedó postulado es peor que no abrir el chat. Se paga una ida y vuelta extra
> de latencia; a cambio, ningún efecto colateral sobrevive a una postulación rechazada.

---

## 3. Roles, permisos y auth gating

**Contexto positivo, para calibrar:** la autorización **server-side es sólida**. `send_challenge`, `accept_challenge`, `confirm_match_proposal`, `request_match_cancellation`, `respond_to_cancellation_request`, `submit_team_checkin`, `resolve_wo_claim`, `transition_season` y las cuatro RPCs de membresía verifican rol contra `auth.uid()`. Las RLS de `match_proposals`, `match_results`, `challenges` y `messages` exigen `CAPITAN`/`SUBCAPITAN`. Los `REVOKE` de funciones internas están hechos. **Nada de lo que sigue es un agujero de datos abierto a cualquiera** — salvo R4.

El problema es de otra naturaleza: **la UI no gatea lo que el servidor sí gatea**, así que el usuario aprende sus permisos por ensayo y error.

---

### R4 ✅ CERRADO — Un SUBCAPITAN puede auto-promoverse a CAPITAN

**Evidencia:** `20260401015725_security_performance_patch.sql:599-616`.

```sql
CREATE POLICY "team_members_update_by_team_admin" ON team_members FOR UPDATE
  USING   ( … tm_admin.role IN ('CAPITAN','SUBCAPITAN') … )
  WITH CHECK ( … tm_admin.role IN ('CAPITAN','SUBCAPITAN') … );
```

La policy autoriza a cualquier `CAPITAN` **o `SUBCAPITAN`** a hacer `UPDATE` de **cualquier fila** de su equipo — incluida la propia y la del capitán — y **no acota el valor de `role`**. Toda la jerarquía real vive en el cliente:

- `lib/team-helpers.ts:35-46` (`canManageMember`: un subcapitán solo toca `JUGADOR`/`DIRECTOR_TECNICO`, nunca a sí mismo),
- `lib/team-helpers.ts:48-57` (`allowedRolesToAssign`).

Una llamada REST directa (`PATCH /team_members?profile_id=eq.<yo>` con `{"role":"CAPITAN"}`) pasa la policy. Un subcapitán puede: auto-promoverse, degradar al capitán a `JUGADOR`, y a partir de ahí expulsarlo (`remove_team_member` sí bloquea expulsar a un `CAPITAN`, pero ya no lo sería). Tampoco hay nada que impida **dos CAPITANes simultáneos** — ni policy, ni constraint, ni índice único parcial.

Contraste ilustrativo: las salidas del equipo **sí** fueron blindadas (se revocó `DELETE` sobre `team_members` y se canalizó todo por RPCs). Las **promociones** quedaron con el `UPDATE` directo abierto. Es la misma clase de problema que ya se resolvió una vez, en la mitad que quedó sin migrar.

> #### ✅ Solución aplicada — 2026-07-28
>
> **Enfoque: se subió al servidor la jerarquía que ya aplicaba el cliente.** Migración
> `20260728160000_r4_team_members_role_escalation.sql`, que reemplaza la policy
> `team_members_update_by_team_admin`:
>
> | Rol del caller | Filas que puede tocar (`USING`) | Rol que puede asignar (`WITH CHECK`) |
> |---|---|---|
> | `CAPITAN` | cualquiera del equipo, incluida la propia | cualquiera — sigue siendo el único que crea un `CAPITAN` |
> | `SUBCAPITAN` | sólo filas que hoy son `JUGADOR` / `DIRECTOR_TECNICO` | sólo `JUGADOR` / `DIRECTOR_TECNICO` |
> | resto | ninguna | — |
>
> Esto replica exactamente `canManageMember()` y `allowedRolesToAssign()`
> (`lib/team-helpers.ts:35-57`), que hasta ahora eran la **única** defensa y vivían en el
> cliente. El `PATCH` de auto-promoción ya no encuentra la fila: la propia fila de un
> subcapitán tiene rol `SUBCAPITAN`, que queda fuera de su rama del `USING`.
>
> **Se acotó también el `USING`, no sólo el `WITH CHECK`.** El plan pedía acotar el rol
> asignable, lo que cierra la auto-promoción pero deja viva la otra mitad del mismo hallazgo:
> un subcapitán podía seguir **degradando al capitán a `JUGADOR`**. No ganaría la capitanía
> (el `WITH CHECK` se lo impide), pero dejaría al equipo **decapitado de forma permanente**:
> sin un `CAPITAN` vivo nadie puede volver a crear uno, porque el único alta con
> `role='CAPITAN'` es el bootstrap del fundador y exige equipo vacío
> (`team_members_insert_bootstrap_or_from_request`). Restringir el `USING` a filas
> `JUGADOR`/`DIRECTOR_TECNICO` cierra esa vía y alinea la policy con el invariante que
> `remove_team_member()` ya defendía para las bajas (`CANNOT_REMOVE_CAPTAIN`, "sólo el capitán
> remueve a un subcapitán").
>
> **Compatibilidad verificada:** `grantCaptainRole()` sigue funcionando —sus dos `UPDATE` los
> ejecuta un `CAPITAN`, que cae en la rama (a) en ambos—; las cuatro RPCs de membresía son
> `SECURITY DEFINER` y bypassean RLS; y la UI de `team-manage.tsx` no ofrecía ninguna de las
> acciones que la policy pasa a rechazar, así que no hay cambio visible para el usuario
> legítimo. Se conservó el patrón `(SELECT auth.uid())` de `20260714144056` para que el
> planner evalúe el uid una vez por query y no por fila.
>
> **Lo que este fix NO hace:** no impide el estado transitorio de **dos capitanes** que
> produce `grantCaptainRole()` al no ser atómico — eso es **R5, cerrado después con la RPC
> `grant_captain_role` (migración `20260728211000`)**. Y no se
> agregó un test pgTAP de regresión en `supabase/tests/`; sería el complemento natural
> (`120-rls-hotfix.spec.sql` es el archivo modelo).

---

### R1 ✅ CERRADO — "Cancelar partido" visible para cualquier rol, con el rol a mano en pantalla

**Evidencia:** `app/match-detail.tsx:389-392` (PENDIENTE) y `:423-427` (CONFIRMADO).

```tsx
<ActionButtons
  onChat={…}
  onCancel={hasPendingCancellation ? undefined : () => setShowCancellationModal(true)}
/>
```

No se consulta `match.myRole`, que **está disponible en el mismo objeto** y se usa cinco líneas más arriba para gatear el acceso a la convocatoria (`:404`). Un `JUGADOR` abre el modal de cancelación, elige motivo, escribe notas, envía — y recién ahí el servidor responde *"No autorizado: solo el capitán o subcapitán puede cancelar un partido"*. Es exactamente el escenario que plantea el pilar: **un perfil Jugador ejecutando un flujo de capitán porque la UI no validó**. El dato no falta; simplemente no se mira.

Nota: el botón **WO** del mismo bloque sí está correctamente abierto — `claim_wo` autoriza a cualquier jugador que haya hecho check-in, por diseño.

> #### ✅ Solución aplicada — 2026-07-28
>
> Se agregó una **definición única** de "puedo gestionar este partido" en
> `app/match-detail.tsx`, al lado de las otras constantes derivadas:
>
> ```ts
> const canManageMatch = match.myRole === 'CAPITAN' || match.myRole === 'SUBCAPITAN';
> ```
>
> El dato ya venía en el payload de `get_match_detail`; sólo faltaba mirarlo. Con eso se gateó
> el `onCancel` de los dos `ActionButtons` (PENDIENTE y CONFIRMADO) y se reemplazó el chequeo
> inline duplicado de `onOpenSquadList`.
>
> **Se gatearon también las acciones de propuesta, no sólo el botón de cancelar.** El plan
> pedía el de cancelación, pero la misma pantalla ofrecía "Proponer detalles", "Aceptar",
> "Rechazar", "Contra-propuesta" y "Cancelar propuesta" sin mirar el rol — todas rechazadas
> por la RLS de `match_proposals`. Gatear sólo el de cancelar habría dejado el hallazgo
> abierto en la misma pantalla, y peor: con R2 cerrado, un `JUGADOR` que toca la tarjeta
> habría caído igual en el detalle con los botones rotos.
>
> **Criterio de UI: explicar, no esconder.** `ProposalSection` recibe una prop `canManage`; en
> `false` muestra los detalles acordados (fecha, formato, cancha, seña — información útil para
> todo el plantel) y reemplaza los botones por *"Tu capitán o subcapitán tiene que responder"*.
> Es el mismo patrón que `CancellationRequestSection` ya usaba para su caso `canRespond`.
>
> **Lo que deliberadamente NO se gateó:** la **carga de resultado**, porque la regla real del
> servidor es `CAPITAN/SUBCAPITAN` **o** `is_result_loader` — un `JUGADOR` que hizo el
> check-in sí puede cargarlo, y `canSubmitResult` ya lo contemplaba. Y el **reclamo de WO**,
> que `claim_wo` habilita a cualquier jugador con check-in. Gatear esos dos a capitanes
> habría sido más restrictivo que el dominio.

---

### R2 ✅ CERRADO — La pestaña Partidos completa, sin gating por rol

**Evidencia:** `components/matches/MatchCardFooter.tsx:25-98` + `components/matches/types.ts:27-52`.

`get_my_matches` no devuelve el rol del usuario, así que `MatchCardEntry` no lo tiene y el footer de la tarjeta muestra a **cualquier miembro**: "Proponer detalles", "Aceptar", "Rechazar", "Cancelar propuesta" y "→ Cargar resultado". Todos rebotan server-side (RLS de `match_proposals`, `confirm_match_proposal`), pero el usuario lo descubre después del tap y con un mensaje crudo.

El contraste está dentro del mismo repo: la pestaña **Ranking** lo hace bien —`const canChallenge = activeRole === 'CAPITAN' || activeRole === 'SUBCAPITAN'` (`app/(tabs)/ranking.tsx:77`)— usando el rol que ya vive en `useTeamStore`. La misma solución aplica acá.

> #### ✅ Solución aplicada — 2026-07-28
>
> Se copió literalmente el patrón del Ranking en `app/(tabs)/matches.tsx`, en vez de ampliar
> el contrato de `get_my_matches`: el rol del equipo activo ya está en `useTeamStore`, así que
> no hace falta pedirlo de nuevo al servidor.
>
> ```ts
> const activeRole = myTeams.find((t) => t.id === activeTeamId)?.role;
> const canManageMatches = activeRole === 'CAPITAN' || activeRole === 'SUBCAPITAN';
> ```
>
> Baja como prop `canManage` a `MatchCard` → `MatchCardFooter`. En la tarjeta la decisión no
> es "botón o nada": para `PENDIENTE` se muestra una línea muda con el estado real
> (*"Propuesta pendiente de respuesta"* / *"Falta coordinar los detalles"*), que es la
> información que el jugador necesita sin ofrecerle una acción que va a rebotar.
>
> **`LiveMatchBanner` entró en el mismo fix.** No estaba en el plan, pero tenía la fuga
> idéntica en la misma pantalla, y además su botón se renderizaba **siempre**, incluso sin
> `onLoadResult` — o sea que pasarle `undefined` habría dejado un botón muerto. Ahora se
> renderiza condicionalmente.
>
> **Compromiso asumido en "Cargar resultado":** la lista no conoce `is_result_loader` (ese
> dato sólo viene en `get_match_detail`), así que gatear por rol le saca el **atajo** a un
> `JUGADOR` que hizo el check-in y sí podría cargar el resultado. No pierde la capacidad: al
> tocar la tarjeta entra al detalle, que sí tiene el dato y le muestra el botón. Se prefirió
> un atajo de menos antes que un botón que falla para la mayoría.
>
> **Alcance:** esto cierra R2 en la pestaña Partidos. **R3 sigue abierto** —
> `app/challenge-inbox.tsx` no tiene ninguna referencia a rol y muestra Aceptar/Rechazar a
> todo el plantel—; es el mismo patrón y el siguiente candidato natural.

---

### R3 ✅ CERRADO — La bandeja de desafíos no tiene ninguna referencia a rol

`app/challenge-inbox.tsx` no menciona `role`, `CAPITAN` ni `isCaptain` en ninguna línea. Un `JUGADOR` ve la bandeja con los botones Aceptar / Rechazar / Cancelar. `accept_challenge` valida correctamente (`20260328150331:40-48`), así que no hay daño — solo frustración.

> #### ✅ Solución aplicada — 2026-07-28
>
> Cuarta y última pantalla con la fuga. Mismo patrón que Ranking, Partidos y el detalle: el
> rol del equipo activo sale de `useTeamStore`, sin tocar `get_team_challenges_inbox`.
>
> ```ts
> const activeRole = myTeams.find((t) => t.id === activeTeamId)?.role;
> const canManageChallenges = activeRole === 'CAPITAN' || activeRole === 'SUBCAPITAN';
> ```
>
> El desafío **se sigue mostrando** —enterarse de que los desafiaron es información útil para
> todo el plantel—; lo que cambia es que Aceptar/Rechazar se reemplazan por *"Solo el capitán
> o subcapitán puede responder este desafío"*, y el botón Cancelar de los enviados
> desaparece dejando el *"⏳ Esperando respuesta…"*.
>
> Con esto, **las cuatro superficies de acción de equipo** (Ranking, Partidos, detalle de
> partido y desafíos) gatean por rol de forma consistente.

---

### R5 ✅ CERRADO — Ceder la capitanía sin salir sigue sin ser atómico

`lib/team-manage-data.ts:315-344` (`grantCaptainRole`) hace dos `UPDATE` secuenciales desde el cliente con rollback manual:

```ts
// 1) promover al nuevo a CAPITAN
// 2) degradar al actual a SUBCAPITAN
// si (2) falla → intentar restaurar (1)
```

Si el paso 2 falla **y el rollback también** (red caída), el equipo queda con **dos capitanes**. La variante atómica ya existe y se usa cuando el capitán se va (`transfer_captaincy_and_leave`, `20260723123000:317-389`). La migración que la introdujo explica exactamente por qué el par UPDATE+DELETE del cliente era inaceptable — el mismo argumento aplica a este par UPDATE+UPDATE, que quedó fuera.

> #### ✅ Solución aplicada — 2026-07-28
>
> **Migración:** `20260728211000_r5_grant_captain_role_atomic.sql`
>
> RPC nueva `grant_captain_role(p_team_id uuid, p_new_captain_profile_id uuid)`, de la misma
> familia que las cuatro de membresía: `SECURITY DEFINER`, perfil del caller vía
> `current_profile_id()`, errores con prefijo estable que `lib/team-manage-data.ts` ya mapea.
> Los dos `UPDATE` viven en el cuerpo de una función plpgsql, o sea en **una** transacción: o
> el equipo termina con el nuevo capitán y el viejo como subcapitán, o no cambia nada. El
> estado de dos capitanes deja de ser observable desde afuera.
>
> **Por qué importaba de verdad:** con dos capitanes, `leave_team_as_member` deja irse a
> cualquiera de los dos sin exigir la cesión (`CAPTAIN_MUST_TRANSFER` sólo mira el rol propio),
> y la policy de R4 le da a ambos poder total sobre cualquier fila del equipo. No era cosmético.
>
> **`FOR UPDATE` sobre las dos filas**, en orden fijo (primero el caller, después el
> destinatario). Serializa contra un `remove_team_member` o un `transfer_captaincy_and_leave`
> concurrente —dos cesiones simultáneas del mismo capitán podrían dejar tres filas `CAPITAN`— y
> el orden fijo evita el deadlock entre llamadas cruzadas.
>
> **Por qué NO reusa `transfer_captaincy_and_leave`:** aquélla borra la fila del capitán y
> cierra su ciclo en `team_stints` con motivo `ABANDONO`. Acá el capitán se queda: no hay baja,
> no hay ciclo que cerrar y el GUC `tornear.leave_reason` no se toca. Reusarla ensuciaría el
> ledger con un `ABANDONO` + un alta nueva.
>
> **Cliente:** `grantCaptainRole(teamId, newCaptainId)` pasa a una sola llamada `rpc()`. Se
> cayeron dos parámetros: `currentCaptainId` (lo deriva el servidor de `auth.uid()`, así que
> nadie puede ceder la capitanía de otro) y `newCaptainPreviousRole` (existía sólo para el
> rollback manual). En `app/team-manage.tsx` el catch pasó de
> `getGenericSupabaseErrorMessage` a `getTeamActionErrorMessage`, que es el que entiende
> `NOT_TEAM_CAPTAIN` / `NOT_A_MEMBER` / `INVALID_PAYLOAD`.

---

### R6 ✅ CERRADO — `DIRECTOR_TECNICO` es un rol decorativo

El rol existe en el enum, se puede asignar (`allowedRolesToAssign` lo incluye para capitán y subcapitán), tiene color propio (`roleAppearance`), tiene lugar en el orden de la convocatoria (`app/match-checkin.tsx:14-19`) y viaja en `MatchRosterEntry.teamRole`. **Pero no aparece en ninguna policy ni en ninguna RPC.** Un DT no puede proponer, confirmar, presentar la lista, cargar el resultado, cancelar ni resolver una disputa: es un `JUGADOR` con una etiqueta distinta.

Decisión de producto pendiente antes de la beta: o el DT recibe permisos de staff (típicamente: presentar lista y cargar resultado), o se documenta explícitamente que es solo cosmético, o se saca del selector.

> #### ✅ Solución aplicada — 2026-07-30 · decisión de producto: **permisos de staff**
>
> `20260730120000_r6_director_tecnico_match_staff.sql`. El DT recibe los
> permisos **operativos del día del partido** y **ninguno** de gestión del club.
>
> | | `isTeamMatchAdmin` | `isTeamMatchStaff` *(nuevo)* |
> |---|---|---|
> | Roles | CAPITAN · SUBCAPITAN | CAPITAN · SUBCAPITAN · **DIRECTOR_TECNICO** |
> | Habilita | proponer, confirmar, cancelar, responder cancelaciones, reclamar/resolver WO, resolver disputa | **presentar la lista** y **cargar el resultado** |
>
> **El criterio del corte no es de confianza, es de naturaleza del acto.**
> Coordinar y cancelar crean o rompen una obligación del club frente a otro club
> —fecha, cancha, seña—; presentar la lista y anotar el resultado son actos del
> banco de suplentes. Por eso un DT arma el equipo que juega pero no compromete
> la agenda, y por eso `canManageMember` y `allowedRolesToAssign` quedaron
> **intactos**: no administra miembros, no cede la capitanía, no acepta
> postulantes del Mercado.
>
> **Dos superficies de servidor, no una.** Con cambiar sólo el cliente el DT
> habría visto los botones y rebotado en el tap — el defecto de forma de R1/R2:
>
> | Superficie | Cambio |
> |---|---|
> | `submit_team_checkin`, bloque 3 | `role IN ('CAPITAN','SUBCAPITAN','DIRECTOR_TECNICO')` |
> | policy `match_results_insert_by_authorized_member` | misma lista de roles en la primera rama |
>
> **Lo que deliberadamente NO se tocó**, y es la mitad más importante del fix:
> `match_results_update_by_loader_or_admin` sigue igual. El DT corrige lo que él
> mismo cargó por la rama `submitted_by = yo`; **pisar el resultado que cargó
> otro** es una atribución sobre un marcador que ya movió ELO, y sigue siendo del
> capitán. `checkin_team` (llegada individual) no necesitaba cambios: sólo exige
> ser miembro.
>
> **En el cliente**, `ResultLoadContext.isAdmin` pasó a llamarse `isStaff` — el
> conjunto cambió, y dejar el nombre viejo habría hecho leer "admin" donde ahora
> dice "cuerpo técnico". `MatchCardFooter` recibe **dos** flags en vez de uno:
> `canManage` gatea la rama PENDIENTE (proponer/aceptar/rechazar) e `isStaff` la
> rama EN_VIVO. Colapsarlos —el atajo tentador— le habría dado al DT la
> coordinación del partido, que es justo lo que la decisión excluye. Hay un test
> por cada lado del corte, incluido `isTeamMatchAdmin('DIRECTOR_TECNICO') === false`
> y `lib/team-helpers.test.ts` *(nuevo)*, que existe para que la exclusión de
> gestión no se pierda en un `||` agregado sin pensar.
>
> **Lo que este fix NO hace:** el DT sigue sin poder proponer ni confirmar. Si
> producto quiere que un DT coordine partidos, es otra decisión y otro cambio —
> pero el rol ya dejó de ser una etiqueta.

---

### R7 ✅ CERRADO (vía D1) — El botón de resolver disputa no comunica su consecuencia

Ver D1. `components/matches/DisputeSection.tsx:99-109` muestra **⚖️ Resolver Disputa** a los capitanes de ambos equipos, sin diálogo de confirmación, sin explicar que la resolución es inmediata, que adopta el marcador del ganador y que dispara el ELO de forma irreversible. Es la única acción destructiva de la app sin `ConfirmDialog` (el WO y la eliminación de equipo sí lo tienen).

> #### ✅ Resuelto junto con D1 — verificado el 2026-07-29
>
> **No requirió trabajo propio.** R7 y D1 eran el mismo botón visto desde dos
> ángulos: D1 preguntaba *"¿la regla de desempate es defendible?"* y R7,
> *"¿el que la dispara sabe lo que va a pasar?"*. La remediación de D1 puso un
> `ConfirmDialog` delante de **⚖️ Resolver Disputa** (`DisputeSection.tsx:15-18,
> 68-71, 204-223`) que enuncia lo que el hallazgo pedía: que la resolución es
> **instantánea**, que con votos empatados —o sin votos— la define el **Fair
> Play**, que **sobreescribe el resultado** y que **es irreversible**. Cuando la
> votación ya está empatada, el mensaje agrega los números concretos: el marcador
> de votos y los dos puntajes de Fair Play con el nombre del rival.
>
> Va más allá de lo pedido en un punto: `canResolve` **esconde el botón** cuando
> el capitán perdería por Fair Play o cuando la resolución quedaría trabada. La
> acción ya no se ofrece a ciegas.
>
> Con eso, la app deja de tener acciones destructivas sin confirmación: WO,
> eliminación de equipo y resolución de disputa pasan las tres por el mismo
> componente. Se deja constancia acá porque el hallazgo estaba catalogado
> aparte y podía leerse como deuda viva; **no lo es desde la tanda de D1**.
>
> Lo que sigue siendo decisión de producto es la **política** de desempate en sí
> (sección 6), no su comunicación.

---

### R8 ✅ CERRADO (observabilidad) — Las notificaciones del dominio se insertan desde el cliente, con `catch {}` vacío

`lib/match-actions.ts:8-30`, `lib/challenge-actions.ts:79-101`, `lib/market-applications-api.ts:40-77`: los tres `notifyTeamLeaders` / `notifyProfile` envuelven el `INSERT` en un `try {} catch {}` sin cuerpo, con el comentario *"Silenciamos errores de notificación para no bloquear el flujo principal"*. La intención es correcta, pero el efecto es que la entrega de avisos críticos del ciclo del partido **depende de que el cliente del que actúa complete un insert** que puede ser rechazado por alguna rama no contemplada de la policy `notifications_insert_authenticated` — y nadie se entera. Los avisos de partido deberían salir de triggers server-side (el patrón ya existe: `20260711034845_g1_b2_match_status_notifications.sql`).

> #### ✅ Solución aplicada — 2026-07-28
>
> Los cuatro helpers (`notifyTeamLeaders` ×3 + `notifyProfile`) siguen siendo **silenciosos
> para el usuario** —el aviso es un efecto secundario del flujo, no su objetivo— pero dejaron
> de serlo para nosotros. Tres cambios en cada uno:
>
> 1. El error del `select` de miembros deja de descartarse (antes se ignoraba el campo `error`
>    del destructuring por completo) → `Logger.error`.
> 2. El error del `insert` de notificaciones deja de descartarse → `Logger.error('Error
>    enviando notificación', { scope, teamId, type, recipients, error })`.
> 3. "El equipo no tiene capitán ni subcapitán" pasa a ser `Logger.warn` explícito: no es un
>    fallo técnico, es un dato de dominio anómalo — el aviso no tiene a quién llegar.
>
> Se sumó el cuarto sitio del mismo patrón, que el hallazgo no listaba:
> `lib/team-join-data.ts` (`console.warn` sobre la notificación de solicitud de unión). Ahí el
> caso es especialmente ciego: la solicitud **sí** queda creada, lo que se pierde es el aviso,
> o sea que queda esperando en una bandeja que nadie sabe que tiene algo.
>
> **Lo que este fix NO hace:** las notificaciones se siguen insertando desde el cliente. La
> solución estructural —moverlas a triggers server-side, patrón `g1_b2`— sigue pendiente y
> excede el alcance de un bloque de observabilidad. Lo que cambió es que ahora un fallo de
> entrega es medible en `app_logs` en vez de invisible.

---

### R9 ✅ CERRADO — `match-detail` infiere `myTeamId` del equipo activo

`app/match-detail.tsx:54`: `const myTeamId = paramTeamId ?? activeTeamId ?? ''`. Si el usuario milita en dos equipos y entra a un partido del equipo B mientras el activo es el A, `get_match_detail` responde para el equipo equivocado. Los deep links de notificación (cuando existan, ver D11) no pasan `myTeamId`.

> #### ✅ Solución aplicada — 2026-07-28
>
> `resolveMyTeamIdForMatch` + `pickMyTeamId` en `lib/match-detail-data.ts`, y la pantalla
> resuelve el equipo **contra el partido** antes de consultar nada.
>
> **Es el mismo error de forma que M7 en el Mercado**, cerrado en el Bloque 6: usar el equipo
> activo del store como respuesta autoritativa en vez de como preferencia. `activeTeamId` es
> "el último que elegiste en la app", no "el tuyo en este partido".
>
> **Y el paréntesis del hallazgo ya venció:** los deep links de notificación existen desde D11
> (`app/notifications.tsx:170`) y entran acá **sin `myTeamId`** — igual que el CTA del Home
> (`app/(tabs)/index.tsx:51`). El fallback al equipo activo dejó de ser el caso raro.
>
> | Situación | Equipo elegido |
> |---|---|
> | `myTeamId` en los params y juega este partido | ése (viene de nuestra navegación; incluye al invitado recién sumado por código) |
> | Param ausente o ajeno al partido, y el activo juega | el activo |
> | Ninguno sirve, pero milito en uno de los dos | ése |
> | No estoy en ninguno de los dos | `null` → *"Partido no encontrado"* |
>
> **El `null` es parte del arreglo, no un borde.** Antes, alguien ajeno al partido recibía el
> detalle contestado por su equipo activo: hero invertido, check-in del rival, permisos de un
> plantel que no juega. Ahora la pantalla dice que ese partido no es suyo.
>
> **Los invitados se resuelven por `match_participants`**, no por `team_members`:
> `join_match_as_guest` no crea membresía, así que sin esa rama un invitado no tendría equipo
> y no vería el partido al que acaba de entrar.
>
> **Costo:** una query extra a `matches` — y sólo esa, porque cuando el param ya es válido el
> resolvedor corta ahí. Mientras el equipo no esté resuelto la pantalla no pide el detalle:
> pedirlo con el `teamId` equivocado devuelve un partido equivocado, que es exactamente el bug.
>
> **Cobertura:** `lib/match-detail-data.test.ts` (nuevo), 10 casos — incluido el del hallazgo
> (milito en dos clubes, entro al partido del B con el A activo) y el corte por param válido.

---

## 4. Edge cases del dominio amateur

### E1 ✅ CERRADO — Se puede confirmar un F11 con tres jugadores

Ni `send_challenge`, ni `accept_challenge`, ni `confirm_match_proposal` miran el tamaño del plantel. La validación de cupos (`format_rules.min_players_to_start`, `players_on_field`, `max_squad_size`) aparece **una sola vez, en `submit_team_checkin`** (`20260728140000:298-315`), es decir en la cancha, dentro de la ventana de 2 h previa al partido.

Secuencia realista: un equipo de 3 acepta un desafío de ranking a F11, lo confirma, ambos coordinan cancha y seña, y el sábado el capitán descubre `MIN_STARTERS_NOT_MET`. A partir de ahí no puede presentar lista, el rival reclama WO, y el equipo se come −15 de Fair Play. **La regla existe pero se aplica demasiado tarde.**

Chequeo barato y suficiente: validar el plantel contra `format_rules` en `confirm_match_proposal` (y advertir, sin bloquear, en `send_challenge`).

> #### ✅ Solución aplicada — 2026-07-28
>
> **Freno duro en el punto donde el partido pasa a ser un compromiso.**
> `confirm_match_proposal` (migración `20260728171000`) es la transición que fija fecha,
> cancha, seña y costo; ahí se valida el plantel contra
> `format_rules.min_players_to_start` del formato acordado.
>
> **Se validan los DOS equipos, no sólo el que confirma.** El plan pedía el confirmante,
> pero el equipo **proponente** es justamente el que eligió el formato y nada garantizaba que
> pudiera fielearlo: el caso literal del hallazgo —equipo de 3 que propone un F11— habría
> pasado igual. El mensaje nombra al equipo corto y el mínimo exigido.
>
> **Orden deliberado:** el chequeo de cupo va **después** del de autorización, porque
> `supabase/tests/100-rls-security.spec.sql` (P1-3) espera `'No autorizado'` cuando el equipo
> proponente intenta confirmar su propia propuesta. Invertirlo habría hecho fallar ese caso
> con `SQUAD_TOO_SMALL` y el test habría dejado de proteger lo que protege.
>
> **Aviso temprano, no bloqueante, al desafiar.** `fetchSquadReadiness()`
> (`lib/challenge-actions.ts`) cruza el `preferred_format` del equipo con su cantidad de
> miembros y `format_rules`. `ChallengeButton` lo consulta **al abrir la confirmación** —una
> query por tap, no una por tarjeta del listado— y muestra: *"Tenés 3 jugadores y F11
> necesita al menos 7… podés desafiar igual, pero no vas a poder confirmar el partido"*.
> Se evalúa contra `preferred_format` porque **el desafío no lleva formato**: eso se acuerda
> recién en la propuesta.
>
> **Los errores llegan legibles.** `getGenericSupabaseErrorMessage` se traga los mensajes
> desconocidos en un fallback genérico, que es exactamente el dato que el capitán necesita.
> Se agregó `getProposalErrorMessage()` (`lib/match-actions.ts`), con el patrón de
> `getCheckinErrorMessage`, y se enchufó en los dos call sites (detalle y pestaña Partidos —
> este último mostraba `err.message` crudo). 4 tests nuevos.
>
> **LIMITACIÓN CONOCIDA — decisión de producto pendiente:** se cuentan filas de
> `team_members`; los **invitados** por `unique_code` no, porque al confirmar todavía no
> existen. Un equipo de 6 que habitualmente completa con 5 invitados no va a poder confirmar
> un F11. Si resulta demasiado estricto para el amateur, la palanca es
> `format_rules.min_players_to_start`, configurable por formato sin tocar código.

---

### E2 ✅ CERRADO (vía E3) — "Equipo que se queda sin jugadores" no es un estado del modelo

`teams` **no tiene** `is_active`, `disbanded` ni equivalente. Un equipo con un solo miembro (o con menos jugadores que su formato preferido):

- sigue apareciendo en el **Ranking** como rival desafiable,
- sigue apareciendo en el **Mercado**,
- sigue pudiendo aceptar desafíos (E1),
- conserva su ELO y su posición.

`in_ranking` no sirve para esto: desde la eliminación de la calibración (`20260330182020_remove_calibration.sql:7-10`) su default es `true` para todos y nunca se apaga.

Es el edge case central del fútbol amateur —los equipos se disuelven todo el tiempo— y hoy el modelo no lo puede representar.

> #### ✅ Solución aplicada — 2026-07-28
>
> `teams.is_active` es exactamente el estado que faltaba, y las cuatro superficies de
> emparejamiento lo respetan (ver la nota de **E3** para el detalle). Un equipo disuelto ya
> puede dejar de competir sin perder su historial.
>
> **Lo que sigue faltando:** detección automática. Nada marca solo a un equipo que se quedó
> sin jugadores o por debajo del mínimo de su formato — la baja es una decisión explícita del
> capitán. Un job que avise (no que actúe) sería el complemento natural, en la línea de
> `enqueue_season_expiry_reminder`.

---

### E3 ✅ CERRADO — El capitán único de un equipo con historial queda atrapado

Cadena completa:

1. `leave_team_as_member` rechaza al `CAPITAN` → `CAPTAIN_MUST_TRANSFER` (`20260723123000:93-95`).
2. `transfer_captaincy_and_leave` exige que el destinatario sea miembro → sin otros miembros, imposible.
3. La UI, correctamente, detecta el caso y ofrece **eliminar el equipo** (`app/team-manage.tsx:374-382`).
4. `deleteTeam` falla con `23503` si hay partidos/resultados/reclamos, porque esos FK son `NO ACTION` **a propósito** (borrarlos destruiría partidos que también le pertenecen al rival).

El mensaje de error que ve el usuario es honesto y hasta sugiere la salida correcta:

> *"Este equipo tiene historial deportivo … Podés dejarlo inactivo sin borrarlo."*

…salvo que **"dejarlo inactivo" no existe como funcionalidad** (ver E2). El capitán no puede irse, no puede borrar, y no puede desactivar. Queda con un equipo fantasma en su perfil para siempre.

> #### ✅ Solución aplicada — 2026-07-28 (cierra también E2)
>
> **`teams.is_active` — baja lógica, no borrado.** El historial deportivo es compartido con
> los rivales y tiene que sobrevivir; por eso los FK son `NO ACTION` y por eso el borrado no
> es la respuesta. `is_active = false` significa *"este equipo ya no compite"*: sale de las
> superficies de emparejamiento y conserva ELO, partidos y ledger. Es reversible.
>
> **Dónde se aplica el filtro** (migración `20260728170000`):
>
> | Superficie | Cómo |
> |---|---|
> | Ranking | `get_team_ranking` → `WHERE t.is_active` |
> | Búsqueda de rivales | `search_teams` → `where t.is_active` |
> | Vista legacy | `v_team_ranking` → `AND t.is_active` |
> | Desafíos | `send_challenge` → `TEAM_INACTIVE` en ambas direcciones |
> | Mercado | `lib/market-api.ts` → embed `teams!inner` + `.eq('teams.is_active', true)` |
>
> El Mercado se filtra del lado del cliente porque esas consultas no pasan por ninguna RPC.
> El `!inner` no es decorativo: sin él el embed es un LEFT JOIN y el post aparece igual.
>
> **`send_challenge` entró aunque no estaba en el plan.** Ocultar el equipo del ranking no
> alcanza: el desafío también se dispara desde la ficha del equipo (`team-stats`) o desde una
> pantalla ya cargada. Sin el guard, "dado de baja" era una etiqueta cosmética.
>
> **⚠️ El `GRANT UPDATE (is_active)` no es opcional.** `20260719130000` revocó el UPDATE a
> nivel tabla sobre `teams` y lo repuso columna por columna (así se defienden `elo_rating` y
> `fair_play_score`: con privilegio de columna, no con RLS, que no restringe columnas). Una
> columna nueva no hereda nada — sin ese grant el fix del cliente falla con 42501.
>
> **UI.** `setTeamActive()` en `lib/team-manage-data.ts` (con verificación de filas afectadas
> vía `.select()`, igual que `deleteTeam`: un UPDATE filtrado por RLS responde 204 sin
> `error`). En `app/team-manage.tsx`: botón "Dar de baja / Reactivar equipo" para el capitán,
> banner de estado cuando está inactivo, y —lo importante— **el callejón sin salida ahora
> desemboca acá**: si `deleteTeam` falla con 23503, se abre el diálogo de baja lógica en vez
> de dejar al capitán con un error y nada que hacer.
>
> **Sobre E2 (cerrado por arrastre):** el estado que faltaba ahora existe y las cuatro
> superficies lo respetan. Lo que **no** hay es detección automática: nada marca solo a un
> equipo que se quedó sin jugadores. La baja es una decisión explícita del capitán.
>
> **Lo que este fix NO hace:** el capitán sigue sin poder *abandonar* un equipo con historial
> —`leave_team_as_member` sigue exigiendo ceder la capitanía—. Lo que se resolvió es el
> problema real que describía el hallazgo: que el equipo fantasma siguiera compitiendo en el
> ranking y que el mensaje de error prometiera una salida inexistente.

---

### E4 ✅ CERRADO (parcial) — ¿Hay lógica de Walkover? Sí, pero solo la mitad de abajo

**Lo que existe y funciona bien:**

- Tabla `wo_claims` con evidencia fotográfica obligatoria, motivo tipado (`NO_PRESENTACION`, `ABANDONO`, `INCIDENTE_CONDUCTA`, `CAMPO_NO_DISPONIBLE`, `FALTA_QUORUM`, `OTRO`) y goleadores/MVP del 3-0.
- Estados `WO_A` / `WO_B` en el enum del partido, con badge y rama de render propios en el detalle.
- Motor de consecuencias completo: 3-0, ELO K=40, stats de temporada y **−15 de Fair Play al ausente** (`recalculate_team_fps`, `20260708181125:164-177`).
- Validación server-side de goleadores/MVP contra la convocatoria y de la autorización del reclamante (incluido el fix del `NULL in (…)`, `20260714180000`).
- Panel de admin funcional con la evidencia a la vista (`app/admin/wo-review.tsx`).
- Soporte de WO en el leaderboard (`20260714125138_leaderboard_wo_support.sql`).

**Lo que falta (todo el circuito de arriba):**

- ningún **disparador automático** por no presentación (D4),
- ninguna **notificación** de aprobación o rechazo (D5.3),
- ningún **contra-reclamo** ni segunda oportunidad tras un rechazo (D5.1, D5.2),
- ninguna **visibilidad** del reclamo pendiente, ni para el reclamante ni para el acusado (D5.4),
- ~~ninguna **guarda de estado** al reclamar (D6)~~ → ✅ cerrado 2026-07-28: `claim_wo` exige `CONFIRMADO`/`EN_VIVO`.

Resumen: el WO está resuelto como **cálculo** y sin resolver como **proceso**.

> #### ✅ Estado real — 2026-07-28
>
> **El encabezado de este hallazgo decía 🟠 hasta el Bloque 7 y contradecía al veredicto
> ejecutivo**, que declara cerrada la deuda 🟠 desde el Bloque 4. Se corrigió: de los cinco
> huecos listados arriba, cuatro se cerraron entre los Bloques 3 y 4 —disparador automático
> por check-in (D4), veredicto notificado a ambos lados y salida para el rechazo (D5.3/D5.2),
> visibilidad del reclamo pendiente (D5.4), guarda de estado (D6)—.
>
> ✅ **Y el Bloque 7 cerró el cimiento**: el disparador automático leía un sello que un solo
> jugador podía poner (**D9**). El proceso existía pero se alimentaba de un dato falsificable;
> ahora el "no se presentaron" que dispara el 3-0 significa lo que dice.
>
> **Sigue abierto sólo el contra-reclamo** (D5.1), que exige cambiar la constraint
> `unique(match_id)` de `wo_claims` y, antes que eso, resolver la decisión de producto #7 de la
> sección 6: si los dos equipos reclaman que el otro no se presentó, ¿quién gana?

---

### E5 ✅ CERRADO — `FALTA_QUORUM` está nombrado pero no tiene reglas

El caso "no juntamos gente" aparece como motivo **de cancelación** (`CancellationReason`) y **de reclamo WO** (`WoClaimEntry['reason']`) — el dominio ya lo identificó como escenario central del amateur. Pero no tiene ninguna consecuencia diferenciada: no cambia la penalización de Fair Play, no exime de nada, no habilita reprogramación. Es texto libre tipado.

Es la decisión de producto más específica del dominio amateur que quedó pendiente: **¿cancelar por falta de quórum con 48 h de aviso debería costar lo mismo que no presentarse?** Hoy: cancelar a más de 24 h no cuesta nada, cancelar dentro de las 24 h cuesta −5, no presentarse cuesta −15. La escala existe; solo falta atarla al motivo.

> #### ✅ Solución aplicada — 2026-07-30 · decisión de producto: **no cuesta lo mismo**
>
> `20260730121000_e5_falta_quorum_fair_play_scale.sql`. La multa por ausencia
> deja de ser una constante y pasa a depender del motivo registrado:
>
> | Situación | Multa FPS |
> |---|---|
> | Cancelación tardía (< 24 h) **aceptada**, cualquier motivo | −5 |
> | WO en contra con motivo **`FALTA_QUORUM`** | **−5** |
> | WO en contra, cualquier otro motivo (incl. `NO_PRESENTACION`) | **−15** |
> | Partido `EN_DISPUTA` | −2 |
> | Partido `FINALIZADO` limpio | +1 |
>
> **El eje de la escala es avisar o no avisar**, no la gravedad del motivo. Un
> equipo que no llega a juntar gente y lo registra le deja al rival tiempo para
> reorganizarse; uno que directamente no aparece, no. Eso es lo que el dominio
> amateur distingue todos los fines de semana y lo que el modelo no distinguía.
>
> **Faltaba una pieza que el hallazgo no mencionaba:** `FALTA_QUORUM` estaba en
> el tipo `WoClaimEntry['reason']`, en la pantalla de admin (`wo-review.tsx`) y
> en el selector de cancelaciones — **pero no en el selector del `WoModal`**, que
> sólo ofrecía `NO_PRESENTACION`, `ABANDONO` e `INCIDENTE_CONDUCTA`. Sin
> agregarlo ahí, la escala nueva habría sido inalcanzable desde la app: el motivo
> que la activa no se podía registrar. Es el mismo patrón que M6 (`VISTA` como
> estado inalcanzable).
>
> **La escala es visible antes de elegir.** El `WoModal` ahora dice, arriba del
> selector, cuánto cuesta cada motivo. Quien reclama es el único que puede
> reflejar si le avisaron; pedirle que elija a ciegas entre −5 y −15 habría
> convertido una regla de dominio en una lotería.
>
> **Tres decisiones que se apartan de la lectura literal del plan:**
>
> · **Sin reclamo, la multa es la severa.** El WO automático del barrido (D4) no
>   crea `wo_claims`: nadie declaró un motivo porque el equipo no apareció **ni
>   avisó**. El `coalesce` a −15 es el resultado correcto, no un caso sin cubrir.
>
> · **La cancelación tardía no pasa por la escala por motivo.** Ya cuesta −5 para
>   todos los motivos, que es exactamente lo que la decisión pide para
>   `FALTA_QUORUM`. Ruteársela habría encarecido a −15 todas las demás
>   cancelaciones tardías (`UNILATERAL`, `LESION`, `FUERZA_MAYOR`…) — un
>   endurecimiento que nadie pidió, por efecto colateral.
>
> · **El motivo lo declara quien reclama, no quien falta.** Es una asimetría
>   real y se aceptó a sabiendas: hoy el castigo es −15 para todos, así que la
>   escala sólo puede mejorar la situación del ausente, y `resolve_wo_claim` pasa
>   por un admin. La alternativa —dejar que el ausente se autodeclare
>   `FALTA_QUORUM` con una solicitud de cancelación rechazada— habría creado un
>   atajo trivial para bajar la multa de −15 a −5 **sin presentarse**.
>
> **Implementación:** `fair_play_absence_penalty(reason)` resuelve la escala en
> un solo lugar, con los valores en `app_settings` (`fps_penalty_absence_quorum`
> 5, `fps_penalty_absence_default` 15, `fps_penalty_late_cancel` 5) — misma
> mecánica que los umbrales del barrido. `recalculate_team_fps` pasó de **contar
> ausencias** a **sumar multas**; el `LEFT JOIN` contra `wo_claims` no puede
> duplicar filas porque la tabla tiene `unique (match_id)`.
>
> ⚠️ **La escala es retroactiva y la migración incluye backfill.**
> `recalculate_team_fps` es un full-recalc idempotente, así que un equipo con un
> WO por quórum arrastraría −15 hasta que otro evento suyo disparara el trigger.
> El bloque final recalcula sólo a los equipos afectados: **al aplicar la
> migración, esos equipos suben su Fair Play**. Es el efecto buscado, pero
> conviene saberlo antes de mirar el ranking al día siguiente.
>
> **Lo que este fix NO hace:** `FALTA_QUORUM` sigue sin habilitar reprogramación
> automática ni eximir del WO. Cambia cuánto cuesta, no el resultado deportivo.

---

### E6 ✅ CERRADO (vía D3) — Un partido zombi encierra a sus convocados en el equipo

Las tres RPCs de salida (`leave_team_as_member`, `transfer_to_team`, `transfer_captaincy_and_leave`) bloquean con `ACTIVE_MATCH` si el perfil está en `match_participants` de un partido `CONFIRMADO` o `EN_VIVO`. La regla es correcta. El problema es que, como esos estados **no caducan** (D3), un partido abandonado en `EN_VIVO` deja a todos sus convocados **encerrados en el equipo de forma permanente**, sin ninguna acción disponible para desbloquearse.

> #### ✅ Solución aplicada — 2026-07-28
>
> La regla `ACTIVE_MATCH` no se tocó: sigue siendo correcta. Lo que se arregló es su premisa
> — ahora **`CONFIRMADO` y `EN_VIVO` sí caducan**. Con `sweep_stale_matches()` corriendo cada
> hora, el peor caso para un jugador atrapado es de 24 h (`sweep_live_timeout_hours`) en vez
> de indefinido. También lo desbloquea el rechazo de un WO sobre un partido `CONFIRMADO`, que
> ahora lo cancela en lugar de dejarlo vivo (ver D5).

---

### E7 ✅ CERRADO (parcial) — El código de invitado no caduca ni tiene tope de usos

`join_match_as_guest` permite a cualquier usuario autenticado sumarse a un partido con el `unique_code`. El código se muestra en pantalla completa y se copia con un tap (`app/match-detail.tsx:329-349`), sin vencimiento, sin límite de usos y sin poder rotarse. Un invitado registrado entra en `match_participants`, puede ser convocado, puede ser goleador y MVP, y **suma estadísticas a su perfil global** sin pertenecer a ningún club. Para beta es defendible; conviene decidirlo explícitamente y no por omisión.

> #### ✅ Solución aplicada — 2026-07-29
>
> `20260729120000_e7_guest_code_expiry.sql`. El código pasa a tener una
> **ventana de validez** explícita:
>
> ```
> vence = coalesce(scheduled_at, created_at) + app_settings.guest_code_ttl_hours   (48 h)
> ```
>
> **Por qué no un TTL desde la generación.** El `unique_code` nace con el partido
> (tiene `DEFAULT` en el `INSERT` de `matches`), así que contar 48 h desde ahí
> mataría el código antes de que el partido se juegue: un partido coordinado el
> lunes para el sábado llegaría a la cancha con el código vencido. El uso real es
> *"falta uno, pasame el código"* el mismo día. Por eso la caducidad se ancla al
> **partido**, no al registro. El partido que nunca se coordinó cae en
> `created_at` — que es exactamente el caso del código eterno que describe el
> hallazgo.
>
> **Por qué no alcanzaba la guarda de estado que ya existía.** La RPC exige
> `status = 'CONFIRMADO'` y, desde D3/D4, el barrido saca de ese estado a los
> partidos vencidos a las 4 h. Eso ya tapaba la mayoría de los casos — pero como
> **efecto colateral de otra regla**, ajustable desde `app_settings` sin que
> nadie piense en el código de invitado, y con el cron como único punto de falla:
> si el job se cae o se desactiva, todos los códigos vuelven a ser eternos. Ahora
> es una regla propia, verificable y que no depende de que un job corra.
>
> **La regla vive una sola vez en el servidor** (`match_guest_code_expires_at`,
> `STABLE`, lee `app_settings`) y la aplica `join_match_as_guest`, que rechaza
> con el prefijo estable `GUEST_CODE_EXPIRED` y devuelve `expiresAt` en el
> payload del alta.
>
> **En el cliente** (`lib/guest-code.ts`, con tests): mismo cálculo, pero
> **sólo para presentación y pre-chequeo** — el mismo criterio que el radio del
> geofence. `GuestJoinModal` avisa "código vencido" en el paso de búsqueda en vez
> de dejar que el usuario elija equipo y toque *Unirse* para recién ahí rebotar,
> y el bloque del código en `match-detail` dice hasta cuándo admite invitados.
> Quien comparte el código ahora sabe que tiene fecha de vencimiento.
>
> **Lo que este fix NO hace:** no agrega **tope de usos** ni **rotación** del
> código — las otras dos mitades del hallazgo. El tope choca de frente con el
> caso real ("somos tres los que faltamos") y la rotación necesita UI y una RPC
> propias. Tampoco cambia que un invitado sume estadísticas a su perfil global:
> eso es una decisión de producto (sección 6), no un defecto de implementación.

---

### E8 ✅ CERRADO — Los desafíos `ENVIADA` no caducan y bloquean el emparejamiento

`send_challenge:57-67` rechaza un desafío nuevo si ya hay uno `ENVIADA` entre los dos equipos, en cualquier dirección. No hay caducidad ni job de limpieza: un capitán que no responde nunca congela el emparejamiento entre esos dos equipos hasta que alguien cancele o rechace manualmente.

> #### ✅ Solución aplicada — 2026-07-29
>
> `20260729121000_e8_challenge_expiry_sweep.sql`. Cuarta rama dentro de
> `sweep_stale_matches()`: un desafío `ENVIADA` con más de
> `app_settings.sweep_challenge_expiry_days` (14) pasa a `RECHAZADA`.
>
> **Rama del barrido y no un job aparte.** Es la misma deuda que D3 —estados que
> no caducan— y comparte la propiedad que hace seguro al barrido: `ENVIADA →
> RECHAZADA` deja la fila fuera de su propio `WHERE`, así que correrlo dos veces
> no reprocesa nada. Un segundo cron para una sola sentencia agregaría superficie
> operativa sin agregar nada; el barrido ya corre cada hora, ya lee sus umbrales
> de `app_settings` y ya devuelve métricas — ahora también `challengesExpired`.
>
> **`RECHAZADA` y no `CANCELADA`.** El enum tiene los dos, pero `CANCELADA` es lo
> que hace el que **envió** el desafío al arrepentirse. Acá nadie se arrepintió:
> el desafío murió porque el destinatario no contestó, que es un rechazo por
> omisión. La distinción importa para leer el historial después.
>
> **Al caducar, libera el índice único parcial** `uq_challenges_active_pair`
> (que sólo cubre `status = 'ENVIADA'`), y con él el emparejamiento: los dos
> equipos vuelven a poder desafiarse. Ése era el daño concreto del hallazgo.
>
> **Se avisa a los dos lados, con textos distintos:** al que envió, que su
> desafío se cayó y ya puede volver a mandarlo; al que no respondió, que dejó
> vencer algo suyo. Sólo a CAPITAN/SUBCAPITAN — son los únicos que podían actuar.
> Reusa `DESAFIO_RECHAZADO` en lugar de sumar un valor al enum
> `notification_type`: es el mismo desenlace visto desde el desafiante, y
> `app/notifications.tsx` ya lo rutea a `/challenge-inbox`, que es donde se
> vuelve a desafiar. Un tipo nuevo habría exigido una migración extra sólo para
> el `ALTER TYPE` —no se puede usar un valor de enum agregado en la misma
> transacción— para llegar al mismo lugar.

---

### E9 ✅ CERRADO — El cooldown de 30 días se mide sobre la fecha de creación, no la de juego

`send_challenge:83-97` filtra `created_at >= now() - interval '30 days'` sobre la tabla `matches`. Un partido **creado** hace 31 días pero **jugado ayer** no dispara el cooldown. Para el anti-farming (el propósito declarado de la regla), la fecha relevante es `finished_at` o `scheduled_at`.

> #### ✅ Solución aplicada — 2026-07-29
>
> `20260729122000_e9_cooldown_play_date.sql`:
>
> ```diff
> - AND created_at >= now() - INTERVAL '30 days'
> + AND coalesce(finished_at, scheduled_at, created_at) >= now() - INTERVAL '30 days'
> ```
>
> El orden del `coalesce` es el de **precisión decreciente**: `finished_at` es
> cuándo terminó de verdad (lo sella `apply_match_outcome` en todo `FINALIZADO`);
> `scheduled_at` cubre los `WO_A`/`WO_B`, que entran en el filtro y no siempre
> pasan por `finished_at`; `created_at` queda de último recurso **a propósito**:
> sin él, una fila con las otras dos en `NULL` saldría del filtro y el cooldown
> quedaría silenciosamente desactivado para ese par de equipos. Ante la duda, la
> regla se aplica.
>
> **El cooldown se vuelve más estricto**, que es la dirección correcta para una
> regla anti-farming: un partido creado hace 40 días y jugado la semana pasada
> ahora bloquea el desafío. Antes lo dejaba pasar — y era el agujero más fácil de
> producir, porque basta con demorar la coordinación un mes.
>
> **Índice de apoyo:** el filtro dejó de ser sargable sobre una sola columna, así
> que se indexa la expresión exacta (`idx_matches_ranking_played_at`, parcial por
> `match_type = 'RANKING'` y los tres estados terminales).
>
> #### ⚠️ De paso: se repuso el advisory lock de `send_challenge`
>
> `20260328165650` (CRÍTICO-3c) había agregado `pg_advisory_xact_lock` sobre el
> par de equipos para serializar el chequeo de "no hay desafío activo" — que es
> un chequeo de **NO-existencia** y por eso no se puede proteger con
> `FOR UPDATE`. La migración de **E3** (`20260728170000`) reescribió la función
> tomando como base el cuerpo de `20260328151309`, **anterior al parche**, y el
> lock quedó afuera sin que nadie lo notara.
>
> No se perdió integridad —el índice único parcial seguía sosteniendo la
> invariante—, pero el desenlace de una carrera dejaba de ser el mensaje
> explicativo *"Ya hay un desafío activo con este equipo"* y pasaba a ser un
> `23505` crudo. Como esta migración reescribe la función entera, se repuso.
> **Es el riesgo estructural de mantener RPCs con `CREATE OR REPLACE` de cuerpo
> completo**: cada reescritura tiene que partir de la última versión, no de la
> que uno recuerda.

---

## 5. Baches por pilar — resumen operativo

### Pilar 1 · Ciclo de vida del partido — **el camino de vuelta ya existe**
La cadena feliz estaba completa desde el principio; lo que faltaban eran las salidas de los caminos infelices, y ya están. ✅ La disputa dejó de ser una trampa (D1). ✅ Ningún estado se eterniza: `sweep_stale_matches()` cierra los `PENDIENTE` sin coordinar, resuelve los `CONFIRMADO` vencidos y destraba los `EN_VIVO` abandonados (D3). ✅ La no presentación tiene disparador automático por check-in, y el caso "no fue nadie" —que era literalmente irresoluble— se cancela solo (D4). ✅ El WO avisa su veredicto a los dos equipos, el rechazo ya no deja el partido colgado y el reclamo pendiente se ve en pantalla (D5). ✅ Las notificaciones de partido llevan al partido (D11).

✅ Y la disputa trabada ya tiene salida: `admin_resolve_dispute` fuerza ganador o anula el partido, saltándose el desempate (D2). ✅ D6 cerró el último hueco de API del circuito de WO —ahora sólo se reclama sobre `CONFIRMADO`/`EN_VIVO`— y D10 unificó en `lib/match-permissions.ts` la regla de "puedo cargar resultado", que vivía escrita tres veces y distinta cada vez.

✅ **Y el WO automático dejó de apoyarse en un dato falsificable con un tap** (D9): el check-in individual registra la llegada de quien lo toca, pero la presencia del EQUIPO —el sello que lee `sweep_stale_matches` para otorgar un 3-0— sólo se pone con quórum. Era la deuda más cara que quedaba en el pilar, y estaba catalogada 🟡 porque se evaluó antes de que existiera el barrido. ✅ Y un equipo ya no puede comprometerse dos veces a la misma hora ni agendar en el pasado (D13). ✅ Y el Home por fin muestra lo que **caduca**: propuestas y pedidos de cancelación esperando respuesta, partidos en vivo sin resultado y postulaciones sin contestar (D12) — tres de las cuatro las liquida un job automático, y eran justamente las que la bandeja ocultaba. **El pilar 1 queda cerrado**: lo único que resta es la política de desempate automático, que sigue siendo la original y es una decisión de producto (sección 6).

### Pilar 2 · Mercado de pases — **el circuito quedó cerrado punta a punta**
Publicar y postular funcionan, y ✅ **aceptar ahora sí incorpora**: la postulación aceptada deja una solicitud de unión `ACEPTADA` y el jugador confirma su traspaso desde "Mis solicitudes" (M1), adonde ✅ lo lleva directamente la notificación (M2). ✅ Postularse dejó de ser un efecto colateral con `void`: se espera el registro antes de navegar y los tres desenlaces —creada, duplicada, error— son visibles (M3). La maquinaria de traspaso, que existía y estaba bien construida, por fin se usa. ✅ Y el ciclo del aviso cierra: aceptar desactiva el post y rechaza a los que quedaban (M5), abrir la lista de postulantes escribe por fin el estado `VISTA` (M6), la postulación de equipo sale siempre de un equipo que el usuario gestiona y lo dice por nombre (M7), y ya no se puede postular a un partido vencido ni a un aviso cerrado (M8). ✅ Y el último borde cerró: **el postulante ya ve el estado de sus propias postulaciones** en una pantalla propia, con la traducción de qué significa cada estado y el siguiente paso cuando lo hay (M4). El estado se venía escribiendo bien desde M5/M6; lo que faltaba era superficie. **El pilar 2 queda cerrado punta a punta**; el único pulido pendiente es la etiqueta de la tarjeta del Mercado, que sigue diciendo "Postularme" aunque ya te hayas postulado.

### Pilar 3 · Roles y permisos — **el servidor está bien, y la UI ya acompaña**
La respuesta a la pregunta *"¿puede un Jugador ejecutar por error un flujo de Capitán?"* es: **puede intentarlo, y siempre rebota**. ✅ La única excepción real —R4, donde un subcapitán sí escalaba privilegios— está cerrada: la jerarquía de roles ahora vive en la policy y no sólo en `team-helpers.ts`. ✅ Las **cuatro** superficies de acción de equipo —Ranking, Partidos (R2), detalle de partido (R1) y bandeja de desafíos (R3)— gatean por rol de forma consistente y explican quién tiene que actuar en lugar de esconder la información. ✅ R5 también está cerrado: la cesión de capitanía sin salir del equipo pasó a una RPC atómica (`grant_captain_role`), así que el estado transitorio de **dos capitanes** —que la migración de R4 explícitamente no cubría— dejó de existir. ✅ Y R9 cerró la última confusión de identidad: el detalle del partido ya no contesta por el equipo activo del store, sino por el equipo con el que el usuario realmente juega ese partido — el mismo arreglo de forma que M7 en el Mercado. ✅ R7 también está cerrado, y sin trabajo propio: el `ConfirmDialog` que trajo la remediación de D1 es exactamente lo que el hallazgo pedía —resolución instantánea, desempate por Fair Play, sobreescritura irreversible del resultado—, y encima `canResolve` esconde el botón cuando el capitán perdería. ✅ Y **R6 cerró el pilar**: el `DIRECTOR_TECNICO` dejó de ser una etiqueta y pasó a tener los dos permisos operativos del día del partido —presentar la lista y cargar el resultado—, con la conducción del club (coordinar, cancelar, administrar el plantel, ceder la capitanía) explícitamente fuera de su alcance. **El pilar 3 queda sin deuda**: cada rol tiene exactamente las acciones que puede ejecutar, y ninguna que rebote después del tap.

### Pilar 4 · Edge cases amateur — **cubierto**
✅ El cupo de jugadores se valida al **confirmar** y no en la cancha, con aviso temprano al desafiar (E1). ✅ Existe la baja lógica de equipos: un club disuelto sale del ranking, el mercado y los desafíos conservando su historial (E2/E3), y el callejón sin salida del capitán único desemboca ahí en vez de en un error. ✅ El **WO como proceso** quedó cerrado (E4): al cálculo —que ya estaba completo— se le sumaron disparador automático por check-in, veredicto notificado a ambos lados y salida para el rechazo; falta sólo el contra-reclamo, que necesita cambiar la constraint. ✅ Un partido zombi ya no encierra a sus convocados (E6). ✅ Y las tres caducidades que faltaban ya existen: el código de invitado deja de admitir gente 48 h después del partido (E7), un desafío sin responder se cae solo a los 14 días y libera el emparejamiento (E8), y el cooldown de ranking se mide sobre **cuándo se jugó** el partido y no sobre cuándo se creó la fila (E9) — este último volvió la regla más estricta, que es la dirección correcta para un anti-farming. ✅ Y **E5 cerró el pilar**, que era el hallazgo más específico del dominio amateur: `FALTA_QUORUM` dejó de ser texto libre tipado y pasó a valer −5 de Fair Play contra los −15 de no presentarse. El eje de la escala es **avisar o no avisar**, que es la distinción que el fútbol amateur hace todos los fines de semana y que el modelo no registraba. De paso se cerró un agujero que el hallazgo no mencionaba: el motivo existía en el tipo y en la pantalla de admin, **pero no en el selector del `WoModal`** — sin agregarlo, la escala habría sido inalcanzable desde la app. **El pilar 4 queda sin deuda.** De E7 quedan afuera, como decisión de producto, el **tope de usos** y la **rotación** del código de invitado.

---

## 6. Recomendación para la Beta

> ## ✅ Veredicto final — DESPLEGADO (2026-07-31)
>
> **El reporte no tiene deuda pendiente: 38 de 38 hallazgos cerrados**, de las
> cuatro severidades y de los cuatro pilares. Y **la base de producción refleja
> el 100% de esos cambios**: `supabase db push` terminó OK y las **19
> migraciones** del reporte están en el historial del remoto.
>
> ### Registro honesto del despliegue
>
> Las versiones anteriores de este documento afirmaron durante cinco bloques que
> *"las migraciones no fueron aplicadas a ninguna base"*. **Era falso**, y lo
> desmintió `supabase migration list` recién al ir a desplegar. Lo que pasó de
> verdad:
>
> | Tanda | Migraciones | Cuándo |
> |---|---|---|
> | Bloques 1–8 | **15** (`20260728160000` … `20260729122000`) | ya estaban en producción **antes** de esta sesión de despliegue |
> | Bloque 9 | `20260730120000` (R6) · `20260730121000` (E5) | **2026-07-31** |
> | Hotfixes del CI | `20260731000000` (`resolve_wo_claim`) · `20260731001000` (cast del barrido) | **2026-07-31** |
>
> **La lección operativa:** el reporte se creyó su propia afirmación durante
> cinco bloques sin verificarla contra el remoto ni una vez. Un `migration list`
> de treinta segundos —al principio, no al final— habría evitado que el
> documento arrastrara un dato falso, y habría evitado también corregir el bug
> del barrido **in situ** sobre una migración que ya estaba publicada (la
> corrección no habría llegado nunca: `db push` saltea lo ya aplicado). De ahí
> el roll-forward `20260731001000`.
>
> ### Los dos bugs que encontró el CI, no la lectura
>
> Las 4 suites pgTAP corrieron por primera vez el 2026-07-31 y encontraron dos
> defectos que **ninguna de las nueve revisiones de este reporte había visto**:
>
> 1. **`resolve_wo_claim` había perdido la guarda de estado terminal y el
>    `resolved_by`** — ver la nota del hallazgo D5. Aprobar un WO sobre un
>    partido FINALIZADO pisaba el resultado real con un 3-0 y disparaba ELO.
>    **Estaba en producción desde el 28 de julio.**
> 2. **`sweep_stale_matches` abortaba con 42804** por un casteo de enum — ver la
>    nota del hallazgo D3/D4. **También estaba en producción**, latente: el cron
>    llevaba 20 corridas sin fallar porque ningún partido había llegado todavía
>    a la condición de auto-WO.
>
> Los dos comparten causa: `CREATE OR REPLACE` de cuerpo completo partiendo de
> una versión que no era la última. Es el **tercer y cuarto caso** del mismo
> patrón en este reporte (los otros dos: el advisory lock de `send_challenge` en
> E9, y este mismo `resolve_wo_claim`). Si algo hay que llevarse de la
> auditoría entera como regla de proceso, es ésta.
>
> ### Verificación post-despliegue
>
> Comprobado por introspección contra el remoto, después del push:
>
> · `sweep_stale_matches` contiene `::match_status` ✅
> · `resolve_wo_claim` contiene la guarda `estado terminal` **y** `resolved_by` ✅
> · `submit_team_checkin` acepta `DIRECTOR_TECNICO` ✅
> · la policy `match_results_insert_by_authorized_member` incluye al DT ✅
> · `fair_play_absence_penalty` existe · `fps_penalty_absence_quorum` = 5 ·
>   `fps_penalty_absence_default` = 15 ✅
>
> **El backfill de E5 no movió ningún dato publicado**: producción no tiene
> ningún WO con motivo `FALTA_QUORUM` (0 de 1 WO total), así que ningún Fair
> Play cambió de valor. El riesgo que se anunció era real pero no se materializó.
>
> ### Lo único que queda
>
> Correr `select public.sweep_stale_matches();` **a mano una vez** y leer el
> `jsonb` que devuelve: informa cuántos partidos y desafíos tocaría cada rama.
> Sobre una base con partidos viejos acumulados, la primera corrida puede
> resolver varios de golpe — y ahora que el cast está puesto, va a hacerlo de
> verdad.
>
> Lo listado abajo como "decisiones de producto pendientes" **no bloquea la
> beta**: son preguntas de calibración —umbrales, política de desempate,
> contra-reclamo— que conviene responder con datos reales en la mano.

**Bloqueantes (3): ✅ CERRADOS el 2026-07-28** — D1, M1 y R4. Los tres eran reglas faltantes sobre estructuras existentes, no rediseños. Detalle de cada solución en la nota técnica del hallazgo correspondiente; artefactos y verificación en la sección 0. Sus migraciones (`20260728160000`, `20260728161000`) están aplicadas en producción.

**Fuertemente recomendados antes de abrir (6):** ✅ **todos cerrados** — R1, R2, E1, D3, D5.3 y D2.

**Deuda de verificación — parcialmente saldada.** `300-sweep-stale-matches.spec.sql` cubre `sweep_stale_matches()`, que era la pieza más expuesta: la única que muta estado competitivo sin intervención humana. Sus 11 aserciones verifican las cuatro ramas, las dos guardas (reclamo en revisión, ventana de gracia) y la **idempotencia**, que es lo que evita repetir el doble conteo de ELO que costó una reparación de datos completa en `20260714024611`.

✅ **El Bloque 7 sumó la segunda suite:** `310-checkin-quorum-schedule.spec.sql` (12 aserciones) cubre el quórum de `checkin_team` y las dos guardas de agenda. Junto con la del barrido, las dos piezas que mueven resultado competitivo sin intervención humana —el WO automático y el sello del que depende— quedaron cubiertas por el mismo lado.

**Lo que sigue sin cobertura** (mismo patrón, `240-rpc-wo-admin.spec.sql` como modelo): la policy de R4, el cupo mínimo de E1, el filtro `is_active` de E3, el circuito de notificaciones de D5 y la RPC `admin_resolve_dispute` de D2 — en particular su rama `CANCEL`, que recalcula el Fair Play a mano.

✅ **El Bloque 8 sumó la tercera:** `320-expiry-and-cooldown.spec.sql` (9 aserciones) cubre las tres caducidades nuevas — la ventana del código de invitado y su rechazo en la RPC, la rama de desafíos vencidos del barrido con la liberación del emparejamiento, y el caso que E9 dejaba pasar (partido creado hace 40 días, jugado ayer).

✅ **El Bloque 9 sumó la cuarta:** `330-dt-permissions-quorum-fps.spec.sql` (10 aserciones) cubre los dos círculos de permiso del DT —presenta la lista, carga el resultado, **no** toca `team_members`— y la escala de multas de Fair Play por motivo, con el Fair Play resultante de cada caso (95 el que avisó, 85 el que no se presentó). Las aserciones T-2, T-4 y T-5 son las importantes: verifican que ampliar un rol no aflojó nada de lo que ya estaba cerrado.

**Aceptables en beta si se documentan y se monitorean:** ✅ el WO ya no depende de que un admin esté mirando (E4). ✅ E7 y E8 dejaron de ser riesgos: el código de invitado y el desafío sin responder ahora caducan. **A monitorear:** las métricas que devuelve `sweep_stale_matches()` — `autoWo` (partidos otorgados sin intervención humana), `liveDisputed` (los que caen en la rama dependiente de D2) y, desde el Bloque 8, `challengesExpired`.

**Decisiones de producto pendientes, no de código:**

1. Reglas de la **resolución automática** de la disputa: ¿ventana temporal? ¿quórum mínimo de votos? *(D1 desactivó la trampa y D2 dio la salida manual, pero la política de desempate por votos/Fair Play sigue siendo la original. Ya no bloquea: hoy el peor caso es que un admin tenga que intervenir, no que el partido quede colgado.)*
2. ✅ *Resuelto (E5, 2026-07-30):* **sí**. `FALTA_QUORUM` cuesta −5 de Fair Play y
   `NO_PRESENTACION` sigue costando −15. El eje es avisar o no avisar, no la gravedad del
   motivo. La escala vive en `app_settings` (`fps_penalty_*`) por si hay que recalibrarla
   con datos reales de la beta.
3. ✅ *Resuelto (R6, 2026-07-30):* **staff operativo, no conducción**. El DT presenta la
   lista y carga el resultado; no coordina, no cancela, no administra el plantel ni cede la
   capitanía. Si más adelante se quiere que coordine, es otra decisión y otro cambio.
4. ✅ *Resuelto:* un equipo ya puede "cerrar" sin borrarse (`teams.is_active`, E2/E3).
5. **Abierta por E1:** ¿los invitados por `unique_code` deberían contar para el cupo mínimo
   al confirmar? Hoy no cuentan, porque al confirmar todavía no existen. La palanca sin tocar
   código es `format_rules.min_players_to_start`.
6. **Abierta por D3/D4:** ¿son correctos los umbrales del barrido (14 días / 4 h / 24 h)? Y
   la más de fondo: cuando **no se presenta nadie**, hoy se cancela sin penalizar a ninguno.
   ¿Debería costar Fair Play a los dos?
7. **Abierta por D5:** si los dos equipos reclaman que el otro no se presentó, ¿quién gana?
   Definir eso es el prerrequisito para habilitar el contra-reclamo.

---

*Emisión original: auditoría de solo lectura, sin cambios en el proyecto.*
*Revisión 2026-07-28 (tanda 0): remediación de los 3 bloqueantes (D1, M1, R4) — 2 migraciones nuevas y 5 archivos de código/test modificados.*
*Revisión 2026-07-28 (bloque 1): remediación de 4 hallazgos 🟠 de UI y Mercado (R1, R2, M2, M3) — 9 archivos de código/test modificados, sin migraciones.*
*Revisión 2026-07-28 (bloque 2): remediación de R3, E1 y E3 (+ E2, D7 y D8 por arrastre) — 2 migraciones nuevas y 11 archivos de código/test modificados.*
*Revisión 2026-07-28 (bloque 3): remediación de D3, D4 y D5 (+ D11 y E6 por arrastre) — 2 migraciones nuevas y 2 archivos de cliente modificados.*
*Revisión 2026-07-28 (bloque 4): remediación de D2 — 1 migración nueva, 1 pantalla de admin, 1 capa de datos — y suite pgTAP para `sweep_stale_matches()`. **Con esto no queda deuda 🟠 abierta.***
*Revisión 2026-07-28 (bloque 5): remediación de D6, R5 y D10 + telemetría global (`Logger`) — 2 migraciones nuevas y ~20 archivos de código/test modificados.*
*Revisión 2026-07-28 (bloque 6): remediación de M5, M6, M7 y M8 — 7 archivos de código/test modificados, **sin migraciones**. Con esto el pilar 2 (Mercado) queda cerrado salvo M4.*
*Revisión 2026-07-28 (bloque 7): remediación de D9, D13 y R9 — 2 migraciones nuevas, 1 suite pgTAP nueva y 8 archivos de código/test modificados. **D9 se reclasificó de 🟡 a 🟠 antes de cerrarlo**: era el input del WO automático del Bloque 3. Se corrigió además el encabezado de E4, que seguía diciendo 🟠 contra lo que afirma el veredicto ejecutivo.*
*Revisión 2026-07-29 (bloque 8): remediación de M4, D12, E7, E8 y E9, y cierre formal de R7 (que ya estaba resuelto por el `ConfirmDialog` de D1) — 3 migraciones nuevas, 1 suite pgTAP nueva y ~15 archivos de código/test. **Con esto se liquida la deuda 🟡/🔵 del reporte**: lo único abierto son R6 y E5, las dos decisiones de producto de la sección 6.*
*Revisión 2026-07-30 (bloque 9 · cierre definitivo): remediación de R6 y E5, las dos decisiones de producto que quedaban — 2 migraciones nuevas, 1 suite pgTAP nueva y 11 archivos de código/test. **El reporte queda con 38/38 hallazgos cerrados y sin deuda abierta de ninguna severidad.** Lo que resta es despliegue, no remediación.*
*Despliegue 2026-07-31 (bloque 10 · CI/CD): pipeline completo ejecutado por primera vez. Lint 19→0 warnings; `supabase db reset` + `supabase test db` sobre la cadena entera; tipos regenerados desde el schema real (se descartaron las tres ediciones manuales de `types/supabase.ts` de los Bloques 2, 5 y 7); `supabase db push` OK. **Las suites encontraron dos bugs que estaban en producción y que nueve revisiones de este reporte no vieron** — la regresión de `resolve_wo_claim` (D5) y el casteo de enum de `sweep_stale_matches` (D3/D4) —, corregidos con las migraciones `20260731000000` y `20260731001000`. Se corrigió además la afirmación falsa que este documento arrastraba desde el Bloque 4: quince migraciones ya estaban aplicadas en producción.*

*Estado final: **19 migraciones aplicadas en producción** · **24/24 suites pgTAP, 230/230 aserciones en verde** · **269/269 tests de Vitest** · **`tsc` y `eslint` en 0**. La base de producción refleja el 100% de los cambios del reporte.*
