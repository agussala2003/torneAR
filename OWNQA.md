🐛 Bug / Mejora UI: Historial de Últimos Partidos (Stats del Jugador)
Problema detectado:

El texto "vs" aparece después del escudo, cortando la lectura natural ("Escudo vs Equipo" en lugar de "vs Escudo Equipo").

El badge de subida/bajada de ranking ocupa mucho espacio junto a la fecha. Debería ir debajo del resultado (marcador) como texto simple (verde o rojo), igual que en las stats de equipo.

El copy de los goles dice "Anotaste X" para todos los perfiles, incluso si estás viendo las estadísticas de otro jugador.

Diagnóstico Técnico:

El layout flex-row en la fila del partido tiene el componente de imagen renderizado antes que el texto "vs".

El delta de ELO está agrupado en el contenedor de los subtítulos de la izquierda, con estilos de badge (caja con fondo).

El string de goles está hardcodeado en segunda persona y no valida el user_id actual.

Plan de Acción (Fix propuesto):

Fix 1 (Orden Visual): En el componente de la fila, reordenar los elementos para que el layout quede: <Text>vs</Text> -> <ExpoImage escudo/> -> <Text>Nombre del Rival</Text>.

Fix 2 (Posición del Delta): Mover el renderizado condicional del delta de ranking (+X RANK / -X RANK) al contenedor derecho, justo debajo del marcador del partido. Quitarle las clases de fondo/badge y dejarlo como texto simple (ej. text-semantic-success para subidas, text-semantic-danger para bajadas).

Fix 3 (Copy Dinámico): Traer el ID del usuario logueado (desde el auth context o store) y compararlo con el ID del jugador del perfil. Si coinciden, renderizar Anotaste ${goles}; si son distintos, renderizar Anotó ${goles}.

🐛 Bug / Mejora UI: seccion de Trayectoria en Stats de Jugador
Problema detectado: En la pestaña pública de estadísticas del jugador falta el seccion de trayectoria (evolución del ranking) que sí aparece en la pestaña de "Mi Perfil".

Diagnóstico Técnico: El componente del seccion (ej. PlayerEloChart o similar) no se está instanciando en la pantalla pública (profile-stats.tsx o la ruta equivalente).

Plan de Acción (Fix propuesto):

Fix 1 (Reutilización de Componente): Importar e inyectar el componente del seccion de trayectoria en la pantalla pública de Stats del Jugador (ya sea propia o de terceros). Asegurar de pasarle como prop la data histórica del jugador consultado para que la curva de evolución se renderice correctamente.

🐛 Bug / Mejora UI: Skeleton de Gestión de Equipo (Header Viejo)
Problema detectado: Al ingresar a la pantalla de Gestión del Equipo, el loader (skeleton) renderiza el diseño de la cabecera antigua. Cuando finaliza la carga, pega un salto visual al renderizar el nuevo SecondaryHeader.

Diagnóstico Técnico: El componente de carga (probablemente loading.tsx de esa ruta, o un componente TeamManageSkeleton) no fue incluido en el reemplazo masivo de la Fase 1 y sigue usando el bloque de <View> hardcodeado con el layout viejo.

Plan de Acción (Fix propuesto):

Fix 1 (Actualización de Skeleton): Importar y utilizar el SecondaryHeader dentro del skeleton de Gestión de Equipo para que el layout de la cabecera sea idéntico durante la carga y después de ella. Si el skeleton bloquea interacciones, asegurarse de que el botón de volver mantenga su estructura pero esté deshabilitado, o simplemente replicar la estructura exacta del SecondaryHeader (padding dinámico, título apilado en mayúsculas) con elementos estáticos de placeholder.

🐛 Bug / Mejora UI: Tarjetas de Stats de Temporada (Stats del Equipo)
Problema detectado: En la sección "Temporada", las tarjetas de estadísticas del equipo agrupan información (ej: "15" Goles a favor con el texto secundario "Prom. 7.50 / PJ" dentro de la misma caja). Esto rompe la consistencia visual con las estadísticas del Perfil de Jugador, donde cada tarjeta muestra un único valor limpio.

Diagnóstico Técnico:

La vista de estadísticas del equipo está utilizando una variante del componente de tarjeta que admite subtítulos, o está renderizando información combinada que debería ir por separado.

La grilla actual no está aprovechando el espacio para desplegar todas las métricas de forma atómica.

