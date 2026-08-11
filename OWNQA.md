🐛 Bug / Mejora UI: Cabecera de Notificaciones
Problema detectado: La pantalla de notificaciones colisiona con la barra de estado del sistema (hora, batería). Además, la navegación de retroceso no es explícita y el contador de mensajes sin leer pasa desapercibido.

Diagnóstico Técnico:

Falta aplicar el paddingTop dinámico del SafeArea en el contenedor principal de esta pantalla (al no usar el GlobalHeader, quedó desprotegida).

El botón de retroceso carece de texto descriptivo.

El badge de "sin leer" necesita mayor peso visual (color/tipografía) para destacar en la jerarquía.

Plan de Acción (Fix propuesto):

Fix 1 (SafeArea): Importar useSafeAreaInsets de react-native-safe-area-context y aplicar paddingTop: insets.top + 12 (o el margen que maneje la app) al contenedor del header de esta pantalla específica.

Fix 2 (Botón Volver): Reestructurar el botón de retroceso. Usar un <TouchableOpacity> con un flex-row y align-items-center que contenga el ícono de la flecha izquierda seguido de un <Text> que diga "Volver".

Fix 3 (Énfasis y Layout): Darle peso visual al texto "X sin leer" (por ejemplo, usando el color verde primario de la marca y fuente en negrita). Asegurar que el botón "MARCAR LEÍDAS" quede bien alineado a la derecha usando justify-between en la fila.

🐛 Bug / Mejora UI: Perfil de Jugador (Vista Pública)
Problema detectado: El botón de retroceso ("Volver") tiene un estilo de caja/botón que desentona con el minimalismo de la app. Además, en la fila de insignias (badges) falta mostrar la edad del jugador, información que sí aparece en la vista privada.

Diagnóstico Técnico:

El componente del botón de navegación (probablemente en la cabecera de esta pantalla específica) tiene aplicadas clases de fondo o borde que lo hacen parecer un botón sólido, en lugar de un enlace de texto limpio.

El contenedor de las insignias debajo del nombre no está renderizando el dato de la edad, o falta inyectar el componente.

Plan de Acción (Fix propuesto):

Fix 1 (Estilo Botón Volver): Remover las clases de estilo de fondo (bg-...) y bordes del contenedor del botón de retroceso. Dejar únicamente el flex-row con el ícono y el texto, asegurando mantener un hitSlop generoso (ej: 10 o 15) para no perder área táctil al quitarle el relleno.

Fix 2 (Badge de Edad): Insertar el componente del badge de edad en la fila flex donde ya conviven la ubicación y la posición. Conectar este componente con el dato del perfil usando el helper que ya creamos en lib/age.ts para calcular la edad exacta en base a la fecha de nacimiento guardada en la base de datos.

🐛 Bug / Mejora UI: Historial de Últimos Partidos (Perfil de Jugador)
Problema detectado: La lista de últimos partidos es muy plana. Carece de contexto visual (escudos de los rivales) y no destaca los logros individuales del jugador (goles anotados, premios MVP). El badge de "Ranking" pasa desapercibido y no se ven los puntos ganados o perdidos.

Diagnóstico Técnico:

El componente de la fila en la lista no está integrando el avatar/escudo del equipo rival.

La vista no está consumiendo o renderizando las estadísticas individuales del jugador (goles, condición de MVP) asociadas a cada match_id.

El badge de "RANKING" tiene bajo contraste y falta mapear el delta de ELO del jugador tras la resolución de ese partido.

Plan de Acción (Fix propuesto):

Fix 1 (Identidad del Rival): Modificar el layout de la fila para incluir el escudo del equipo rival (usando expo-image para aprovechar el caché) junto al nombre del equipo o la pastilla de resultado (V/E/D).

Fix 2 (Hitos Individuales): Inyectar renderizado condicional en la fila. Si el jugador registró goles en ese partido, mostrar un indicador visual (ej: "⚽ Anotaste X"). Si fue elegido MVP, agregar un badge de "⭐ MVP".

Fix 3 (Badge y Delta de ELO): Aumentar el peso visual del badge "RANKING" (ej. fondo más saturado o borde distintivo). Asegurar que la consulta a Supabase extraiga la variación de ELO y mostrar explícitamente el delta (ej: "+10 RANK" en verde, "-5 RANK" en rojo).

