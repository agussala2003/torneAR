# QA en dispositivos físicos — feedback de Juani

Plan de pruebas **acotado exclusivamente** a los cambios que salieron del testing de Juani
(2026-08-11). No incluye regresiones históricas ni checklist general de la app: si algo de acá
falla, es culpa de estos commits.

**Commits bajo prueba**

| Commit | Qué tocó |
|---|---|
| `bb78512` | Validación 18+ y widget de ranking del Inicio |
| `67124aa` | `SafeAreaProvider` global y rediseño del header |
| `b22703b` | Censo del fútbol argentino |
| _(este)_ | Barra inferior de tabs |

**Dispositivos**

- 📱 **iOS** — iPhone con Dynamic Island
- 🤖 **AND** — Android sin notch, con gesture bar (barra de gestos, no botones)

Ambos dispositivos tienen que correr **toda** la checklist salvo donde diga lo contrario.
Al reportar un fallo, adjuntar captura + modelo + versión de OS.

---

## 1. Header y Safe Area

> El header pasó de `paddingTop: 48px` fijo a `insets.top + 12`. En iOS el header ahora es
> ~31px más alto que antes; en Android queda prácticamente igual (~4px más bajo).

### 1.1 Colisión con la barra de estado

- [ ] 📱 **iOS** — La campana y el logo **no** quedan tapados ni rozando la Dynamic Island.
      Tiene que verse aire entre la isla y los íconos.
- [ ] 📱 **iOS** — Con la isla en modo expandido (ej. un temporizador o música sonando), el
      header sigue sin superponerse.
- [ ] 🤖 **AND** — Los íconos no tocan la hora ni los íconos de batería/señal.
- [ ] 📱🤖 **Al abrir la app en frío, el header NO "salta"**: tiene que aparecer directamente
      en su posición final. Un salto hacia abajo en el primer frame significa que
      `initialWindowMetrics` no está llegando.
- [ ] 📱 **iOS** — Rotar el device a horizontal y volver a vertical: el header se reacomoda sin
      quedar con padding de más.

### 1.2 Tamaños y branding

- [ ] 📱🤖 El logo "TORNEAR" se lee claramente más grande que antes y resalta sobre el fondo.
- [ ] 📱🤖 El header se **despega** visualmente del fondo de la pantalla (es más claro, con un
      borde inferior sutil y sombra). No debe verse "plano" contra el contenido.
- [ ] 📱🤖 Los íconos superiores (campana, chat, desafíos) se ven más grandes y los badges de
      conteo siguen legibles y bien pegados a la esquina del ícono.

### 1.3 Comportamiento táctil (`hitSlop`)

> El `hitSlop` bajó de 12 a 8 al agrandar los íconos. Con el valor viejo, las áreas táctiles de
> dos íconos vecinos se solapaban y el tap en la banda del medio disparaba la acción equivocada.
> **Esta es la prueba más importante de la sección.**

- [ ] 📱🤖 En la tab **Ranking** (muestra ✚2 íconos: desafíos y campana), tocar **justo en el
      espacio vacío entre los dos íconos**. No debe abrirse nada, o como mucho debe abrirse el
      ícono más cercano — nunca el otro.
- [ ] 📱🤖 En la tab **Mercado** (chat + campana), misma prueba en la banda intermedia.
- [ ] 📱🤖 Tocar la campana 5 veces seguidas: siempre abre Notificaciones, nunca el chat ni los
      desafíos.
- [ ] 📱🤖 Tocar el ícono de desafíos 5 veces seguidas: siempre abre la bandeja de desafíos.
- [ ] 📱🤖 Los íconos siguen siendo cómodos de tocar con el pulgar (no hay que "apuntar").

### 1.4 Truncado con nombre de equipo largo

> El selector de equipo activo perdió ~40px de ancho al crecer el logo y los íconos. Se le
> agregó `flexShrink` para que ceda espacio. **Este selector sólo aparece si el usuario tiene
> 2 o más equipos** — hay que crear/unirse a un segundo equipo para probarlo.

- [ ] 📱🤖 Con un equipo de nombre largo (ej. **"Deportivo Los Pibes del Barrio"**) seleccionado
      como activo, entrar a la tab **Ranking** (la que muestra 2 íconos, el peor caso de espacio).