Plan de Acción (Fix propuesto):

Fix 1 (Unificación de Componente): Refactorizar la grilla de "Temporada" en la vista del equipo para reutilizar exactamente el mismo componente de tarjeta atómica (StatCard o equivalente) que se usa en la vista del jugador.

Fix 2 (Separación de Métricas): Extraer los datos combinados. Dejar "Goles a Favor" y "Goles en Contra" como números enteros solitarios. Crear nuevas tarjetas individuales en la grilla para "Prom. Goles" y cualquier otra métrica secundaria relevante, asegurando que cada bloque comunique un solo concepto.

🐛 Bug / Mejora UI: Historial de Últimos Partidos (Stats del Equipo)
Problema detectado: En la vista de estadísticas del equipo, la lista de "Últimos Partidos" no muestra el escudo del rival, perdiendo consistencia visual con la lista homóloga del perfil de jugador.

Diagnóstico Técnico: El componente o la vista que renderiza el historial del equipo no fue actualizado con el nuevo layout de fila que incluye el componente de imagen del escudo.

Plan de Acción (Fix propuesto):

Fix 1 (Escudo del Rival): Reutilizar el componente de fila actualizado de las estadísticas del jugador (o aplicar la misma lógica con expo-image e iniciales de fallback) en la pantalla de Stats del Equipo. Asegurar que el orden visual sea <Text>vs</Text> -> <ExpoImage> -> <Text>Rival</Text>.

⚙️ Lógica de Negocio: Cálculo de Porcentaje de Presencia (Plantel)
Problema detectado: El porcentaje de presencia mostrado en el listado de jugadores dentro de la gestión/vista del equipo arroja valores matemáticamente incorrectos.

Diagnóstico Técnico: La fórmula actual está tomando una variable errónea como denominador (ej. total de partidos históricos del jugador en general) o no está filtrando correctamente las asistencias del jugador limitadas estrictamente a los partidos disputados por ese equipo en particular.

Plan de Acción (Fix propuesto):

Fix 1 (Corrección de Query/Fórmula): Modificar la función derivada en el frontend o la consulta RPC en Supabase para que el cálculo estricto sea: (Cantidad de partidos donde el Jugador X fue convocado/jugó para el Equipo Y / Cantidad TOTAL de partidos disputados por el Equipo Y) * 100.

Fix 2 (Formateo): Asegurarse de aplicar un Math.round() o truncar los decimales para que en la UI se lea un número limpio (ej: 75%).

🐛 Bug / Mejora UI: Espaciado Superior tras SecondaryHeader (Admin y Logs)
Problema detectado: En pantallas como Logs de la App y Temporadas, las pestañas de filtro (Todos/Error/Warn) y los bloques superiores pegan directamente contra el borde inferior de la cabecera sin espacio de aire.

Diagnóstico Técnico: Tras la migración al SecondaryHeader, el contenedor del contenido principal (ScrollView o View raíz) perdió el espaciado superior inicial (mt-* o pt-*), quedando adosado al componente de cabecera.

Plan de Acción (Fix propuesto):

Fix 1 (Margen de Contenido): Agregar una clase o estilo de espaciado estándar (ej: mt-3 o pt-3 / 12px) al contenedor que encapsula las pestañas/tarjetas inmediatamente debajo del SecondaryHeader en las pantallas de administración (/admin/logs, /admin/season, etc.) para darles el aire necesario.

🐛 Bug / Mejora UI: Escudo de Equipo en Búsqueda (unirse-equipo.tsx)
Problema detectado: Al ingresar un código de invitación y encontrar un equipo, la tarjeta de resultado muestra el nombre, la zona, la categoría y el formato, pero no renderiza el escudo del club.

Diagnóstico Técnico: El componente o layout que renderiza la tarjeta de previsualización del resultado no está incluyendo el componente de imagen (TeamShield o expo-image), o la consulta que busca el equipo por código no está seleccionando/devolviendo la columna logo_url / avatar_url.

Plan de Acción (Fix propuesto):

Fix 1 (Query & Componente): Asegurar que la consulta por código de invitación seleccione la URL del escudo. En el renderizado de la tarjeta, agregar el componente de escudo a la izquierda de la información del equipo (layout flex-row), configurando un fallback con las iniciales del equipo si no posee un logo cargado.