🐛 Bug / Mejora UI: Perfil de Equipo (Nomenclatura y Gráficos)
Problema detectado: En la vista del equipo, el badge de puntuación dice "PR" en lugar de "RANKING" (o ELO), perdiendo consistencia con el resto de la app. Además, faltan los gráficos de trayectoria y goles que sí existen en el perfil de jugador.

Diagnóstico Técnico:

El texto del badge está hardcodeado o consumiendo una variable incorrecta (PR).

Los componentes de gráficos (Chart o similares) no están instanciados en la vista de equipo.

Plan de Acción (Fix propuesto):

Fix 1 (Nomenclatura): Cambiar el texto del badge de "PR" a "RANKING" (o "ELO", según el estándar que definamos) para mantener la coherencia en toda la plataforma.

Fix 2 (Gráficos de Trayectoria): Reutilizar los componentes de gráficos de evolución que ya se programaron para el perfil de jugador e inyectarlos en esta pantalla, pasándoles la data histórica del equipo.

🐛 Bug / Mejora UI: Layout y Espaciados (Ajustes y Gestión de Equipo)
Problema detectado: En la pantalla de Perfil/Ajustes, el botón de "Cerrar Sesión" queda pegado al límite inferior y colisiona visualmente con la Bottom Tab Bar. En la pantalla de Gestión de Equipo, las "Solicitudes Pendientes" aparecen antes que el plantel actual, rompiendo la prioridad de lectura.

Diagnóstico Técnico:

El ScrollView de Ajustes no contempla el alto de la barra inferior en su margen interno final.

El orden de los componentes renderizados en Gestión de Equipo está invertido respecto a la lógica de uso diario.

Plan de Acción (Fix propuesto):

Fix 1 (Padding Bottom): Agregar un paddingBottom (ej: 80px o calculando el alto de la tab bar) al contentContainerStyle del ScrollView en la pantalla de Ajustes, para que el usuario pueda scrollear más allá del botón de cerrar sesión.

Fix 2 (Reordenamiento): En el archivo de Gestión de Equipo, mover el bloque/componente de Solicitudes Pendientes para que se renderice estrictamente debajo del componente del Plantel activo.

🐛 Bug / Mejora UI: Unificación de Headers Secundarios
Problema detectado: Las pantallas de Estadísticas de Perfil y Gestión de Equipo tienen cabeceras diferentes entre sí y distintas a la nueva cabecera de Notificaciones.

Diagnóstico Técnico:

Hay código duplicado y estilos inconsistentes manejando la navegación superior en pantallas de segundo nivel.

Plan de Acción (Fix propuesto):

Fix 1 (Componente Global): Crear o actualizar un componente unificado (SecondaryHeader o similar) que implemente el diseño acordado: botón limpio de "Volver" con flecha a la izquierda, título centrado o alineado a la izquierda según corresponda, y aplicando correctamente el paddingTop del SafeArea. Reemplazar las cabeceras actuales en Stats y Gestión de Equipo por este componente único.

🐛 Bug / Mejora UI: Unificación Masiva de Headers Secundarios
Problema detectado: Las pantallas de Mis Solicitudes, Unirse a Equipo, Crear Equipo y Stats del Equipo siguen utilizando diseños de cabecera desactualizados, con textos gigantes, botones de "Volver" con caja sólida y sin respetar correctamente los márgenes del Safe Area.

Diagnóstico Técnico:

Estas pantallas no están importando el nuevo componente unificado de cabecera secundaria que propusimos anteriormente.

Existe deuda técnica y código duplicado (<View>, <Text>, <TouchableOpacity>) hardcodeado en la parte superior de cada una de estas vistas.

Plan de Acción (Fix propuesto):

Fix 1 (Refactorización): Extender el uso del nuevo componente SecondaryHeader (con el botón de volver en formato texto limpio + ícono de flecha) a las pantallas de /mis-solicitudes, /unirse-equipo, /crear-equipo y /team-stats. Asegurar que este componente global maneje internamente el paddingTop usando insets.top.

🐛 Bug / Mejora UI: Búsqueda y Resultados de Equipos (Unirse a Equipo)
Problema detectado: Al ingresar un código de invitación y encontrar un equipo (ej. "Equipo B"), la tarjeta de resultado muestra el nombre, zona y formato, pero no muestra el escudo del club.

Diagnóstico Técnico:

El componente que renderiza la tarjeta de previsualización del equipo buscado no tiene implementada la UI para el escudo.

Es probable que la consulta a la base de datos ya traiga el logo_url o avatar_url, pero simplemente no se esté consumiendo en la vista.

Plan de Acción (Fix propuesto):