- [ ] 📱🤖 El nombre del equipo se **trunca con "…"** dentro de su chip.
- [ ] 📱🤖 La campana sigue **completamente visible** y no se sale del borde derecho de la
      pantalla. ⚠️ Si la campana aparece cortada o desaparece, el `flexShrink` no está aplicando.
- [ ] 🤖 **AND** — Repetir en un teléfono de pantalla chica (~360dp de ancho) si hay uno a mano.
- [ ] 📱🤖 Tocar el chip truncado abre el selector de equipos normalmente.
- [ ] 📱🤖 Con un equipo de nombre corto (ej. "Racing"), el chip se ve igual que siempre, sin
      espacios raros.

---

## 2. Barra inferior de tabs (nuevo)

> Pasó a `62px + insets.bottom`, con el mismo esquema visual que el header. Se le sumó el inset
> a mano porque React Navigation descarta su cálculo automático cuando uno define un `height`.
> También se eliminó un `BlurView` que quedaba tapado por un fondo opaco.

### 2.1 Colisión con la gesture bar / Home Indicator

- [ ] 🤖 **AND** — Los íconos y labels de las tabs **no** quedan pisados por la barra de gestos.
      Tiene que haber aire entre el label y la barra blanca.
- [ ] 🤖 **AND** — Deslizar hacia arriba para volver al home del sistema **no** dispara
      accidentalmente un cambio de tab.
- [ ] 📱 **iOS** — Los íconos no chocan con el Home Indicator.
- [ ] 🤖 **AND** — Si el device permite cambiar a navegación por 3 botones, hacerlo y verificar
      que la barra se reacomoda (el inset cambia) sin dejar un hueco enorme ni quedar pisada.

### 2.2 Aspecto y simetría

- [ ] 📱🤖 La barra inferior y el header se ven **del mismo color** (`surface-container`) y con
      el mismo tipo de borde sutil. Puestos uno arriba y otro abajo, tienen que leerse como un par.
- [ ] 📱🤖 Los 5 íconos se ven más grandes y los labels (INICIO, RANKING, PARTIDOS, MERCADO,
      PERFIL) siguen entrando en una sola línea, **sin cortarse ni con "…"**.
- [ ] 📱🤖 El ícono de la tab activa se distingue del resto (verde) y es levemente más grande.
- [ ] 📱🤖 Al sacar el `BlurView`, el fondo de la barra tiene que verse **opaco y parejo**, sin
      transparencias ni el contenido asomándose por detrás.
- [ ] 📱🤖 El haptic al cambiar de tab sigue funcionando.

### 2.3 Contenido tapado por la barra (regresión posible)

> La barra creció ~13px y las pantallas están absolutamente posicionadas por debajo de ella.
> Los `paddingBottom` de las listas no se ajustaron porque todavía dan holgura, pero hay que
> confirmarlo con el ojo.

- [ ] 📱🤖 **Inicio** — Scrollear hasta el fondo: la card del Censo se ve **entera**, no tapada
      a medias por la barra.
- [ ] 📱🤖 **Partidos** — El último partido de la lista se ve completo.
- [ ] 📱🤖 **Ranking** — El último equipo de la tabla se ve completo.
- [ ] 📱🤖 **Mercado** — El último aviso se ve completo y el botón flotante (+) no queda pisado.
- [ ] 📱🤖 **Perfil** — El último bloque se ve completo.
- [ ] 📱🤖 **Censo** — El último club de la lista se ve completo.

---

## 3. Validación de edad (18+)

> Nueva regla en el schema de Zod. **Importante:** el schema lo comparten el onboarding y la
> edición de perfil, así que aplica en los dos lugares (decisión de negocio ya aprobada).

### 3.1 Registro nuevo

- [ ] 📱🤖 Registrarse con fecha de nacimiento **15/06/2016**. Debe aparecer el error inline
      **"Debes ser mayor de 18 años para registrarte"** y **no** dejar avanzar de paso.
- [ ] 📱🤖 El mensaje aparece **debajo del campo de fecha**, no como popup ni alert.
- [ ] 📱🤖 Corregir la fecha a una válida (ej. 15/06/1995): el error desaparece y deja continuar.
- [ ] 📱🤖 Probar con la fecha de **exactamente 18 años cumplidos hoy** (restar 18 años a la
      fecha de hoy): **debe dejar pasar**. El borde es inclusivo.