🐛 Bug / Mejora UI: Edad en Plantel de Equipo (team-stats.tsx / TeamRoster)
Problema detectado: En la vista de estadísticas de equipo (tanto propio como rival), la lista del plantel muestra el nombre y la posición de los jugadores, pero no incluye la edad.

Diagnóstico Técnico: El componente que renderiza la fila del jugador en el plantel no está consumiendo la fecha de nacimiento (birth_date) ni calculando la edad mediante el helper lib/age.ts.

Plan de Acción (Fix propuesto):

Fix 1 (Badge de Edad): Importar calculateAge de lib/age.ts y renderizar un pequeño badge de texto (ej. "24 años") en la fila del jugador junto a su posición/ubicación, asegurando que se oculte si el dato de fecha de nacimiento es nulo.

📝 Actualización de Contenido: Legales (Términos y Privacidad)
Problema detectado: Los textos de Términos y Condiciones (terms.tsx) y Políticas de Privacidad (privacy.tsx) quedaron desactualizados respecto al estado actual del sistema y la beta.

Diagnóstico Técnico: El contenido plano/hardcodeado en las pantallas de legales no refleja los últimos flujos de contratación, pagos y gestión de partidos.

Plan de Acción (Fix propuesto):

Fix 1 (Actualización de Copy): Actualizar las constantes o textos en termsContent.ts / privacyContent.ts para alinearlos con el funcionamiento actual de torneAR.

🐛 Bug / Mejora UI: Teclado Tapando Input en Chats (Mercado y Partido)
Problema detectado: El input de mensaje queda tapado a la mitad cuando se despliega el teclado. El ajuste debe aplicarse condicionalmente solo cuando el teclado está abierto, sin alterar el layout cuando el teclado está cerrado.

Diagnóstico Técnico: El contenedor usa un keyboardVerticalOffset estático o un behavior de KeyboardAvoidingView no calibrado, provocando un mal cálculo del área visible en Android/iOS al alternar el estado del teclado.

Plan de Acción (Fix propuesto):

Fix 1 (Ajuste Dinámico): En los componentes de chat (Mercado y Partido), escuchar el evento del teclado (Keyboard.addListener o mediante el estado interno de KeyboardAvoidingView) para aplicar el offset y la compensación de padding únicamente cuando el teclado esté visible (isKeyboardVisible === true). Mantener el offset en 0 con el teclado cerrado para no desplazar el input.

🐛 Bug / Mejora UI: Layout de "Mis Equipos" en la Home (index.tsx)
Problema detectado: Cuando el usuario pertenece a más de un equipo, la sección "Mis Equipos" cambia su layout a tarjetas reducidas en disposición horizontal (flex-row), comprimiendo la información de ranking, rol y estadísticas.

Diagnóstico Técnico: El componente de la lista de equipos en la Home utiliza renderizado condicional basado en la cantidad de ítems (ej. cambiando entre flex-col para 1 equipo y flex-row / grilla de 2 columnas para 2+ equipos).

Plan de Acción (Fix propuesto):

Fix 1 (Layout Vertical Unificado): Eliminar la lógica que alterna a tarjetas reducidas en columnas. Forzar que el contenedor renderice siempre las tarjetas en orientación vertical (flex-col con gap-3 o space-y-3), permitiendo que cada equipo ocupe todo el ancho disponible (w-full) con el diseño de tarjeta extendida, sin importar si hay 1, 2 o más equipos.

🐛 Bug / Mejora UI: Espaciado Superior en Detalle del Partido (match-detail.tsx)
Problema detectado: En la pantalla "Detalle del Partido", la tarjeta superior que muestra el enfrentamiento (equipos, escudos y badges) pegó directamente contra el borde inferior del SecondaryHeader sin margen vertical.

Diagnóstico Técnico: El contenedor principal del contenido en la vista de detalle del partido perdió el espaciado superior (mt-* o pt-*) tras el reemplazo de la cabecera anterior.

Plan de Acción (Fix propuesto):

Fix 1 (Margen de Contenido): Agregar una clase o estilo de espaciado estándar (mt-3 o pt-3 / 12px) al contenedor principal inmediatamente debajo del SecondaryHeader en match-detail.tsx.

🐛 Bug / Mejora UI: Distancia en Selector de Complejo y Discrepancia Haversine
Problema detectado:

Al seleccionar un complejo durante la creación de una oferta de Mercado (market-create.tsx), la tarjeta del predio no muestra a qué distancia se encuentra del usuario.