Fix 1 (Escudo en Tarjeta): Agregar el componente expo-image (o el componente genérico de escudos de la app) a la izquierda de la información del equipo en la tarjeta de resultados. Configurar un tamaño adecuado (ej: w-12 h-12) y un fallback visual (iniciales) por si el equipo no tiene escudo cargado.

🐛 Bug / Mejora UI: Resumen de Stats Públicas (Stats del Equipo)
Problema detectado: En la vista pública de estadísticas del equipo, hay un espacio vacío junto a los recuadros de "Rating" (que debemos renombrar) y "Fair Play". Falta destacar el Promedio de Edad del plantel.

Diagnóstico Técnico:

El dato del promedio de edad se calcula y muestra en la vista privada de "Gestión", pero no se está exponiendo como un recuadro (badge) principal en el perfil público.

Plan de Acción (Fix propuesto):

Fix 1 (Badge Promedio de Edad): Crear un tercer recuadro en la fila superior de estadísticas (junto a Rating y Fair Play) destinado exclusivamente al Promedio de Edad. Reutilizar la lógica de cálculo de edades del plantel que ya existe en el panel de gestión para inyectar este dato en la vista pública.

¡Detalle de oro! La consistencia tipográfica es fundamental. Si venimos usando mayúsculas fuertes para los títulos de las secciones principales, que el panel de administración quede en minúsculas o formato "Título" lo hace ver como una sección sin terminar.

Además, esto refuerza nuestra decisión anterior: si centralizamos todo en un único componente de cabecera (SecondaryHeader), le podemos clavar la clase uppercase ahí mismo y nos olvidamos del problema para siempre en toda la app.

Acá tenés el bloque para sumar a la lista:

🐛 Bug / Mejora UI: Tipografía en Cabeceras del Panel de Admin
Problema detectado: Los títulos de las pantallas dentro del Panel de Administración (Temporadas, Logs, WO, Disputas) no están en mayúsculas, rompiendo la consistencia visual con el resto de las cabeceras de la aplicación.

Diagnóstico Técnico:

Las rutas de administración están pasando strings en formato normal o "Title Case" a sus cabeceras, y el componente de texto no está forzando la capitalización.

Plan de Acción (Fix propuesto):

Fix 1 (Forzar Mayúsculas): Aprovechar la refactorización hacia el nuevo componente unificado SecondaryHeader para agregarle la clase de utilidad uppercase (de NativeWind/Tailwind) directamente al elemento <Text> del título. Esto garantizará que, sin importar cómo se pase el string desde la pantalla (ej: "Temporadas" o "temporadas"), siempre se renderice como "TEMPORADAS". Aplicar este header a todas las vistas de /admin.

🐛 Bug / Mejora UI: Unificación Final de Headers (Ajustes y Legales)
Problema detectado: Las pantallas de Editar Perfil, Preferencias, Términos y Condiciones y Política de Privacidad mantienen un diseño de cabecera obsoleto, desentonando con la nueva línea de la app.

Diagnóstico Técnico: Estas vistas secundarias (probablemente anidadas en el stack del Perfil) no están consumiendo el nuevo componente global.

Plan de Acción (Fix propuesto):

Fix 1 (Refactorización Final): Reemplazar las cabeceras actuales en /profile-edit, /preferences, /terms y /privacy por el componente unificado SecondaryHeader, asegurando que hereden la tipografía en mayúsculas y el padding correcto del Safe Area.

🐛 Bug / Mejora UI: Espaciado en Pantalla de Preferencias
Problema detectado: La pantalla de Preferencias tiene un margen horizontal (padding a los costados) excesivamente grande, aplastando los botones del menú hacia el centro.

Diagnóstico Técnico: El contenedor principal de esta vista tiene una clase de padding horizontal (ej. px-8 o px-10) que no respeta el espaciado estándar del resto de las pantallas.

Plan de Acción (Fix propuesto):

Fix 1 (Ajuste de Container): Reducir el padding horizontal del contenedor en la vista de Preferencias para igualarlo al margen estándar de la aplicación (usualmente px-4 o px-5).

📝 Actualización de Contenido: Términos y Condiciones
Problema detectado: El documento de Términos y Condiciones necesita una actualización de copy.

Diagnóstico Técnico: El componente de texto plano o el archivo que aloja las constantes legales tiene información desactualizada.

Plan de Acción (Fix propuesto):

