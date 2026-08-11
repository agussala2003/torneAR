# Playbook E2E — TorneAR con dos celulares físicos Android

> Guion de pruebas manuales de integración, concurrencia y tiempo real.
> Pensado para ejecutarse de corrido, en orden: **cada módulo deja el estado que
> consume el siguiente**. Saltear el módulo 5 (check-in) deja al 6 (invitado)
> sin partido `EN_VIVO`.

**Duración estimada:** 2 h 30 min a 3 h la pasada completa.
**Última actualización:** 2026-08-04 · rama `develop` · versión de app `1.0.0`

---

## 0. Antes de empezar

### 0.1 Leé esto primero: las push necesitan un build nuevo

> [!IMPORTANT]
> **FCM ya está configurado** (plugin `expo-notifications` en `app.json` +
> `googleServicesFile` resuelto en `app.config.js`), así que los pasos marcados
> 🔔 **PUSH** **deben pasar**. Si fallan, es un hallazgo real — reportalo.
>
> **Pero sólo funcionan en un build nativo posterior a esa configuración.** Un
> APK viejo no tiene FCM adentro por más que la config esté en el repo: agregar
> un plugin cambia el proyecto nativo y exige recompilar.
>
> **Antes de la sesión, verificá que el build que vas a instalar es nuevo:**
> ```bash
> eas build --profile development --platform android
> ```
> Instalá ese build en **ambos** celulares. Si reutilizás un APK anterior al
> 2026-08-04, las push no van a llegar y **no es un bug**.
>
> **Chequeo rápido en el celular** (60 segundos, hacelo antes de arrancar):
> entrá con cualquier cuenta y corré en el SQL Editor
> ```sql
> select username, expo_push_token from public.profiles where username = '<usuario>';
> ```
> - `expo_push_token` con un valor `ExponentPushToken[…]` → el build está bien,
>   seguí con el playbook.
> - `expo_push_token` en `NULL` → el build **no** tiene FCM, o el usuario denegó
>   el permiso de notificaciones. Revisá ambos antes de seguir; si no, todos los
>   pasos 🔔 van a fallar por la misma causa y perdés la sesión.
>
> **Además:** en Android 13+ el permiso de notificaciones es explícito. La app
> lo pide en el primer arranque — **aceptalo en los dos celulares**. Si lo
> denegaste, hay que habilitarlo a mano en Ajustes → Apps → TorneAR →
> Notificaciones.

### 0.2 Requisitos de build

- [ ] **NO usar Expo Go.** `expo-notifications` crashea en Expo Go bajo SDK 53+;
      el código lo detecta (`Constants.appOwnership === 'expo'`) y devuelve
      `null` sin intentar registrarse. Hace falta un **development build** o el
      **APK de producción** instalado en ambos equipos.
- [ ] Ambos celulares con **GPS/Ubicación activada** y permiso concedido a la app.
- [ ] Ambos con conexión estable (el realtime de Supabase usa WebSockets; una
      red corporativa con proxy puede cortarlos).
- [ ] Al menos uno de los dos con **Android 13+** para validar el permiso
      explícito de notificaciones.
- [ ] Deseable: un celular con **gesture bar** (barra de navegación por gestos)
      y otro con **botones**. Varios chequeos de este playbook son sobre
      `SafeAreaInsets`, y en un equipo con inset 0 no se distinguen.

### 0.3 Actores y cuentas

| Actor | Rol | Cuenta sugerida | Equipo |
|---|---|---|---|
| **Celu A** | Capitán equipo local | `qa.capitan.a@…` (email) | Equipo A |
| **Celu B** | Capitán equipo rival | `qa.capitan.b@…` (Google) | Equipo B |
| **Celu B (2.ª cuenta)** | Jugador invitado, ajeno a ambos | `qa.invitado@…` (email) | ninguno |
| **Admin** | Resolución de disputas | cualquiera de las dos, con `is_admin = true` | — |

> Usá **A = email/password** y **B = Google** para cubrir las dos vías de auth
> en la misma corrida.

### 0.4 Acceso SQL

Varios pasos necesitan tocar la base (subir la versión mínima, vencer un
código, forzar un cooldown). Tené abierto el **SQL Editor de Supabase**.