- [ ] 📱🤖 Probar con **18 años menos un día** (un día después de la anterior): **debe frenar**.
- [ ] 📱🤖 Una fecha futura (ej. 28/02/2027) sigue mostrando **"La fecha de nacimiento no puede
      ser futura"** y **no** el mensaje de edad. Los dos errores no deben aparecer juntos.
- [ ] 📱🤖 Una fecha inexistente (31/02/1995) sigue dando "Fecha inválida".

### 3.2 Edición de perfil

- [ ] 📱🤖 Con un perfil ya creado, ir a editar perfil y cambiar la fecha a 2016: mismo error,
      no deja guardar.
- [ ] 📱🤖 ⚠️ **Caso legacy** — Si existe algún usuario de prueba ya registrado con menos de 18,
      confirmar que **no puede guardar ningún cambio** de su perfil hasta corregir la fecha.
      Esto es esperado y está aprobado, pero hay que ver que el mensaje se entienda y no parezca
      un bug (el error tiene que apuntar al campo de fecha).

---

## 4. Widget de Ranking del Inicio

> El widget consultaba el top 3 filtrando **sólo por formato**, mientras que la tab Ranking
> arrancaba filtrada por **zona + categoría + formato**. Eran dos tablas distintas. Ahora usan
> la misma consulta y la navegación viaja con el contexto.

### 4.1 Coherencia entre el widget y la tabla completa

- [ ] 📱🤖 Con un equipo activo que tenga zona, categoría y formato cargados, mirar el widget del
      Inicio y **anotar los 3 equipos del podio, en orden**.
- [ ] 📱🤖 Tocar **"Ver la tabla completa →"**.
- [ ] 📱🤖 La tab Ranking abre **ya filtrada**, y los **3 primeros equipos de la tabla son
      exactamente los mismos, en el mismo orden**, que los del widget. ⚠️ Si difieren, el
      contexto no está viajando.
- [ ] 📱🤖 Los chips de contexto de la tab (zona / categoría / formato) coinciden con los chips
      que muestra la cabecera del widget.
- [ ] 📱🤖 Tocar cualquier parte de la tarjeta (no sólo el texto del pie) también navega.

### 4.2 Que no pise los filtros del usuario

- [ ] 📱🤖 Entrar a la tab Ranking, **cambiar los filtros a mano** (ej. poner zona "Global"),
      irse a otra tab y **volver a Ranking**: los filtros que elegiste **siguen puestos**.
      No deben resetearse solos.
- [ ] 📱🤖 Después de eso, ir al Inicio y tocar "Ver la tabla completa": ahora **sí** se
      re-aplica el contexto del widget (pisa tus filtros manuales, que es lo correcto).
- [ ] 📱🤖 Repetir el paso anterior una segunda vez seguida: tiene que volver a funcionar
      (no debe "gastarse" a la primera).
- [ ] 📱🤖 Con **2+ equipos**: entrar desde el widget, y luego **cambiar el equipo activo** desde
      el selector del header. La tabla debe pasar a los filtros del **equipo nuevo**, no quedarse
      con los del anterior.

### 4.3 Aspecto del widget

- [ ] 📱🤖 La cabecera del widget muestra el trofeo verde, "Top 3 Fútbol X" y los chips de
      categoría y zona. Ya no se ve plana ni arranca directo en la fila 1.
- [ ] 📱🤖 Si tu equipo está en el podio, su fila se ve **resaltada** (fondo verdoso + borde
      izquierdo verde), y se distingue claramente aunque esté 2º o 3º.
- [ ] 📱🤖 ⚠️ **Confirmar con Juani**: el top 3 ahora es de **tu zona y categoría**, no el global
      del formato. Va a ver una lista más chica/local que la que vio en su testing. Es el
      comportamiento correcto, pero conviene avisarle para que no lo reporte como regresión.
- [ ] 📱🤖 Con una zona de nombre largo, los chips bajan de línea en vez de cortarse.

---

## 5. Censo del fútbol argentino

> Pantalla nueva. Los escudos vienen de football-logos.cc con la URL **pineada por hash**.