Fix 1 (Actualización de Copy): Reemplazar el texto duro en la pantalla de Términos y Condiciones con la última versión redactada para la Beta (se le debe proveer el nuevo texto a la IA al momento de ejecutar).

¡Espectacular! Con estas capturas terminamos de confirmar que el componente SecondaryHeader nos va a salvar la vida. Reemplazando uno por uno estos headers viejos, la app va a quedar 100% simétrica y profesional.

Además, los detalles de UX que marcaste en el Mercado (el Empty State, la posición del botón flotante y el copy de las postulaciones) son fundamentales. Un estado vacío ("No se encontraron publicaciones") tiene que invitar a la acción, no parecer un error.

Acá te armé los últimos bloques para cerrar definitivamente tu archivo maestro de QA:

🐛 Bug / Mejora UI: Unificación de Headers (Ronda Final)
Problema detectado: Las pantallas de Reglas del Juego, Mis Postulaciones y Buscar Jugador (formulario) siguen con cabeceras inconsistentes, y en algunos casos (Buscar Jugador) el título no está en mayúsculas.

Diagnóstico Técnico: Faltó propagar la refactorización a estas pantallas periféricas.

Plan de Acción (Fix propuesto):

Fix 1 (Reemplazo Global): Inyectar el componente SecondaryHeader (con la clase uppercase ya configurada) en /rules, /postulations y la pantalla de creación de búsquedas, eliminando el código viejo de cabecera en cada una de ellas.

🐛 Bug / Mejora UI: Mercado (Empty State y Botón Flotante)
Problema detectado: Cuando no hay publicaciones en el Mercado, el mensaje "No se encontraron publicaciones" es muy plano y queda tirado arriba. Además, el botón flotante de agregar (+) quedó muy pegado a la barra inferior de navegación.

Diagnóstico Técnico:

El componente de Empty State no tiene estilos de flexbox para centrarse verticalmente ni suficiente peso visual.

La posición absoluta del FAB (Floating Action Button) no está contemplando el nuevo alto de la Bottom Tab Bar.

Plan de Acción (Fix propuesto):

Fix 1 (Empty State Llamativo): Envolver el mensaje de "No hay publicaciones" en un contenedor con flex-1, justify-center y items-center. Agrandar el ícono de la cancha, darle un color más suave (ej: text-neutral-outline) y hacer la tipografía más amigable para que llene el espacio vacío.

Fix 2 (Ajuste del FAB): Sumarle unos píxeles extra (ej: bottom: 80 o bottom: 96) al estilo del botón flotante (+) para que respire por encima de la barra de navegación inferior.

📝 Mejora UX / Copy: Aclaración en Postulaciones Aceptadas
Problema detectado: En la pantalla de Mis Postulaciones, cuando una solicitud es "ACEPTADA", falta claridad sobre cuáles son los siguientes pasos o qué implicancias tiene esa acción dentro del sistema.

Diagnóstico Técnico: El texto de ayuda condicional para el estado ACCEPTED es demasiado breve o ambiguo.

Plan de Acción (Fix propuesto):

Fix 1 (Refinar Copy): Actualizar el bloque de texto que se renderiza cuando el estado de la postulación es aceptado. Debe explicar claramente si el jugador ya fue agregado al plantel automáticamente y recordar que deben coordinar los detalles (día, hora, pago) por el chat del Mercado.
🐛 Bug / Mejora UI: Listado y Detalle de Chats
Problema detectado: En la lista de "Mis Chats de Mercado", el título no está en mayúsculas. En el detalle del chat, el nombre del usuario tampoco está en mayúsculas y le falta padding al header.

Diagnóstico Técnico:

Las cabeceras de navegación de la sección de chats no están forzando la capitalización.

El layout personalizado de la cabecera del chat (que incluye el avatar) tiene los márgenes desajustados.

Plan de Acción (Fix propuesto):

Fix 1 (Listado): Aplicar la clase uppercase al título de la pantalla de lista de chats.

Fix 2 (Detalle y Padding): En la cabecera interna del chat, forzar el texto del nombre a mayúsculas y aumentar el paddingTop o paddingVertical para que el avatar y el texto respiren respecto a la barra de estado y el botón de volver.

🐛 Bug / Mejora UI: Teclado Tapando Input (Chat)
Problema detectado: Al abrir el teclado en la pantalla de chat, el campo de texto (input) y las acciones rápidas ("Invitar a Equipo") quedan tapados, impidiendo ver lo que se está escribiendo.

Diagnóstico Técnico: El contenedor de la pantalla de chat no está reaccionando correctamente a la aparición del teclado nativo del sistema.