> [!CAUTION]
> **`develop` y `main` comparten la base de PRODUCCIÓN** (Free Tier, sin
> staging — ver `docs/WORKFLOW.md`). Todo `UPDATE` de este playbook impacta a
> usuarios reales. Los snippets del [Anexo A](#anexo-a--snippets-sql) incluyen
> **siempre** su sentencia de reversión: ejecutala apenas termines el paso.
>
> Alternativa segura si podés: correr la sesión contra el stack local
> (`npx supabase start`) apuntando la app a `http://<IP-de-tu-PC>:54321` en el
> `.env`. Los dos celulares tienen que estar en la misma red Wi-Fi.

### 0.5 Convenciones

| Marca | Significado |
|---|---|
| 📱**A** / 📱**B** | Qué dispositivo ejecuta la acción |
| 🗄️ **SQL** | Paso que se ejecuta en el SQL Editor, no en la app |
| ⏱️ | Verificación de tiempo real: mirar el **otro** celular sin tocarlo |
| 🎯 | Prueba crítica del módulo — si falla, frená y reportá |
| 🔔 **PUSH** | Requiere el build nuevo de 0.1. **Debe pasar** |
| ↩️ | Acción de limpieza / reversión obligatoria |

### 0.6 Registro de la corrida

Completá esto al terminar:

| Módulo | Estado | Bugs encontrados |
|---|---|---|
| 1. Auth y Onboarding | ⬜ | |
| 2. Perfil y Equipo | ⬜ | |
| 3. Mercado y Chat | ⬜ | |
| 4. Ranking y Desafíos | ⬜ | |
| 5. Check-in y GPS | ⬜ | |
| 6. Invitado por código | ⬜ | |
| 7. Resultados y Disputas | ⬜ | |
| 8. Walkover | ⬜ | |
| 9. Force Update | ⬜ | |

---

## Módulo 1 — Inicio, Auth y Onboarding

**Objetivo:** validar las dos vías de registro y que el onboarding de 3 pasos
persista los datos que después alimentan la edad y el promedio del plantel.

### 1.1 Registro con email (Celu A)

- [✅] 📱**A** — Abrir la app recién instalada.
      **Esperado:** splash de intro (~2,3 s) y luego `/login`. Sin flash blanco
      entre el splash nativo y el de la app.
      **Resultado:**: El splash suele aparecer diria un 90% de las veces, mas cuando lo abro por primera vez o sin tener sesion iniciada. Cuando tengo sesion iniciada ahi si que a veces no aparece.
- [✅] 📱**A** — Tocar el enlace para cambiar a modo registro. Ingresar email y
      contraseña válidos. Enviar.
      **Esperado:** la cuenta se crea y arranca el flujo de confirmación por
      email si está activado en el proyecto.
      **Resultado:**: Salta un modal de cuenta creada, y revisa tu mail para confirmarlo y verificarlo pero antes de que pueda darle a aceptar ya pasa a la pestaña del onboarding, esto pasa porque en realidad no tengo activada la confirmacion del email en supbase. Entonces deberiamos informarle, tu cuenta fue creada correctamente y que si redirija al onboarding, osea entiendo que solo seria cambiar el mensaje
- [✅] 📱**A** — Probar el camino infeliz: registrarse con un email ya usado.
      **Esperado:** mensaje de error legible en español, **no** el texto crudo
      de Supabase (`User already registered`).
      **Resultado:**: Correcto, informa "El correo electrónico ya está registrado, proba iniciando sesión.".
- [✅] 📱**A** — Probar contraseña corta (< mínimo del schema Zod).
      **Esperado:** error de validación inline, sin llamada a la red.
      **Resultado:**: Correcto, informa "La contraseña debe tener al menos 8 caracteres.". Aunque el boton de crear cuenta sigue habilitado para presionar y puedo presionarlo infinitamente mientras mi contraseña no cumpla los requisitos y no informa nada, creo que seria bueno deshabilitar el boton con diseño hasta que cumpla todos los requesitos de validacion
- [✅] 📱**A** — Confirmar el email si corresponde y entrar.
      **Esperado:** al tener sesión pero perfil incompleto, el guard de
      [`app/_layout.tsx`](app/_layout.tsx#L131) redirige a `/onboarding`.
      **No** debe poder llegar a `/(tabs)`.
      **Resultado:**: Correcto, salta el onboarding automaticamente. Lo que si en general de este modulo de registro y login los loaders funcionan raro, a veces se muestran muy poco y desaparecen y es como que no le hacen entender al usuario que esta cargando, hay que revisar los loaders en este aspecto y como funcionan

### 1.2 Onboarding de 3 pasos (Celu A)

El formulario valida por paso; el botón de avanzar dispara `trigger()` sobre
los campos de ese paso.

- [✅] 📱**A** — **Paso 1 «Datos Base»**: dejar el nombre vacío e intentar avanzar.
      **Esperado:** no avanza, error inline en el campo.
      **Resultado**: Correcto, salta un mensaje de error inline debajo del campo.
- [✅] 📱**A** — Completar `Nombre completo`, `Usuario` y `Zona` (selector modal).
      **Esperado:** la barra de progreso pasa a 2/3.
      **Resultado**: Correcto, la barra de progreso pasa a 2/3.
- [✅] 📱**A** — Probar un `Usuario` ya existente.
      **Esperado:** error claro de unicidad, no un 409 crudo.
      **Resultado**: Correcto, informa "Este usuario ya existe, proba otro." Pero en lo informa una vez completo los 3 pasos y procesa, quiero aclarar eso nada mas.
- [✅] 🎯 📱**A** — **Paso 2 «Datos Personales»**: ingresar la **fecha de
      nacimiento** con una fecha conocida (anotala, se usa en 1.4). Completar
      género, pie hábil y equipo favorito.
      **Esperado:** la máscara de fecha (`lib/date-mask.ts`) formatea mientras
      se escribe. Una fecha imposible (`31/02/1995`) debe ser rechazada.
      **Resultado:**: Correcto, la máscara de fecha formatea mientras se escribe. Una fecha imposible (`31/02/1995`) debe ser rechazada. Informa el error inline. Aun asi cuando vuelvo a escribir una fecha valida (18/12/1997) me sigue diciendo que la fecha es invalida, osea no desaparece el error inline, aunque puedo darle a siguiente y me lleva a la siguiente pestaña, yo ajustria que los erorers inline desaparezcan cuando se corrige el error y el boton de siguiente se habilite solo cuando todos los campos del paso actual son validos, exactamente, que manejemos los botones con habilitacion y deshabiliacion segun si los campos son validos o no
- [✅] 📱**A** — Probar una fecha **futura**.
      **Esperado:** rechazada por validación.
      **Resultado**: Incorrecto, puse 28/02/2027 y me acepto la fecha, deberia rechazarla porque es futura.
- [✅] 📱**A** — **Paso 3 «Tu Cancha»**: elegir posición preferida. Finalizar.
      **Esperado:** navega a `/(tabs)` (Home). Ya no se puede volver a
      `/onboarding` con el botón atrás.
      **Resultado**: Correcto, me lleva a la pestaña de home.
- [✅] 📱**A** — Matar la app por completo y reabrir.
      **Esperado:** entra directo a `/(tabs)` sin repetir el onboarding — la
      sesión se hidrata desde AsyncStorage.
      **Resultado**: Correcto, entra directo a `/(tabs)` sin repetir el onboarding — la sesión se hidrata desde AsyncStorage.

### 1.3 Registro con Google (Celu B)

- [✅] 📱**B** — En `/login`, tocar el botón de Google.
      **Esperado:** abre el navegador/custom tab con el consentimiento.
      **Resultado**: Correcto, me redirige a la pagina de iniciar sesion de google.
- [✅] 🎯 📱**B** — **Cancelar** el consentimiento cerrando la ventana.
      **Esperado:** la app vuelve al login **sin** mostrar un error rojo —
      cancelar es una decisión del usuario, no un fallo. Se debe poder
      reintentar inmediatamente.
      **Resultado**: Correcto, cuando vuelvo a la app vuelve al login sin ningun error.
- [✅] 📱**B** — Completar el login con Google.
      **Esperado:** vuelve a la app y, como Google no aporta zona/posición/pie
      hábil/nacimiento, cae en `/onboarding`.
      **Resultado**: Correcto, me vuelve a la app y como no me aporto ningun dato me redirige al onboarding.
- [✅] 📱**B** — Completar los 3 pasos con una **fecha de nacimiento distinta**
      a la de A (anotala).
      **Esperado:** llega a `/(tabs)`.
      **Resultado**: Correcto, llega a la pestaña de home.

### 1.4 🎯 Verificación del cálculo de edad

- [✅] 📱**A** — Ir a la pestaña **Perfil**.
      **Esperado:** junto a los chips de zona y posición aparece un chip con
      ícono de torta y el texto **`N años`**, coherente con la fecha de 1.2.
      **Resultado**: Correcto, aparece el chip con el icono de torta y la edad.
- [✅] 📱**B** — Ídem con su propia fecha.
      **Esperado:** la edad corresponde a **años cumplidos**.
- [✅] 🎯 🗄️ **SQL** — Caso borde del cumpleaños. Poner la fecha de nacimiento de
      A **exactamente en la fecha de hoy** de hace 30 años
      ([Anexo A.1](#a1--forzar-una-fecha-de-nacimiento)).
      Recargar el perfil en 📱**A**.
      **Esperado:** muestra **30 años**, no 29. La edad se cuenta el mismo día
      del cumpleaños.
      **Resultado**: Correcto, muestra 30 años.
- [✅] 🗄️ **SQL** — Ahora poner la fecha **un día después** (cumple mañana).
      **Esperado:** muestra **29 años**.
      **Resultado**: Correcto, muestra 29 años.
- [✅] ↩️ 🗄️ **SQL** — Restaurar la fecha original de A.
      **Resultado**: Correcto, muestra la edad original.
- [✅] 🗄️ **SQL** — Poner `date_of_birth = NULL` en A y recargar.
      **Esperado:** el chip de edad **desaparece por completo**. No debe verse
      `— años` ni `null años` ni `0 años`.
      **Resultado**: Correcto, te redirige al onboarding, ya que se requiere si o si la fecha de nacimiento.
- [✅] ↩️ 🗄️ **SQL** — Restaurar la fecha de A.
      **Resultado**: Correcto, muestra la edad original.

---

## Módulo 2 — Perfil y Gestión de Equipo

**Objetivo:** edición de perfil, creación de los dos equipos y el promedio de
edad del plantel.

### 2.1 Edición de perfil

- [✅] 📱**A** — Perfil → editar. Cambiar nombre y posición. Guardar.
      **Esperado:** vuelve a la pantalla de perfil con los datos nuevos ya
      pintados, sin necesidad de recargar.
      **Resultado**: Correcto, vuelve a la pantalla de perfil con los datos nuevos ya pintados, sin necesidad de recargar.
- [✅] 📱**A** — Editar la fecha de nacimiento y guardar.
      **Esperado:** el chip de edad se recalcula.
      **Resultado**: Correcto, el chip de edad se recalcula.
- [✅] 🎯 📱**A** — Subir un **avatar** desde la galería, con recorte cuadrado.
      **Esperado:** spinner durante la subida; al terminar se ve la foto y el
      badge de la esquina pasa de `+` a `✓` (verificado).
      **Resultado**: Correcto, spinner durante la subida; al terminar se ve la foto y el badge de la esquina pasa de + a ✓ (verificado).
- [✅] 📱**A** — Verificar en **Supabase → Storage → `avatars`** que el archivo
      existe.
      **Esperado:** un objeto nuevo bajo la ruta del perfil.
      **Resultado**: Correcto, se ve un objeto nuevo bajo la ruta del perfil.
- [✅] 📱**A** — Probar el camino infeliz: **denegar** el permiso de galería.
      **Esperado:** alert explicando que se necesita el permiso. La app no
      crashea ni queda con el spinner colgado.
      **Resultado**: Correcto, alert explicando que se necesita el permiso. La app no crashea ni queda con el spinner colgado.

### 2.2 Creación de los dos equipos

- [✅] 📱**A** — Crear **Equipo A**: nombre, zona, categoría, formato preferido
      (usar **FUTBOL_5** para que el quórum de check-in sea bajo).
      **Esperado:** se crea y A queda como `CAPITAN`.
      **Resultado**: Correcto, se crea y A queda como CAPITAN.
- [✅] 📱**B** — Crear **Equipo B** con los mismos criterios.
      **Esperado:** ídem para B.
      **Resultado**: Correcto, ídem para B.
- [✅] 🎯 📱**A** — En gestión de equipo, subir el **escudo** (recorte incluido).
      **Esperado:** spinner; luego el escudo se ve en el header. Verificar el
      objeto en **Storage → `shields`**.
      **Resultado**: Correcto, spinner; luego el escudo se ve en el header. Verificar el objeto en Storage → `shields`.
- [✅] 📱**A** — Copiar el **código de invitación** del equipo con el botón de
      copiar.
      **Esperado:** feedback de copiado y el código en el portapapeles.
      **Resultado**: Correcto, feedback de copiado y el código en el portapapeles.
- [✅] 📱**A** — Probar el botón de **compartir** invitación.
      **Esperado:** abre el share sheet nativo de Android.
      **Resultado**: Correcto, abre el share sheet nativo de Android.

### 2.3 🎯 Promedio de edad del plantel

Con un solo miembro por equipo el promedio es trivialmente igual a su edad. Para
probarlo de verdad hay que sumar jugadores — se hace en el módulo 3 vía mercado,
así que **este bloque se completa recién después del 3.5**.

- [✅] 📱**A** — Gestión de equipo → bloque **«Resumen»**.
      **Esperado:** debajo de las baldosas de PR / Partidos / Fair Play hay una
      fila **«Promedio de edad»** con el valor en años.
      **Resultado**: Correcto, debajo de las baldosas de PR / Partidos / Fair Play hay una
      fila **«Promedio de edad»** con el valor en años.
- [✅] 📱**A** — Contrastar contra la lista de jugadores de más abajo: cada
      jugador muestra su posición y su edad separadas por `·`.
      **Esperado:** el promedio coincide con el cálculo manual, redondeado a
      **un decimal**.
      **Resultado**: Correcto, el promedio coincide con el cálculo manual, redondeado a
      un decimal.
- [✅] 🎯 🗄️ **SQL** — Poner `date_of_birth = NULL` a **uno** de los miembros
      del equipo A ([Anexo A.1](#a1--forzar-una-fecha-de-nacimiento)) y recargar.
      **Esperado (lo importante):** el promedio **NO** se desploma. Ese jugador
      queda excluido del cálculo y aparece la aclaración
      **«sobre N de M jugadores con fecha cargada»**.
      **Fallo a reportar:** si el promedio cae a la mitad, se está contando el
      `NULL` como 0.
      **Resultado**: Correcto, el promedio no se desploma. Ese jugador
      queda excluido del cálculo y aparece la aclaración
      **«sobre N de M jugadores con fecha cargada»**.
- [✅] 🗄️ **SQL** — Poner `date_of_birth = NULL` a **todos** los miembros.
      **Esperado:** la fila muestra `—`, sin romper la pantalla.
      **Resultado**: Correcto, la fila muestra `—`, sin romper la pantalla.
- [✅] ↩️ 🗄️ **SQL** — Restaurar todas las fechas.
      **Resultado**: Correcto, se restauran todas las fechas.

---

## Módulo 3 — El Mercado y el Chat

**Objetivo:** publicaciones, postulaciones, notificaciones, chat en tiempo real
y el traspaso de un jugador.

### 3.1 Publicación y postulación

- [✅] 📱**A** — Mercado → crear publicación de tipo **`BUSCA_EQUIPO`** o
      **`BUSCA_PARTIDO`** según el caso a probar. Completar y publicar.
      **Esperado:** aparece en el listado del mercado.
      **Resultado**: Correcto, aparece en el listado del mercado. Lo que si hay que tener en cuenta es que al momento de crear la publicacion con el modal, al querer escribir la descripcion se tapa por el teclado y no puedo ver a medida que escribo, deberiamos poner la descripcion antes del teclado para que se pueda ver. O en todo caso poner la descripcion arriba del teclado o hacer que se pueda scrollear el modal.
- [✅] ⏱️ 📱**B** — **Sin tocar nada**, entrar a la pestaña Mercado.
      **Esperado:** la publicación de A aparece (el listado recarga con
      `useFocusEffect`).
      **Resultado**: Correcto, la publicación de A aparece (el listado recarga con
      `useFocusEffect`).
- [✅] 📱**B** — Postularse a la publicación de A.
      **Esperado:** confirmación y la postulación queda registrada.
      **Resultado**: Correcto, confirmación y la postulación queda registrada.
- [✅] 📱**B** — Ir a «Mis postulaciones».
      **Esperado:** la postulación figura en estado pendiente.
      **Resultado**: Correcto, la postulación figura en estado pendiente.
- [✅] 📱**B** — Intentar postularse **dos veces** a la misma publicación.
      **Esperado:** bloqueado con un mensaje claro, no un error 409 crudo.
      **Resultado**: Correcto, abre un modal diciendo que la postulacion ya estaba hecha.

### 3.2 Notificaciones de la postulación

- [✅] 🎯 📱**A** — Abrir el ícono de campanita → `/notifications`.
      **Esperado:** hay una notificación **in-app** de la postulación de B, con
      su badge de no leído.
      **Resultado**: Correcto, hay una notificación in-app de la postulación de B, con
      su badge de no leído.
- [✅] 📱**A** — Tocar la notificación.
      **Esperado:** navega al detalle correspondiente y el badge de no leídos
      baja.
      **Resultado**: Correcto, navega al detalle correspondiente y el badge de no leídos
      baja.
- [❌] 🔔 **PUSH** 🎯 📱**A** — Con la app en **segundo plano**, repetir 3.1
      desde B.
      **Esperado:** llega una **push notification** al system tray.
      Verificá el **ícono pequeño** en la barra de estado: debe verse la
      **silueta de la pelota con la flecha**, no un cuadrado blanco.
      **Fallo a reportar:** cuadrado/círculo blanco sólido → el
      `notification-icon.png` no tiene el alfa correcto.
      **Resultado**: Incorrecto, no llega la notificacion push. 
- [❌] 🔔 **PUSH** 📱**A** — Desplegar la notificación.
      **Esperado:** el acento de color es el verde de marca (`#53E076`).
      **Resultado**: Incorrecto, No lleega la notificacion push.

### 3.3 🎯 Stress test visual del chat

Este es el bloque más importante del módulo. Se valida el fix de
`SafeAreaInsets` + `KeyboardAvoidingView` en las **dos** pantallas de chat.

**Chat del Mercado** (`app/market-chats/[id].tsx`):

- [✅] 📱**A** — Abrir el chat de la postulación.
      **Resultado**: Correcto, abre el chat de la postulación.
- [✅] 🎯 📱**A** — **Con el teclado cerrado**, mirar la barra del input.
      **Esperado:** hay aire entre el borde inferior del input y el borde de la
      pantalla. En un equipo con **gesture bar**, el input **no** debe quedar
      pisado por la barra del sistema.
      **Fallo a reportar:** el input pegado al borde o tapado por la barra.
      **Resultado**: Correcto, tapado por la barra pero no hay aire entre la barra y el input, faltaria un pequeño paffing inferior
- [✅] 🎯 📱**A** — Tocar el input para **abrir el teclado**.
      **Esperado:** el input **sube** y queda **inmediatamente** sobre el
      teclado. Sin franja muerta entre el input y el teclado, y sin que el input
      quede tapado.
      **Fallo a reportar:** hueco visible (se estaría sumando el inset al empuje
      del KAV) o input debajo del teclado (el KAV no estaría empujando).
      **Resultado**: Correcto, el input sube con el teclado y se agranda junto con el mensaje, este funcinoamiento es correcto, lo que funciona mas o menos es que al bajar el teclado el input ahi si queda con muchisimo aire entre la barra y el input, nose porque, queda muy despegado y arriba de la barra, deberia quedar igual que cuando ingreso al chat por primera vez
- [✅] 📱**A** — Escribir un mensaje **multilínea** largo (el input es `multiline`).
      **Esperado:** el input crece hacia arriba, el botón de enviar sigue
      alineado y visible.
      **Resultado**: Correcto, nada que aclarar
- [❌] 📱**A** — Cerrar el teclado con el botón atrás.
      **Esperado:** el input vuelve a su posición con el aire del inset.
      **Sin salto brusco ni parpadeo.**
      **Resultado**: Es lo que comente en uno de los puntos anteriores lo que funciona mas o menos es que al bajar el teclado el input ahi si queda con muchisimo aire entre la barra y el input, nose porque, queda muy despegado y arriba de la barra, deberia quedar igual que cuando ingreso al chat por primera vez
- [✅] 📱**A** — Rotar el dispositivo si la orientación lo permite (la app está
      fijada en `portrait`, así que debería ignorarse).
      **Esperado:** no rota; nada se rompe.
      **Resultado**: Correcto, no rota

**Chat del Partido** (`app/(modals)/chat.tsx`) — repetir los mismos chequeos
cuando exista un partido (después del módulo 4):

- [✅] 🎯 📱**A** — Repetir los 4 chequeos de arriba en el chat del partido.
      **Esperado:** comportamiento idéntico. El header muestra
      `Equipo A vs Equipo B` y el código del partido.
      **Resultado**: Mismo compoertamiento que el modulo anterior, hay que ajustar exactamente lo mismo

**Concurrencia y tiempo real:**

- [✅] 🎯 ⏱️ 📱**A** + 📱**B** — Con **el chat abierto en los dos**, escribir
      desde A.
      **Esperado:** el mensaje aparece en **B en menos de ~2 s** sin tocar nada
      (WebSocket de `postgres_changes` sobre `messages`).
- [✅] ⏱️ 📱**B** — Responder desde B.
      **Esperado:** aparece en A igual de rápido.
      **Resultado**: Perfecto
- [✅] 🎯 📱**A** + 📱**B** — **Escribir y enviar a la vez** en ambos (contá
      3-2-1 y toquen enviar juntos).
      **Esperado:** los dos mensajes aparecen en ambos dispositivos, **sin
      duplicados** y en orden coherente por `created_at`. El mensaje propio no
      se duplica al volver por realtime (se filtra por `sender_profile_id`).
      **Resultado**: Perfecto
- [✅] 🎯 📱**A** — Activar **modo avión**, escribir y enviar.
      **Esperado:** el mensaje aparece **atenuado** (optimista, `opacity-60`) y
      luego **desaparece** al fallar el envío.
      **Nota de QA:** hoy desaparece **sin aviso al usuario** — está comentado
      como problema conocido en el código. Reportalo si querés que se priorice,
      pero no como regresión.
      **Resultado**: Desaparece en un parpadeo pero no informa nada
- [✅] ↩️ 📱**A** — Desactivar modo avión.
- [✅] 📱**B** — Estando en el chat, matar la app y reabrirla en el chat.
      **Esperado:** el historial se recarga completo y el badge de no leídos
      queda en 0.
      **Resultado**: Perfecto

### 3.4 Camino infeliz del chat

- [✅] 🎯 📱**A** — Con modo avión activo, entrar a un chat **desde cero**.
      **Esperado:** estado de error explícito («No se pudo cargar el chat») con
      botón **Reintentar** — **no** un chat vacío indistinguible de uno sin
      mensajes.
      **Resultado**: Informa el error correctamente
- [✅] 📱**A** — Desactivar avión y tocar **Reintentar**.
      **Esperado:** carga correctamente.
      **Resultado**: Recarga correctamente

### 3.5 Traspaso / incorporación del jugador

- [✅] 📱**A** — Aceptar la postulación de B (o del jugador de prueba).
      **Esperado:** confirmación; el jugador pasa a integrar el plantel.
      **Resultado**: Correcto, el jugador pasa a integrar el plantel
- [✅] ⏱️ 📱**B** — Sin tocar nada, mirar la campanita.
      **Esperado:** notificación in-app de aceptación.
      **Resultado**: Correcto, llega la notificacion IN APP
- [✅] 📱**A** — Gestión de equipo → lista de jugadores.
      **Esperado:** el nuevo jugador aparece con su rol, posición y **edad**.
- [✅] 🎯 📱**A** — **Volver ahora al bloque [2.3](#23--promedio-de-edad-del-plantel)**
      y completarlo: con 2+ jugadores el promedio ya es verificable.
      **Resultado**: Correcto
- [✅] 📱**A** — Cambiar el **rol** del jugador a `SUBCAPITAN`.
      **Esperado:** se refleja en la lista.
      **Resultado**: Correcto y para destacar que en este caso SI ME LLEGO LA NOTIFICACION POR FUERA DE LA APP EN EL OTRO CELU DONDE SE ME INFORMO QUE AHORA TENGO UN NUEVO ROL Y SOY SUBCAPITAN, PARA TOMARLO COMO BASE CON RESPECTO A TODO EL RESTO DE NOTIFICAICON QUE SE PRUEBAN Y DEBEN LLEGAR POR FUERA DE LA APP PERO NO LLEGAN, ESTA FUNCIONO PERFECTO
- [✅] 🎯 📱**B** — Intentar, desde una cuenta con rol `JUGADOR`, cambiar roles o
      expulsar a otro.
      **Esperado:** los botones de gestión no están disponibles. La restricción
      debe ser **server-side**, no sólo visual.
      **Resultado**: Correcto
- [✅] 📱**A** — Expulsar al jugador del equipo.
      **Esperado:** sale del plantel y el promedio de edad se recalcula.
      **Resultado**: Correcto, tambien llega la notificacion fuer ade la app

---

## Módulo 4 — Ranking y Desafíos

**Objetivo:** desafío de ranking, notificación en segundo plano, aceptación y
el cooldown de 30 días.

### 4.1 Envío del desafío

- [✅] 📱**A** — Pestaña **Ranking**.
      **Esperado:** el listado muestra los equipos con su PR. Los equipos dados
      de baja (`is_active = false`) **no** aparecen.
      **Resultado**: Correcto
- [✅] 📱**A** — Buscar el **Equipo B** y enviarle un desafío de tipo
      **`RANKING`**.
      **Esperado:** confirmación de envío.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Intentar enviar **otro desafío al mismo equipo** de inmediato.
      **Esperado:** bloqueado — ya hay un desafío activo con ese rival
      (`uq_challenges_active_pair`). Mensaje legible.
      **Resultado**: Correcto

### 4.2 🎯 Recepción en segundo plano (Celu B)

- [❌] 🔔 **PUSH** 🎯 📱**B** — Poner la app **en segundo plano** (botón home, no
      matarla). Que A envíe el desafío.
      **Esperado:** llega una **push notification** al system tray con el título
      del desafío. Al tocarla, la app abre directo en `/challenge-inbox`.
      **Resultado**: Incorrecto, no llega la notificaicon por fuera del app
- [❌] 🔔 **PUSH** 🎯 📱**B** — Repetir con la app **completamente cerrada**
      (cold start: deslizar de recientes).
      **Esperado:** llega la push. Al tocarla, la app arranca de cero y —una vez
      hidratada la sesión— navega al desafío. El deep link queda **pendiente**
      hasta que hay sesión y se consume una sola vez (`useDeepLinkStore`).
      **Fallo a reportar:** que abra en Home y se pierda el destino, o que
      navegue dos veces.
      **Resultado**: Incorrecto. el hecho de qu eno llegue no me permite testear
- [✅] 🎯 📱**B** — Verificar el **canal de notificación**: Ajustes → Apps →
      TorneAR → Notificaciones.
      **Esperado:** existe el canal **`default`** (lo declara el plugin y lo crea
      el código con importancia máxima). **Fallo a reportar:** que las
      notificaciones caigan en un canal «Miscellaneous».
      **Resultado**: Correcto
- [✅] 📱**B** — Abrir la app y mirar la campanita.
      **Esperado:** también hay notificación **in-app** del desafío. Push e
      in-app son dos canales distintos; ambos deben existir.
      **Resultado**: Correcto, esta in app, no por fuera
- [✅] 🗄️ **SQL** — Confirmar que el token quedó registrado:
      `select expo_push_token from profiles where username = '<usuario-B>';`
      **Esperado:** un valor `ExponentPushToken[…]`.
      **Si está `NULL`** el build no tiene FCM o falta el permiso — volvé a 0.1
      antes de reportar nada como bug de producto.
      **Resultado**: Correcto, si esta en la bd

### 4.3 Aceptación del desafío

- [✅] 📱**B** — Ir a la bandeja de desafíos (`/challenge-inbox`).
      **Esperado:** el desafío de A aparece como `ENVIADA`.
      **Resultado**: Correcto
- [✅] 📱**B** — **Aceptar** el desafío.
      **Esperado:** se crea el partido en estado **`PENDIENTE`**.
      **Resultado**: Correcto
- [✅] ⏱️ 📱**A** — Sin tocar nada, mirar la pestaña **Partidos**.
      **Esperado:** el partido aparece. Notificación in-app de la aceptación.
      **Resultado**: Correcto
- [✅] 📱**A** — Abrir el detalle del partido y **proponer** fecha, hora, sede
      (venue) y costos.
      **Esperado:** la propuesta queda `PENDIENTE` de respuesta.
      **Importante:** elegí una **sede con coordenadas cargadas** — sin `venue`
      el check-in con geofence del módulo 5 no se puede probar
      (error `VENUE_REQUIRED`).
      **Resultado**: Correcto
- [✅] ⏱️ 📱**B** — Sin salir del detalle del partido.
      **Esperado:** la propuesta aparece **sola** (realtime sobre
      `match_proposals`).
      **Resultado**: Correcto
- [✅] 🎯 📱**B** — Aceptar la propuesta.
      **Esperado:** el partido pasa a **`CONFIRMADO`** y se genera el
      `unique_code`. ⏱️ En 📱**A** el estado cambia solo.
      **Resultado**: Correcto, aunque cabe aclarar que el unique code ya se gneera y se muestra luego de aceptar el desafio, no luego de confirmar y aceptar la propuesta de partido con detalles
- [✅] 📱**A** — Probar el camino infeliz: proponer un horario que **se solape**
      con otro partido confirmado del mismo equipo.
      **Esperado:** rechazado server-side (guarda D13, ventana de
      `match_default_duration_minutes` = 90 min).
      **Resultado**: Correcto

Acalaracion que dejo por aqui, en una de las cuetnas pertencecia a dosequipos, ariba en el header aparece un selector de equipos que abre un modal para seleccionarlos, este modal muestr los equipos a los que pertenezco y falta que muestre la foto de los escudos si es que tienen si no tienen un escudo por defaul, ademas el modal necesita un poco mas de aires/padding por debajo ya que a penas un alto del segundo equipo es tapado por la barra del celular. y por ultimo, mientras pertenecia a estos dos equpos me echaron de uno y podia seguir abriendo el seleccionable, y no se actualizo hasta que cerre la app por compelto y la volvi a abrir par aque recargue
Agrego tambien que el modal que se abre cuento te invitaron a un partido tambien necesita un poco de aire abajo

Otra aclaracoin que quiero hacer es que a lo largo de la app el concepto pmas importante de la app que es el ELO, divaga en distintos nombres a lo largo de la app y yo lo unificaria en un nombre comun mas atractivo, a lo largo de la app aparece como ELO, como PR, como RATING, debemos unificar eso asi queda mas claro y mejro

### 4.4 🎯 Cooldown de 30 días

El cooldown impide que dos equipos se enfrenten repetidamente en RANKING para
farmear PR. **Se mide sobre la fecha en que se JUGÓ** el partido
(`coalesce(finished_at, scheduled_at, created_at)`), no sobre cuándo se creó la
fila — ese fue el agujero que arregló E9.

- [✅] 🗄️ **SQL** — Simular un partido de ranking **ya jugado ayer** entre A y B
      ([Anexo A.2](#a2--forzar-el-cooldown-de-desafíos)).
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Intentar enviar un **nuevo desafío de RANKING** al Equipo B.
      **Esperado:** **bloqueado** con un mensaje que explique el cooldown, no un
      error genérico.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Intentar enviar un desafío **`AMISTOSO`** al mismo equipo.
      **Esperado:** **permitido** — el cooldown aplica sólo a RANKING.
      **Resultado**: Correcto
- [✅] 🎯 🗄️ **SQL** — El caso exacto de E9: dejar el partido con
      `created_at` de hace **40 días** pero `finished_at` de **ayer**
      ([Anexo A.2](#a2--forzar-el-cooldown-de-desafíos), variante B).
      Reintentar el desafío RANKING desde 📱**A**.
      **Esperado:** **sigue bloqueado.** Con el filtro viejo (sobre `created_at`)
      este caso pasaba de largo — es la regresión que este paso protege.
      **Resultado**: Correcto
- [✅] 🗄️ **SQL** — Poner el partido con más de 30 días jugados.
      **Esperado:** el desafío RANKING ahora **sí** se puede enviar.
      **Resultado**: Correcto
- [✅] ↩️ 🗄️ **SQL** — Borrar el partido de prueba del cooldown.
      **Resultado**: Correcto

---

## Módulo 5 — Estados del Partido y Check-in (GPS)

**Objetivo:** el geofence anti-fantasmas, el quórum por equipo y la transición
a `EN_VIVO`.

**Precondición:** partido `CONFIRMADO` con **venue con coordenadas**.
**Radio del geofence:** `checkin_geofence_radius_m` = **150 m**.

Aclaracion que hago por aqui, a veces al enviar la propuesta de para partido apresto el boton de enviar propuesta y se cierra y se abre el modal de para completar los detalles de envio de la propuesta, debo cerrarlo manualmente y ahi se ve el modal de "propuesta enviada", deberia cerrarse al enviarse la propuesta

El modal para armar la convocatoria, tambien el botno de confirmar lista es un poco tapado por la barra inferior, tener en cuenta esto para otros modales e interfaces UI
### 5.1 🎯 Prueba anti-fantasmas

- [✅] 🎯 📱**A** — **Apagar la ubicación** del dispositivo. Intentar el check-in.
      **Esperado:** falla con el mensaje de **`LOCATION_REQUIRED`** — un texto
      que pida activar la ubicación, no un error genérico de Supabase.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Activar la ubicación pero **denegar el permiso** a la app.
      Intentar el check-in.
      **Esperado:** falla con un mensaje que explique el permiso faltante y,
      preferentemente, ofrezca ir a Ajustes.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Con ubicación y permiso OK, pero estando **lejos** de la sede
      (a más de 150 m). Intentar el check-in.
      **Esperado:** falla con **`GEOFENCE_FAILED`** →
      *«Estás demasiado lejos de la cancha para hacer el check-in.»*
      **Este es el corazón del anti-fantasmas: si esto pasa, es un bug crítico
      de seguridad.**
      **Resultado**: Correcto
- [✅] 🗄️ **SQL** — Si no podés desplazarte físicamente, movés la sede en vez del
      celular: reubicá el `venue` lejos de vos
      ([Anexo A.3](#a3--mover-el-venue-para-probar-el-geofence)).
      **Esperado:** mismo `GEOFENCE_FAILED`.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Probar con una **app de ubicación falsa (mock location)** si
      tenés opciones de desarrollador habilitadas.
      **Esperado:** el check-in se hace igual — **es una limitación conocida**
      del geofence por GPS del cliente. Anotalo como riesgo, no como bug nuevo.
      **Resultado**: Correcto

### 5.2 Check-in exitoso y quórum

- [✅] ↩️ 🗄️ **SQL** — Restaurar las coordenadas del venue a tu ubicación real
      (o acercate físicamente).
      **Resultado**: Correcto
- [✅] 📱**A** — Como capitán, presentar la **convocatoria** (lista de buena fe)
      y hacer el check-in.
      **Esperado:** check-in registrado. La sección de check-in muestra
      **`N/M`** presentes, con M salido de `format_rules` del formato.
- [✅] ⏱️ 📱**B** — Sin tocar nada.
      **Esperado:** el contador de presentes del rival se actualiza solo
      (realtime sobre `match_participants`).
      **Resultado**: Correcto
- [✅] 🎯 📱**B** — Hacer el check-in del Equipo B hasta alcanzar el quórum.
      **Esperado:** cuando **ambos** equipos alcanzan el mínimo, el partido pasa
      a **`EN_VIVO`**.
      **Resultado**: Correcto
- [✅] 🎯 ⏱️ 📱**A** — **Sin tocar la pantalla.**
      **Esperado:** el detalle pasa a `EN_VIVO` **solo**, aparece el cronómetro
      en vivo (`LiveTimer`) y se habilita el botón de cargar resultado.
      **Fallo a reportar:** si hay que salir y volver a entrar, el realtime del
      partido no está funcionando.
      **Resultado**: Correcto
- [✅] 📱**A** — Verificar el **badge de estado** del partido.
      **Esperado:** dice `EN VIVO` con su estilo distintivo.
      **Resultado**: Correcto

Quiero destacar en esta seccion que a veces el checkin_geofence_radius_m falla, yo pienso que limitarlo a 150m es muy propenso a fallas, quizas extenderlo a un radio de 500m o 1000m, analicemos eso, porque creo que para una version inicial es preferible que tengan mas radioo, apostando por la honestidad de los usuarios y registrando mediante logs como esta funcionando, y vemos si en un futuro lo reducimos. Ademas pienso que en el momento de mandar el detalle de la propuesta, estaria bueno que al cargar los complejos de una zona te diga la distancia a la que estas de los complejos, nose si es mucho trabajo pesado¿

---

## Módulo 6 — El Invitado por código (Seguridad / RPC)

**Objetivo:** validar el fix de `get_match_detail` — el bug donde el código
dejaba **entrar** pero no dejaba **mirar**.

> **Contexto del fix:** `join_match_as_guest` anota al invitado en
> `match_participants` con `is_guest = true` **sin crear membresía**. La RPC
> `get_match_detail` autorizaba sólo contra `team_members`, así que el canje era
> exitoso y la pantalla moría acto seguido con
> *«No autorizado: no sos miembro de este equipo»*.
> Migración `20260804120000`.

### 6.1 Generación del código

- [✅] 📱**A** — Con el partido `EN_VIVO`, abrir el detalle y localizar el
      **código único** del partido.
      **Esperado:** el código se ve y se puede copiar con un toque.
      **Resultado**: Correcto
- [✅] 📱**A** — Verificar la leyenda de **vencimiento** junto al código.
      **Esperado:** indica hasta cuándo vale (TTL = `guest_code_ttl_hours` =
      **48 h** desde el horario pactado).
      **Resultado**: Correcto

### 6.2 Preparación del invitado

- [✅] 📱**B** — **Cerrar sesión** por completo.
      **Esperado:** vuelve a `/login`. Al matar y reabrir la app **no** debe
      recuperar la sesión anterior.
      **Resultado**: Correcto
- [✅] 📱**B** — Entrar con la **tercera cuenta** (`qa.invitado@…`), **ajena a
      los dos equipos**. Completar onboarding si es nueva.
      **Esperado:** llega a `/(tabs)` sin pertenecer a ningún equipo.
      **Resultado**: Correcto

### 6.3 🎯 La prueba del fix

- [ ] 🎯 📱**B** — Ingresar el **código del partido** en el flujo de unirse como
      invitado. Elegir el lado (Equipo A o B).
      **Esperado:** el canje es exitoso y **navega al detalle del partido**.
- [ ] 🎯 📱**B** — **Observar la pantalla de detalle.**
      **Esperado:** carga completa — hero con ambos equipos, estado `EN_VIVO`,
      sede, cronómetro.
      **🚨 FALLO CRÍTICO A REPORTAR:** si aparece
      *«No autorizado: no sos miembro…»* o *«Partido no encontrado»*, el fix
      **no** está desplegado en el entorno que estás probando.
- [ ] 📱**B** — Verificar que el invitado **se ve a sí mismo** en el plantel.
      **Esperado:** figura en la lista, marcado como invitado.
- [ ] 🎯 📱**B** — Verificar que **no** tiene permisos de capitanía (no puede
      cambiar roles ni gestionar el equipo).
      **Esperado:** su rol en el club es nulo — entrar al partido **no** lo
      afilia al equipo.
- [ ] 📱**B** — Matar la app y volver a entrar al partido.
      **Esperado:** sigue pudiendo leer el detalle (el acceso es persistente,
      no de una sola vez).
- [ ] ⏱️ 📱**A** — Sin tocar nada.
      **Esperado:** el invitado aparece en el plantel/convocatoria del lado
      elegido.

En general de esta seccion, las pruebas fueron completas y completas, solo cabe aclarar que SOLO me deja unirme cuando el partido esta CONFIRMADO, es decir que se ACEPTA la prupuesta pero aun no se hace el checkin y asi debe ser, no se puede unir cuando esta en propuesta o en vivo o cancelado o etc, por lo que el codigo de partido de invitacion solo debe aparecer para los partidos cuando el estado esta confirmado, ese debe ser el ajuste a hacer

OTRA COSA QUE HYA EN RELACION A esto es que cuando entro al partido correctamnte, despues no me aparece el detalle del partido, ni desde la seccion de partidos ni desde inicio, deberia aparecerme en la seccion de partido y en inicio para la cuena regresiva o en proximos partidos, por mas que no sea mi equipo. ten en cuena que el estado del partido no rompa con lo que te comente antes, una cosa es visualizar el detalle del partido como jugador y otra es unirme al partido en otro estado al comentado

### 6.4 🎯 Que el fix no haya abierto de más

Estos pasos verifican que el acceso sigue **acotado**. Son tan importantes como
el 6.3.

- [ ] 🎯 📱**B** — Desde la cuenta invitada, intentar abrir **otro partido**
      del que **no** tiene código (por ejemplo desde una notificación vieja o
      un deep link armado a mano).
      **Esperado:** **denegado.** Ser invitado de un partido no da acceso a otro.
- [ ] 🎯 🗄️ **SQL** — Verificar el alcance por equipo directamente
      ([Anexo A.4](#a4--verificar-el-alcance-del-acceso-de-invitado)).
      **Esperado:** el invitado que entró por el lado A **no** puede pedir el
      detalle desde la vista del Equipo B.
- [ ] 🎯 🗄️ **SQL** — **Vencer el código** poniendo el `scheduled_at` del
      partido 5 días atrás ([Anexo A.5](#a5--vencer-el-código-de-invitado)) e
      intentar el canje con una **cuarta cuenta**.
      **Esperado:** rechazado con el mensaje de **código vencido**
      (`GUEST_CODE_EXPIRED`), distinto del de código inválido.
- [ ] 📱 — Probar un código **inexistente** (`ZZZZZZ`).
      **Esperado:** mensaje de *código inválido*, **distinto** al de vencido —
      son dos problemas con dos soluciones distintas para el usuario.
- [ ] ↩️ 🗄️ **SQL** — Restaurar el `scheduled_at` del partido.
- [ ] ↩️ 📱**B** — Cerrar sesión de la cuenta invitada y volver a entrar como
      **capitán B** para continuar con el módulo 7.

TODO CORRECTO EN ESTE MODULO

---

## Módulo 7 — Resultados, Modales y Disputas

**Objetivo:** carga de resultados, el fix visual de los modales, la UI
transparente de disputas y la resolución desde el panel admin.

### 7.1 🎯 El modal de resultado (fix visual)

> **Contexto del fix:** el sheet crecía sin tope hasta ocupar la pantalla
> entera; el `ScrollView` interno, sin altura acotada por la que desbordar,
> nunca llegaba a scrollear. Ahora `maxHeight: 88%` + padding de safe area.

- [✅] 📱**A** — Abrir el modal de **cargar resultado**
      **Resultado**: Correcto.
- [✅] 🎯 📱**A** — **Observar el alto del modal.**
      **Esperado:** es un **sheet**, no una pantalla completa. Se ve el fondo
      oscurecido por encima del modal.
      **Fallo a reportar:** el modal ocupa el 100 % de la pantalla.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — **Observar el borde inferior.**
      **Esperado:** el botón «Confirmar resultado» **no** queda pisado por la
      gesture bar. Hay aire proporcional al inset del dispositivo.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Cargar un marcador alto (ej. **7-2**) y asignar goleadores a
      **muchos jugadores del plantel** para estirar el contenido.
      **Esperado:** el contenido **scrollea dentro del modal**, el header
      («Cargar resultado» + ✕) queda fijo arriba, y se puede llegar al botón de
      confirmar.
      **Fallo a reportar:** contenido cortado sin poder scrollear.
      **Resultado**: Correcto
- [✅] 📱**A** — Probar la validación: poner marcador **3** pero asignar goles a
      goleadores que **sumen 5**.
      **Esperado:** alert de goles inconsistentes indicando ambos números.
      **El alert debe verse por encima del modal**, no quedar detrás.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — **Doble tap rápido** en «Confirmar resultado».
      **Esperado:** se envía **una sola vez** (guard síncrono por `ref`).
      Verificá en la base que no haya dos filas en `match_results`.
      **Resultado**: Correcto
- [✅] 📱**A** — Cerrar el modal sin enviar, y reabrirlo.
      **Esperado:** los campos vuelven a **cero** — no arrastra la carga previa.
      **Resultado**: Correcto
- [✅] 📱**A** — Cargar el resultado definitivo: **A gana 2-0**.
      **Esperado:** se registra y la pantalla lo refleja.
      **Resultado**: Correcto

### 7.2 Entrada en disputa

- [✅] ⏱️ 📱**B** — Sin tocar nada.
      **Esperado:** B ve que el rival ya cargó su resultado.
      **Resultado**: Correcto
- [✅] 🎯 📱**B** — Cargar un resultado **distinto**: **B gana 2-0**
      (es decir, B se adjudica 2 y le pone 0 a A).
      **Esperado:** los marcadores no coinciden → el partido pasa a
      **`EN_DISPUTA`**.
      **Resultado**: Correcto
- [✅] 🎯 ⏱️ 📱**A** — **Sin tocar la pantalla.**
      **Esperado:** el estado cambia a `EN_DISPUTA` solo y aparece el panel de
      disputa.
      **Resultado**: Correcto

### 7.3 🎯 UI transparente de la disputa

> **Contexto del fix:** antes se votaba **a ciegas** — la pantalla mostraba los
> nombres de los equipos y ningún marcador, así que votar era elegir un nombre
> sin saber qué resultado se estaba votando.

- [✅] 🎯 📱**A** — Observar el bloque **«Marcadores cargados»**.
      **Esperado:** una leyenda con el eje (`Equipo A – Equipo B`) y **dos
      filas**, una por equipo, con el marcador **completo** que propuso cada uno,
      ambos en el **mismo orden**:
      ```
      Marcadores cargados (Equipo A – Equipo B)
      Equipo A (tu equipo)     2 – 0
      Equipo B                 0 – 2
      ```
      **Fallo a reportar:** que sólo se vean nombres sin marcadores, o que los
      dos marcadores estén en ejes distintos (uno «mis goles» y otro «goles del
      rival»), que es justamente lo que hacía imposible comparar.
      **Resultado**: Correcto
- [✅] 🎯 📱**B** — Mirar **la misma disputa desde B**.
      **Esperado:** **los mismos dos marcadores, en el mismo orden A–B.** Lo
      único que cambia es cuál fila lleva la marca `(tu equipo)`.
      **Fallo a reportar:** que A y B vean marcadores distintos o invertidos.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Observar los **botones de voto**.
      **Esperado:** cada botón dice «Votar por <equipo>» **y debajo el marcador
      que se está votando** («Su marcador: 2 – 0»). Se vota un **resultado**, no
      un nombre.
      **Resultado**: Correcto
- [✅] 📱**A** — Verificar el aviso de **cierre automático**.
      **Esperado:** explica que a las **24 h** (`sweep_dispute_timeout_hours`)
      se hace el escrutinio y que **nadie puede adelantarlo**.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** — Verificar quién puede votar: sólo los que hicieron check-in.
      **Esperado:** con check-in, aparecen los botones. Sin check-in, aparece el
      aviso de que no puede votar.
      **Resultado**: Correcto
- [✅] 📱**A** — Emitir el voto.
      **Esperado:** pasa a «Voto registrado», indicando por qué equipo **y con
      qué marcador** votó. Los botones desaparecen (no se vota dos veces).
      **Resultado**: Correcto
- [✅] ⏱️ 📱**B** — Sin tocar nada.
      **Esperado:** el contador de votos se actualiza.
      **Resultado**: Correcto
- [✅] 📱**B** — Con los votos **empatados**, verificar el aviso de desempate.
      **Esperado:** explica que desempata el **Fair Play** y hacia qué lado
      caería, o avisa que ambos tienen el mismo FP y el partido pasará a
      revisión de un administrador.
      **Resultado**: Correcto

### 7.4 🎯 Resolución desde el Panel Admin

- [✅] 🗄️ **SQL** — Darle rol admin a una de las cuentas
      ([Anexo A.6](#a6--habilitar-el-panel-de-administración)).
      **Resultado**: Correcto
- [✅] 📱**A** — Reiniciar la app y entrar a `/admin/dispute-review`.
      **Esperado:** el panel carga.
      **Resultado**: Correcto
- [✅] 🎯 📱**B** — Intentar entrar al panel con una cuenta **sin** `is_admin`.
      **Esperado:** pantalla **«Acceso denegado»**. Y la RPC
      `get_disputed_matches` debe rechazar server-side, no sólo ocultar la UI.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** (admin) — Observar la tarjeta del partido en disputa.
      **Esperado:** bajo la leyenda `Marcadores cargados (A – B)`, **cada
      columna muestra el marcador completo** que cargó ese equipo
      (`2 – 0` y `0 – 2`), más sus votos y su Fair Play.
      **Fallo a reportar:** que se vea **un solo número por equipo** (ej. `2` y
      `2`). Eso era el bug: dos cifras de dos planillas distintas, que juntas
      parecen un marcador y no lo son.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** (admin) — **Contrastar con lo que ve el jugador** en 7.3.
      **Esperado:** **exactamente los mismos dos marcadores.** Admin y jugador
      leen de RPCs distintas pero comparten el normalizador.
      **Resultado**: Correcto
- [✅] 📱**A** (admin) — Si el caso lo amerita, verificar el aviso de
      **«Empate total»** (mismos votos y mismo Fair Play).
      **Esperado:** explica que la resolución automática no puede desempatar y
      que ese partido sólo se cierra desde el panel.
      **Resultado**: Correcto
- [✅] 📱**A** (admin) — Resolver con **«Gana Equipo A»**, escribiendo un motivo
      en el campo de notas.
      **Esperado:** diálogo de confirmación advirtiendo que se aplican ELO,
      estadísticas y Fair Play, y que no se puede deshacer.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** (admin) — Confirmar.
      **Esperado:** el partido pasa a **`FINALIZADO`** con el marcador del
      ganador, desaparece de la lista de disputas, y el marcador del perdedor se
      corrige al espejo.
      **Resultado**: Correcto
- [✅] ⏱️ 📱**B** — Sin tocar nada.
      **Esperado:** el partido se ve resuelto y llega notificación in-app con la
      nota del admin.
      **Resultado**: Correcto
- [✅] 🗄️ **SQL** — Verificar el impacto competitivo:
      `select elo_rating, matches_played, season_wins from teams where id in (…);`
      **Esperado:** el ELO se movió **una sola vez** para cada equipo.
      **Resultado**: Correcto
- [✅] 🎯 📱**A** (admin) — Repetir en otro partido con la opción **«Anular»**.
      **Esperado:** queda `CANCELADO`, **sin** ELO, sin estadísticas y sin
      ganador.
      **Resultado**: Correcto
- [✅] ↩️ 🗄️ **SQL** — Quitar `is_admin` si la cuenta no debe conservarlo.
      **Resultado**: Correcto

---

En el detalle de la evolucion de elo no aparece nada dice que no tiene partidos por el ranking jugados. nose si  es prque no nhay temporada inciada, que de paso tampoco me deja hacerlo

{
    "scope": "admin.season.handleConfirmTransition",
    "newSeasonName": "Clausura 2026",
    "startsAt": "2026-08-10",
    "endsAt": "2026-12-31",
    "error": {
        "code": "21000",
        "details": null,
        "hint": null,
        "message": "UPDATE requires a WHERE clause"
    }
}



## Módulo 8 — Walkover (WO)

**Objetivo:** el circuito de reclamo y, sobre todo, el fix visual del modal más
largo de la app.

**Precondición:** un partido `CONFIRMADO` o `EN_VIVO` donde el rival no se
presentó. Podés generarlo repitiendo el módulo 4 con un partido nuevo.

### 8.1 🎯 El modal de WO (fix visual)

> Es el sheet **más largo** de la app: banner de reglas + escala de Fair Play +
> 4 motivos + evidencia fotográfica + botón. Era el que peor se veía sin
> `maxHeight`.

- [ ] 📱**A** — Abrir el modal de **Reclamar WO**.
- [ ] 🎯 📱**A** — **Observar el alto.**
      **Esperado:** es un sheet con el fondo oscurecido visible arriba, **no**
      pantalla completa.
- [ ] 🎯 📱**A** — **Scrollear el contenido del paso 1 de arriba abajo.**
      **Esperado:** se puede recorrer todo — banner, aviso de la escala de Fair
      Play, los **4 motivos**, el área de evidencia y los botones de
      Galería/Cámara — y **llegar al botón de acción del final**.
      **Fallo a reportar:** contenido cortado sin scroll posible.
- [ ] 🎯 📱**A** — **Observar el borde inferior** con el teclado cerrado.
      **Esperado:** el botón final no queda pisado por la gesture bar.
- [ ] 📱**A** — Verificar que el header del modal (título + ✕) **queda fijo**
      mientras se scrollea.
      **Esperado:** no se va con el scroll.

      TODO CORRECTO PARA ESTE MODULO

### 8.2 Reclamo y validaciones

- [ ] 🎯 📱**A** — Intentar continuar **sin adjuntar foto**.
      **Esperado:** bloqueado con alert de **«Foto requerida»**. La evidencia es
      obligatoria.
- [ ] 📱**A** — Verificar que los **4 motivos** estén disponibles:
      `No presentación`, `Falta de quórum`, `Abandono`,
      `Incidente de conducta`.
      **Esperado:** los cuatro seleccionables, con su descripción.
- [ ] 🎯 📱**A** — Leer el aviso de la **escala de Fair Play**.
      **Esperado:** explica que `Falta de quórum` descuenta **5** puntos y
      `No presentación` **15** (`fps_penalty_absence_quorum` /
      `fps_penalty_absence_default`). Es información que tiene que estar
      **antes** de elegir, porque el motivo define la multa.
- [ ] 📱**A** — Adjuntar foto desde **Galería**. Luego probar **Cámara**.
      **Esperado:** la imagen se previsualiza en el área punteada, que pasa a
      borde verde.
- [ ] 📱**A** — Denegar el permiso de cámara.
      **Esperado:** alert de permiso requerido; el modal no crashea.
- [ ] 📱**A** — Continuar al **paso 2** (goleadores del 3-0).
      **Esperado:** aparece el selector con el plantel. El botón ‹ del header
      permite volver al paso 1 **sin perder la foto cargada**.
- [ ] 🎯 📱**A** — Verificar el scroll también en el **paso 2** con muchos
      jugadores.
      **Esperado:** scrollea y se llega a los botones «Omitir y enviar» /
      «Enviar reclamo».
- [ ] 📱**A** — Enviar con **«Omitir y enviar»**.
      **Esperado:** el reclamo se registra sin goleadores.
- [ ] 🎯 📱**A** — Probar el camino infeliz: activar **modo avión** y enviar.
      **Esperado:** alert de error **dentro del modal** (visible por encima de
      él), el modal **queda abierto** y la foto **no se pierde**, para poder
      reintentar sin rehacer todo.
- [ ] ↩️ 📱**A** — Desactivar modo avión y enviar correctamente.

TODO CORRECTO PARA ESTE MODULO

### 8.3 Resolución del WO

- [ ] ⏱️ 📱**B** — Sin tocar nada.
      **Esperado:** ve el reclamo de WO en su contra y recibe notificación
      in-app.
- [ ] 📱**A** (admin) — Ir a `/admin/wo-review`.
      **Esperado:** el reclamo aparece con su foto de evidencia y el motivo.
- [ ] 📱**A** (admin) — Aprobar el reclamo.
      **Esperado:** el partido pasa a **`WO_A`** (o `WO_B` según quién reclamó),
      con marcador 3-0 y el descuento de Fair Play correspondiente al motivo.
- [ ] 🗄️ **SQL** — Verificar el Fair Play del equipo sancionado.
      **Esperado:** bajó **15** puntos si el motivo fue `NO_PRESENTACION`, o
      **5** si fue `FALTA_QUORUM`.

TODO CORRECTO PARA ESTE MODULO

---

## Módulo 9 — Sistema de Force Update

**Objetivo:** verificar que la palanca de emergencia saca de circulación un
build y que el modal es **realmente** imposible de esquivar.

> **Cómo funciona:** al arrancar, la app lee `public.app_versions` para su
> plataforma y compara `min_required_version` contra
> `Constants.expoConfig.version` (hoy **`1.0.0`**, de `app.json`). Si la
> instalada es menor, muestra un modal bloqueante.
> El chequeo corre **antes del login** y la tabla se lee **sin sesión**.

### 9.1 Estado inicial (la tabla nace inerte)

- [ ] 🗄️ **SQL** — `select * from public.app_versions order by platform;`
      **Esperado:** dos filas (`android`, `ios`) con
      `min_required_version = '1.0.0'` = la versión publicada. **No bloquea a
      nadie.**
- [ ] 📱**A** + 📱**B** — Abrir la app normalmente.
      **Esperado:** **no** aparece ningún modal de actualización.

### 9.2 🎯 Accionar la palanca

- [ ] 🎯 🗄️ **SQL** — Subir la versión mínima de Android por encima de la
      instalada ([Anexo A.7](#a7--activar-el-force-update)):
      ```sql
      update public.app_versions
         set min_required_version = '9.9.9',
             latest_version       = '9.9.9'
       where platform = 'android';
      ```
- [ ] 🎯 📱**A** — **Matar la app por completo** (deslizar de recientes, no sólo
      home) y volver a abrirla.
      **Esperado:** aparece el **modal bloqueante** con el título
      **«Actualizá torneAR»**, la comparación `Tenés 1.0.0 → Última 9.9.9` y el
      botón «Actualizar ahora».
- [ ] 🎯 📱**A** — **Presionar el botón físico/gestual de ATRÁS.**
      **Esperado:** **no pasa absolutamente nada.** El modal sigue.
      **🚨 FALLO CRÍTICO:** si el modal se cierra, el bloqueo es esquivable.
- [ ] 🎯 📱**A** — Tocar **fuera** del modal, en el fondo oscurecido.
      **Esperado:** no se cierra.
- [ ] 🎯 📱**A** — Buscar cualquier ✕ o «Más tarde».
      **Esperado:** **no existen.** No hay forma de descartarlo.
- [ ] 🎯 📱**A** — Poner la app en segundo plano y volver.
      **Esperado:** el modal sigue ahí.
- [ ] 🎯 📱**A** — Tocar **«Actualizar ahora»**.
      **Esperado:** abre la ficha de Play Store de
      `com.agussala2003.tornear`.
      **Al volver a la app, el modal sigue** (no se actualizó nada).
- [ ] 🎯 📱**A** — **Cerrar sesión no debe ser una vía de escape:** si lográs
      llegar al login de alguna forma, el modal debe seguir encima.
      **Esperado:** el bloqueo aplica **con y sin sesión** — el modal se monta
      como hermano de la navegación, por encima de cualquier ruta.

TODO CORRECTO PARA ESTE MODULO

### 9.3 🎯 Verificar que no bloquea de más

- [ ] ↩️ 🎯 🗄️ **SQL** — Volver la mínima a `1.0.0`
      ([Anexo A.7](#a7--activar-el-force-update), reversión).
- [ ] 📱**A** — Matar y reabrir.
      **Esperado:** el modal **desapareció**, la app funciona normal.
- [ ] 🎯 🗄️ **SQL** — Poner la mínima **exactamente igual** a la instalada
      (`1.0.0`).
      **Esperado:** **no** bloquea. El bloqueo es «menor que», no «distinto de».
- [ ] 🎯 🗄️ **SQL** — Poner una mínima **menor** (`0.9.0`).
      **Esperado:** no bloquea.
- [ ] 🎯 📱**A** — **Modo avión** + matar la app + reabrir, con la mínima
      en `9.9.9`.
      **Esperado:** la app **abre igual**, sin modal. Sin red no se puede leer
      la política, y el modo degradado correcto es **no bloquear** — si no, un
      corte de Supabase dejaría a toda la base afuera.
      **🚨 FALLO CRÍTICO:** si la app se cuelga esperando la consulta o muestra
      el modal sin haber podido consultar.
- [ ] ↩️ 📱**A** — Desactivar modo avión.

TODO CORRECTO PARA ESTE MODULO

### 9.4 🎯 Las guardas de la base

Estas protegen contra el peor escenario: dejar a **toda la base de usuarios**
afuera por un dedazo.

- [ ] 🎯 🗄️ **SQL** — Intentar guardar una versión mal formada:
      ```sql
      update public.app_versions set min_required_version = '1..0' where platform = 'android';
      ```
      **Esperado:** **rechazado** por el CHECK (error `23514`). Una versión
      ilegible haría indecidible la comparación del cliente.
- [ ] 🎯 🗄️ **SQL** — Intentar una URL no segura:
      ```sql
      update public.app_versions set update_url = 'http://inseguro.com' where platform = 'android';
      ```
      **Esperado:** **rechazado** — la URL debe ser `https://`.
- [ ] 🎯 🗄️ **SQL** — Intentar una plataforma desconocida:
      ```sql
      insert into public.app_versions values ('windows','1.0.0','1.0.0','https://x.com');
      ```
      **Esperado:** **rechazado.**
- [ ] 🎯 🗄️ **SQL** — Verificar que un usuario común **no** puede accionar la
      palanca ([Anexo A.8](#a8--verificar-que-un-usuario-común-no-puede-bloquear-la-app)).
      **Esperado:** el `UPDATE` como rol `authenticated` **falla**.
      **🚨 FALLO CRÍTICO:** si funciona, cualquier usuario podría bloquear la app
      para todos.
- [ ] ↩️ 🗄️ **SQL** — Confirmar el estado final:
      `select * from public.app_versions;` → ambas filas en `1.0.0`.

TODO CORRECTO PARA ESTE MODULO

### 9.5 ⚠️ Hallazgo conocido a confirmar

- [ ] ⚠️ 🗄️ **SQL** — Mirar el `update_url` de **iOS**.
      **Esperado hoy:** `https://apps.apple.com/app/tornear/id0000000000` — es un
      **placeholder**. Hoy es inofensivo porque el mínimo de iOS es `1.0.0` y el
      modal nunca se muestra, **pero hay que corregirlo con el App ID real antes
      de subir la mínima de iOS alguna vez**, o los usuarios de iOS verían un
      botón «Actualizar» que no lleva a ningún lado, sin poder cerrar el modal.
      Marcá este ítem como **confirmado** y dejá el aviso en el reporte.

TODO CORRECTO PARA ESTE MODULO

---

## Anexo A — Snippets SQL

> Ejecutar en **Supabase → SQL Editor**.
> ⚠️ Recordá 0.4: esto es la base de **producción**. Cada snippet trae su
> reversión — **usala apenas termines el paso**.

### A.1 — Forzar una fecha de nacimiento

```sql
-- Cumple HOY, hace 30 años → debe mostrar 30
update public.profiles
   set date_of_birth = (current_date - interval '30 years')::date
 where username = '<usuario>';

-- Cumple MAÑANA → debe mostrar 29
update public.profiles
   set date_of_birth = (current_date - interval '30 years' + interval '1 day')::date
 where username = '<usuario>';

-- Sin fecha → el chip debe desaparecer
update public.profiles set date_of_birth = null where username = '<usuario>';

-- ↩️ Reversión
update public.profiles set date_of_birth = '<AAAA-MM-DD>' where username = '<usuario>';
```

### A.2 — Forzar el cooldown de desafíos

```sql
-- Variante A: partido de ranking jugado AYER → debe bloquear
insert into public.matches
  (id, team_a_id, team_b_id, status, match_type, format, scheduled_at, finished_at)
values
  ('aaaa1111-0000-0000-0000-00000000cool', '<team_a_id>', '<team_b_id>',
   'FINALIZADO', 'RANKING', 'FUTBOL_5', now() - interval '1 day', now() - interval '1 day');

-- Variante B — el agujero exacto que arregló E9:
-- creado hace 40 días pero JUGADO ayer. Con el filtro viejo pasaba de largo.
update public.matches
   set created_at   = now() - interval '40 days',
       finished_at  = now() - interval '1 day',
       scheduled_at = now() - interval '1 day'
 where id = 'aaaa1111-0000-0000-0000-00000000cool';

-- Fuera del cooldown → debe permitir el desafío
update public.matches
   set finished_at = now() - interval '40 days',
       scheduled_at = now() - interval '40 days'
 where id = 'aaaa1111-0000-0000-0000-00000000cool';

-- ↩️ Reversión
delete from public.matches where id = 'aaaa1111-0000-0000-0000-00000000cool';
```

### A.3 — Mover el venue para probar el geofence

```sql
-- Guardá primero las coordenadas reales
select id, name, lat, lng from public.venues where id = '<venue_id>';

-- Mandalo lejos (Buenos Aires) → GEOFENCE_FAILED
update public.venues set lat = -34.6037, lng = -58.3816 where id = '<venue_id>';

-- ↩️ Reversión: restaurar lat/lng originales
update public.venues set lat = <lat_original>, lng = <lng_original> where id = '<venue_id>';

-- Radio vigente (150 m)
select value from public.app_settings where key = 'checkin_geofence_radius_m';
```

### A.4 — Verificar el alcance del acceso de invitado

```sql
-- Debe DEVOLVER datos: el invitado entró por el lado del equipo A
select public.get_match_detail('<match_id>', '<team_a_id>') is not null as puede_leer_su_lado;

-- Debe FALLAR con "No autorizado": no entró por el lado B
select public.get_match_detail('<match_id>', '<team_b_id>');

-- Quién quedó anotado como invitado en el partido
select mp.profile_id, p.username, mp.team_id, mp.is_guest
  from public.match_participants mp
  join public.profiles p on p.id = mp.profile_id
 where mp.match_id = '<match_id>' and mp.is_guest = true;
```

> Para que estas consultas reflejen lo que ve la app hay que ejecutarlas
> **bajo la identidad del invitado**, no como `postgres` (que bypasea RLS). La
> forma fiable de probarlo es **desde el celular**, que es lo que hace 6.3/6.4.

### A.5 — Vencer el código de invitado

```sql
-- TTL vigente (48 h)
select value from public.app_settings where key = 'guest_code_ttl_hours';

-- Mandar el partido al pasado → el código vence
update public.matches set scheduled_at = now() - interval '5 days' where id = '<match_id>';

-- ↩️ Reversión
update public.matches set scheduled_at = '<timestamp_original>' where id = '<match_id>';
```

### A.6 — Habilitar el panel de administración

```sql
update public.profiles set is_admin = true where username = '<usuario>';

-- ↩️ Reversión
update public.profiles set is_admin = false where username = '<usuario>';
```

> `is_admin` **no** es escribible por el usuario (lockdown por columna de
> `20260719130000`), así que este `UPDATE` sólo funciona desde el SQL Editor con
> rol privilegiado. Que **falle** desde la app es el comportamiento correcto.

### A.7 — Activar el force update

```sql
-- 🎯 Activar el bloqueo
update public.app_versions
   set min_required_version = '9.9.9', latest_version = '9.9.9'
 where platform = 'android';

-- ↩️ Reversión OBLIGATORIA — no dejes esto activo
update public.app_versions
   set min_required_version = '1.0.0', latest_version = '1.0.0'
 where platform = 'android';

-- Estado actual
select platform, min_required_version, latest_version, update_url, updated_at
  from public.app_versions order by platform;
```

> [!CAUTION]
> Si terminás la sesión con `9.9.9` cargado, **todos los usuarios reales quedan
> bloqueados**. Verificá el estado final antes de cerrar.

### A.8 — Verificar que un usuario común no puede bloquear la app

```sql
begin;
  set local role authenticated;
  -- Debe fallar
  update public.app_versions set min_required_version = '9.9.9' where platform = 'android';
rollback;
```

### A.9 — Estado general del partido de prueba

```sql
select m.id, m.status, m.match_type, m.format, m.unique_code,
       m.scheduled_at, m.started_at, m.finished_at,
       ta.name as equipo_a, tb.name as equipo_b
  from public.matches m
  join public.teams ta on ta.id = m.team_a_id
  join public.teams tb on tb.id = m.team_b_id
 where m.id = '<match_id>';

-- Las dos planillas enfrentadas (lo que debe mostrar la UI de disputa)
select t.name as cargo,
       r.goals_scored as se_adjudica,
       r.goals_against as le_adjudica_al_rival,
       r.submitted_at
  from public.match_results r
  join public.teams t on t.id = r.team_id
 where r.match_id = '<match_id>';
```

---

## Anexo B — Parámetros operativos vigentes

Salen de `public.app_settings` y son ajustables sin desplegar. Consultalos con
`select key, value, description from public.app_settings order by key;`

| Clave | Valor | Qué gobierna |
|---|---|---|
| `checkin_geofence_radius_m` | 150 | Distancia máxima al complejo para el check-in |
| `checkin_min_players_fallback` | 4 | Mínimo de check-ins si el partido no tiene `format_rules` |
| `guest_code_ttl_hours` | 48 | Vigencia del código de invitado |
| `sweep_dispute_timeout_hours` | 24 | Cierre automático de la votación de disputa |
| `sweep_live_timeout_hours` | 24 | Cierre automático de un partido colgado en `EN_VIVO` |
| `sweep_confirmed_grace_hours` | 4 | Gracia tras el horario pactado antes del WO automático |
| `sweep_pending_no_date_days` | 14 | Cancelación automática de un `PENDIENTE` sin confirmar |
| `sweep_challenge_expiry_days` | 14 | Caducidad de un desafío sin responder |
| `fps_penalty_absence_default` | 15 | Fair Play que descuenta un WO por no presentarse |
| `fps_penalty_absence_quorum` | 5 | Fair Play que descuenta un WO por falta de quórum |
| `fps_penalty_late_cancel` | 5 | Fair Play que descuenta una cancelación tardía (< 24 h) |
| `match_default_duration_minutes` | 90 | Duración asumida para detectar solapamientos |

**Estados posibles de un partido:**
`PENDIENTE` → `CONFIRMADO` → `EN_VIVO` → `FINALIZADO` / `EN_DISPUTA` / `WO_A` /
`WO_B` / `CANCELADO`

---

## Anexo C — Qué hacer ante un fallo

1. **Capturá la pantalla o grabá el video.** Los bugs de `SafeAreaInsets` y de
   `KeyboardAvoidingView` son casi imposibles de describir por escrito.
2. **Anotá el modelo y la versión de Android de cada celular.** Los insets
   varían mucho entre fabricantes.
3. **Mirá los logs de la app** en `app_logs`:
   ```sql
   select created_at, level, scope, message, context
     from public.app_logs
    order by created_at desc
    limit 50;
   ```
   El `scope` te dice exactamente qué módulo falló (`match-detail.loadData`,
   `chat.handleSend`, `useForceUpdate`, …).
4. **Distinguí** un fallo de **UI** (se ve mal pero el dato está bien) de uno de
   **dominio** (el dato quedó mal en la base). Los segundos son siempre más
   graves.
5. **Antes de reportar un fallo de permisos**, confirmá contra qué entorno
   estás probando: si la app apunta a producción pero la migración se aplicó
   sólo en local (o viceversa), el síntoma es idéntico al del bug.

---

## Anexo D — Checklist de cierre de la sesión

- [ ] 🗄️ `app_versions` con `min_required_version = '1.0.0'` en **ambas**
      plataformas.
- [ ] 🗄️ Coordenadas de los `venues` restauradas.
- [ ] 🗄️ `scheduled_at` de los partidos de prueba restaurado.
- [ ] 🗄️ Fechas de nacimiento restauradas.
- [ ] 🗄️ Partido de prueba del cooldown eliminado.
- [ ] 🗄️ `is_admin` revocado en las cuentas que no deben conservarlo.
- [ ] 📱 Sesiones cerradas en ambos celulares si son equipos compartidos.
- [ ] 📝 Tabla de resultados de [0.6](#06-registro-de-la-corrida) completa.
- [ ] 📝 Bugs cargados con capturas, modelo de dispositivo y versión de Android.