Existe una discrepancia donde la propuesta de partido indica "100m" y la tarjeta del Mercado indica "600m" para el mismo lugar.

Diagnóstico Técnico:

La tarjeta de selección de complejo en la creación de oferta no está consumiendo la función utilitaria de distancia.

La vista del Mercado está calculando la distancia contra el centroide de la zone en lugar de priorizar las coordenadas exactas de la relación venue_id (que agregamos en el follow-up).

Plan de Acción (Fix propuesto):

Fix 1 (Badge en Selector): Inyectar el badge de distancia (~ a X m / km) en el componente de selección de complejo de market-create.tsx calculándolo con la zona/ubicación base del usuario.

Fix 2 (Unificación de Lógica): Unificar el helper de distancia para que todas las tarjetas (Mercado, Propuestas, Selector) sigan estrictamente la misma prioridad de origen/destino: Venue Coordinates > Venue Name Match > Zone Centroid. Si hay venue_id, el cálculo DEBE forzar la coordenada exacta del predio.

🧠 Causa Raíz e Incoherencia de Datos
Falta de Contexto del Formato: La tarjeta en "Mis Equipos" renderiza la columna elo_score base/global del equipo o su formato por defecto, mientras que el widget de arriba (Top 3) consulta la tabla team_rankings especificando un formato particular (F5).

Ausencia de Indicador Visual: Si un equipo compite en varios formatos (F5, F7, F11), mostrar "961 RANKING" sin aclaración genera confusión. El usuario asume que es una incoherencia de la app en lugar de su puntaje en otra disciplina.

🛠️ Propuesta de Lógica Unificada (Tres Opciones)
Opción A: "Mejor Formato" (Recomendada)
Lógica: Tanto en "Mis Equipos" como en las vistas donde no hay un filtro de formato explícito, se consulta y muestra siempre el formato donde el equipo tiene su puntaje más alto (Best ELO).

UI: Acompañar el número con una pequeña etiqueta que aclare el formato de dicho puntaje (ej: 1000 RANKING (F5)).

Ventaja: Refleja la mejor versión competitiva del equipo y coincide con la función DISTINCT ON que implementamos para la vista global.

Opción B: "Filtro Dinámico según Widget / Selección Activa"
Lógica: La tarjeta de "Mis Equipos" hereda el mismo filtro de formato que el Widget superior o el best_format calculado en la carga inicial de la pantalla.

UI: Si el widget superior está mostrando "Top 3 Fútbol 5", la tarjeta inferior de "Mis Equipos" DEBE resolver el ELO correspondiente a F5 de ese equipo.

Opción C: "Desglose por Formatos en la Card"
Lógica: Si el equipo participa en más de un formato, mostrar el desglose o permitir conmutar el formato activo dentro de la misma tarjeta del equipo.

### ⚙️ Lógica de Negocio & UI: Unificación de Criterio de Puntaje (RANKING)
* **Problema detectado:** Existe una discrepancia visual en la Home donde un mismo equipo (ej. "Borussia") muestra 1000 RANKING en el Widget de Top 3 (Fútbol 5) y 961 RANKING en la sección "Mis Equipos".
* **Diagnóstico Técnico:** 
  1. El Widget de Top 3 y la Pestaña Ranking resuelven el ELO mediante la consulta filtrada a `team_rankings` por formato (`format_id` / `F5`).
  2. La tarjeta de "Mis Equipos" está leyendo el ELO base/preferido del registro del equipo (`teams.elo_score` o formato por defecto) en lugar del ELO activo/máximo correspondiente.
* **Plan de Acción (Fix propuesto):**
  - **Fix 1 (Lógica de Resoluación Unificada):** Modificar la consulta o helper que alimenta las tarjetas de "Mis Equipos" (`fetchActiveTeamRankingInfo` / `useHomeData`) para que calcule el ELO utilizando exactamente el mismo criterio que el Ranking Global: determinar el `best_format` (`MAX(elo_score)`) del equipo.
  - **Fix 2 (Aclaración de Formato en UI):** En la tarjeta de "Mis Equipos", acompañar la cifra de RANKING con el formato al que pertenece dicho puntaje (ej: "1000 RANKING • F5"), garantizando que si el usuario compara la cifra del widget superior con la tarjeta inferior, ambas coincidan al 100%.