Plan de Acción (Fix propuesto):

Fix 1 (KeyboardAvoidingView): Envolver la pantalla de chat (o su layout principal) en un componente <KeyboardAvoidingView>. Asegurar que en iOS use behavior="padding" y en Android probar con behavior="height" o ajustando el keyboardVerticalOffset según el alto de la cabecera, para que la vista empuje el input hacia arriba cuando el teclado se despliega.

🐛 Bug / Mejora UI: Padding Inferior en Modal "Cambiar Equipo"
Problema detectado: En el modal para cambiar de equipo activo, la lista de equipos choca contra el límite inferior de la pantalla, colisionando con la barra de navegación de Android (botones o gesture bar).

Diagnóstico Técnico: El contenedor del modal (o el FlatList/ScrollView interno) no está considerando el área segura inferior del dispositivo.

Plan de Acción (Fix propuesto):

Fix 1 (Safe Area Bottom): Importar useSafeAreaInsets en el componente de este modal y aplicarle un paddingBottom: insets.bottom + 16 (o al contentContainerStyle si es una lista) para asegurar que el último equipo de la lista quede cómodo y clickeable por encima del marco del celular.

⚙️ Lógica de Negocio: Preselección del Mejor Formato
Problema detectado: Al entrar a la pestaña de Ranking o al ver el Widget de Inicio, la app preselecciona el formato "Preferido/Principal" del equipo activo, en lugar del formato donde el equipo tiene mayor puntaje (ELO).

Diagnóstico Técnico: El estado inicial de los filtros (bootstrapping) está leyendo la columna format (o similar) del equipo directamente.

Plan de Acción (Fix propuesto):

Fix 1 (Lógica de Inicialización): En la función del DAL que inicializa la vista (probablemente fetchActiveTeamRankingInfo), leer los puntajes ELO de todos los formatos que juega el equipo. Usar un Math.max() o una lógica similar para determinar cuál es el best_format y setear ese valor como el filtro inicial (tanto para el Widget de la Home como para el estado de la pestaña Ranking).

⚙️ Lógica de Negocio: Puntaje en Ranking Global / Sin Filtro
Problema detectado: Cuando se visualiza el Ranking Global (sin filtrar por un formato específico), los puntos mostrados corresponden al formato preferido del equipo, en lugar de mostrar su puntaje máximo histórico en cualquier formato.

Diagnóstico Técnico: La consulta a Supabase (RPC o View) que trae la tabla global está devolviendo el ELO base del equipo sin buscar su tope.

Plan de Acción (Fix propuesto):

Fix 1 (Actualización de RPC en BD): Modificar la función get_team_ranking (o la que se utilice para la tabla global). Si el parámetro de formato viene vacío/nulo (es decir, vista global), la columna de puntaje devuelta debe calcularse usando la función GREATEST(elo_f5, elo_f6, elo_f7, elo_f8, elo_f9, elo_f11) de PostgreSQL, asegurando que cada equipo ranquee con su mejor versión posible.

🐛 Bug / Mejora UI: Widget de Inicio y Pantalla de Censo
Problema detectado: En el widget de Top 3 de la Home, el puntaje dice "ELO" en lugar de "RANKING". En la pantalla del Censo, el header sigue usando el layout viejo.

Diagnóstico Técnico: Textos hardcodeados y falta de importación del componente global.

Plan de Acción (Fix propuesto):

Fix 1 (Nomenclatura): Cambiar el string "ELO" por "RANKING" (o dejar solo el número si el espacio es reducido) en el componente del mini-ranking de la Home.

Fix 2 (Header Censo): Reemplazar la cabecera actual de /censo por el nuevo SecondaryHeader.

🐛 Bug / Mejora UI: Alineación y Padding en Pestaña Ranking
Problema detectado: Las columnas de la tabla de posiciones (EQUIPO, EF%, RATING) están desalineadas respecto a sus títulos. Además, el último jugador de la lista choca contra la barra de navegación inferior.

Diagnóstico Técnico:

Los anchos de las columnas (flex o width) en la fila de títulos no coinciden exactamente con los de la fila de datos (FlatList render item).

El contenedor principal de la pantalla Ranking no tiene suficiente paddingBottom.

Plan de Acción (Fix propuesto):