### 5.1 Acceso

- [ ] 📱🤖 En el Inicio, abajo de "Acciones rápidas", aparece la card **"Censo del fútbol
      argentino"**.
- [ ] 📱🤖 Tocarla abre la pantalla del censo.
- [ ] 📱🤖 El botón de volver funciona y devuelve al Inicio.

### 5.2 Escudos (hashes pineados)

> Las 28 URLs se verificaron una por una contra el servidor, pero hay que confirmarlas en
> pantalla real. Si el proveedor reconstruye sus assets, los hashes rotan y **se caen todas
> juntas**.

- [ ] 📱🤖 Los escudos **se ven** (no hay círculos vacíos ni imágenes rotas).
- [ ] 📱🤖 Cada escudo **corresponde al club correcto**. Prestar atención especial a estos, que
      tienen slugs raros del proveedor y son los candidatos a estar mal mapeados:
  - [ ] Argentinos Juniors _(el proveedor lo tiene con un typo en el slug)_
  - [ ] Huracán
  - [ ] San Lorenzo
  - [ ] Instituto
  - [ ] Gimnasia y Esgrima La Plata _(hay 4 "Gimnasia" distintas en el catálogo del proveedor)_
  - [ ] Racing Club _(existe otro club llamado sólo "Racing")_
  - [ ] Talleres _(existe "Talleres de Remedios de Escalada")_
- [ ] 📱🤖 Los escudos cargan rápido al reabrir la pantalla (quedan cacheados en disco).
- [ ] 🤖 **AND** — Poner el device en **modo avión** y abrir el censo con la lista ya cacheada:
      los escudos deben seguir viéndose.

### 5.3 Fallback de iniciales

- [ ] 📱🤖 **Modo avión + limpiar la app** (o primera carga sin red): donde no carga el escudo
      tienen que aparecer las **iniciales del club** sobre el círculo gris. ⚠️ Nunca un ícono de
      imagen rota ni un hueco en blanco.
- [ ] 📱🤖 Con la red de vuelta, al recargar aparecen los escudos reales.

### 5.4 Datos y layout

- [ ] 📱🤖 La lista está ordenada de **mayor a menor** cantidad de hinchas.
- [ ] 📱🤖 Cada fila muestra el **porcentaje** (con un decimal) y la **cantidad de hinchas**.
- [ ] 📱🤖 El singular/plural es correcto: "1 hincha" vs "5 hinchas".
- [ ] 📱🤖 La **barra de progreso** del primer puesto está llena y las demás son proporcionalmente
      más cortas.
- [ ] 📱🤖 El encabezado muestra el total de hinchas censados y la cantidad de clubes, y el número
      de hinchas **coincide con la suma** de las filas.
- [ ] 📱🤖 Si tu propio cuadro favorito está en la lista, su fila aparece **resaltada en verde**.
- [ ] 📱🤖 Las posiciones 1, 2 y 3 se ven con color de podio (oro / plata / bronce).
- [ ] 📱🤖 **Empates**: si dos clubes tienen la misma cantidad de hinchas, ambos muestran la
      **misma posición** (ej. 2, 2, y el siguiente 4 — nunca 2, 3).
- [ ] 📱🤖 **Pull to refresh**: deslizar hacia abajo recarga y el spinner se ve verde.
- [ ] 📱🤖 Ningún nombre de club se corta de forma rara; los nombres largos (Gimnasia y Esgrima
      La Plata, Estudiantes de La Plata) truncan prolijo.
- [ ] 📱🤖 ⚠️ **Verificar que no haya clubes duplicados** (ej. "Boca" y "Boca Juniors" como dos
      filas separadas). Si aparecen, la migración de normalización no corrió.

### 5.5 Estado vacío

- [ ] 📱🤖 _(Sólo si se puede probar con una base sin datos)_ Con ningún perfil con cuadro
      cargado, la pantalla muestra el mensaje de "Todavía nadie cargó su cuadro favorito" y
      **no** una lista vacía ni un error.

---

## Resultado

- **Fecha de ejecución:**
- **Ejecutó:**
- **iPhone (modelo / iOS):**
- **Android (modelo / versión):**
- **Bloqueantes encontrados:**
- **Menores encontrados:**