Fix 1 (Grilla estricta): Asignar proporciones rígidas a las columnas. Por ejemplo: w-8 para la posición (#), flex-1 para el Equipo (alineado a la izquierda), w-16 para EF% (centrado) y w-16 para RATING (alineado a la derecha). Aplicar exactamente las mismas clases tanto en el header de la tabla como en el renderizado de la fila.

Fix 2 (Padding Bottom): Agregar paddingBottom: insets.bottom + 80 (o el equivalente al alto de la tab bar) al contenedor principal de la vista de Ranking.

🐛 Bug / Mejora UI: Carga infinita en "Mis Equipos" (Home)
Problema detectado: Al tocar el enlace "Ver ranking" que aparece en el encabezado de la sección "Mis Equipos" en la pestaña de Inicio, la app entra en un estado de carga infinita y se cuelga.

Diagnóstico Técnico: El botón está despachando una navegación o acción con parámetros inválidos que corrompe el estado de la vista de destino, además de ser redundante a nivel UI.

Plan de Acción (Fix propuesto):

Fix 1 (Eliminación de redundancia): Ir a la pantalla de la Home (/(tabs)/index.tsx o similar), buscar el componente de cabecera de la sección "Mis Equipos" (probablemente un SectionHeader) y eliminar por completo el botón/enlace derecho que dice "Ver ranking". Dejar solo el título de la sección.

🐛 Bug / Mejora UI: Secciones Colapsables en Pestaña Partidos
Problema detectado: Las secciones como "COMO INVITADO" o "HISTORIAL" en la vista de Partidos muestran todos los ítems de corrido. Con muchos partidos, la pantalla se vuelve muy larga y difícil de navegar.

Diagnóstico Técnico: Los encabezados de sección son estáticos y no tienen un estado de expansión/colapso (isExpanded).

Plan de Acción (Fix propuesto):

Fix 1 (Acordeón): Convertir los encabezados de sección en un <TouchableOpacity>. Agregar un ícono de "chevron" (flecha hacia abajo/arriba) a la derecha. Implementar un estado local (useState) para cada sección y renderizar la lista de partidos condicionalmente solo si la sección está expandida.

🐛 Bug / Mejora UI: Header y Empty State en "Desafíos"
Problema detectado: La pantalla de Desafíos mantiene el header desactualizado (texto verde, botón viejo) y su Empty State ("No hay desafíos...") es pequeño y no resalta.

Diagnóstico Técnico: Falta implementar el componente global y aplicar flexbox al estado vacío.

Plan de Acción (Fix propuesto):

Fix 1 (Header): Reemplazar la cabecera por el SecondaryHeader.

Fix 2 (Empty State): Aplicar el mismo patrón visual que al Mercado: contenedor con flex-1, justify-center, items-center, agrandar el ícono del buzón y darle un color más suave a la tipografía.

⚙️ Mejora UX / Lógica: Cálculo de Distancia en Mercado
Problema detectado: En el modal de "Enviar Propuesta" y en las tarjetas del feed del Mercado, cuando la publicación tiene un complejo deportivo asignado, no se muestra a qué distancia se encuentra el usuario de dicho complejo.

Diagnóstico Técnico: El componente de la tarjeta del Mercado y el Modal no están consumiendo o calculando la distancia geolocalizada entre las coordenadas de la zona del usuario y las coordenadas del complejo.

Plan de Acción (Fix propuesto):

Fix 1 (Cálculo y Renderizado): Incorporar una función utilitaria (ej. fórmula de haversine) o aprovechar la consulta a la base de datos para calcular la distancia. En la UI de la tarjeta del Mercado y en el modal de la propuesta, renderizar un pequeño badge o texto (ej: "📍 a 2.5 km") al lado del nombre del complejo, condicionado a que existan ambas coordenadas.

🐛 Bug / Mejora UI: Ícono de Notificación Push
Problema detectado: La imagen/ícono que aparece en la barra de estado del sistema al recibir una notificación push de la app no se ve correctamente o está desactualizada.

Diagnóstico Técnico: El asset configurado para las notificaciones push locales/remotas (probablemente en app.json de Expo o en la configuración nativa) es incorrecto, no tiene las proporciones adecuadas, o le falta el canal alfa (transparencia) requerido por Android.

Plan de Acción (Fix propuesto):

Fix 1 (Asset de Notificación): Revisar la configuración del proyecto (ej. notification.icon en Expo). Asegurarse de utilizar un ícono monocromático en formato PNG con fondo transparente, idealmente de 96x96px. Actualizar la referencia y regenerar los prebuilds o builds de ser necesario para que el sistema operativo lo parsee correctamente.