¡Me parece una movida excelente! Capturar el feedback sin fricción y tener telemetría propia (logs) te va a dar una ventaja enorme en la beta. Vas a poder ver los errores antes de que los usuarios se quejen.Acá te divido la respuesta en dos partes: primero, la estrategia para armar tu Google Form como un profesional, y segundo, el prompt exacto para tirarle a Claude.1. Cómo armar el Google Form (Nivel Pro)La regla de oro para el feedback en una Beta es cero fricción. Si el usuario tiene que escribir mucho, cierra la pantalla.Te recomiendo que el formulario tenga solo 3 preguntas:¿Qué tipo de mensaje es? (Opción múltiple: 🐞 Reportar un Error / 💡 Sugerir una Mejora / 💬 Otro).¿Qué pasó o qué te gustaría ver? (Párrafo largo - Obligatorio).¿Cómo es tu email o usuario? (Respuesta corta - Opcional).🔥 El Truco del Enlace Prellenado (Pre-filled URL):En vez de pedirle al usuario su email de nuevo (que ya lo tenés en la app), podés hacer que la app se lo pase directamente al Formulario.Creá el Google Form.Andá a los 3 puntitos arriba a la derecha $\rightarrow$ Obtener vínculo prellenado.Escribí un texto falso en la pregunta del Email (ej: EMAIL_ACA) y tocá "Obtener vínculo".Copiá ese link. Va a tener un formato parecido a [https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.123456=EMAIL_ACA](https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.123456=EMAIL_ACA).Ese es el link que tenés que pegar en el prompt de abajo. La app va a reemplazar EMAIL_ACA por el mail real del usuario logueado.2. El Prompt para el Agente Claude CodeEste prompt le va a pedir al agente que arme toda la infraestructura de logs en la base de datos (con una migración SQL), cree una utilidad en el frontend para registrar los errores, arme la pantalla del panel de admin para que los leas, y agregue el botón del formulario.Copialo y pegalo:PlaintextActúa como Senior Full Stack Engineer. Estamos preparando la Beta de "torneAR" y necesitamos implementar un canal de feedback y un sistema integral de logs.

Lee los archivos necesarios y **APLICA LOS CAMBIOS FÍSICAMENTE**. Ejecuta estrictamente este plan:

**Fase 1: Infraestructura de Logs (Base de Datos)**
1. Crea una nueva migración en `supabase/migrations/` para crear la tabla `app_logs`.
   - Columnas: `id` (uuid), `level` (text: 'info', 'warn', 'error'), `message` (text), `details` (jsonb, nullable, para meter el stacktrace o data extra), `user_id` (uuid, nullable, FK a auth.users), `created_at` (timestamptz).
   - Crea políticas RLS: Cualquier usuario (incluso anónimos o autenticados) puede INSERTAR (solo insertar, no leer ni borrar).
   - Solo los usuarios con `is_admin = true` en `profiles` pueden hacer SELECT.

**Fase 2: El Servicio de Logger (Frontend)**
1. Crea un archivo `lib/logger.ts` (o en la carpeta utilidades que corresponda).
2. Implementa una clase o constantes exportadas con métodos: `Logger.info()`, `Logger.warn()`, `Logger.error()`.
3. Estos métodos deben hacer un `supabase.from('app_logs').insert(...)` de forma asíncrona ("fire and forget" sin bloquear el hilo principal), inyectando el `user_id` del store de sesión si existe.
4. (Opcional pero recomendado) Exporta una función para atajar los unhandled promise rejections o errores globales de React Native y mandarlos a `Logger.error()`.

**Fase 3: Panel de Administración de Logs**
1. Crea una nueva pantalla en `app/admin/logs.tsx`.
2. Implementa una lista (FlatList o ScrollView) que haga un fetch a la tabla `app_logs` ordenada por `created_at` descendente.
3. Agrega un filtro básico visual (chips o select) para ver solo 'error', 'warn' o 'info'.

**Fase 4: Botón de Feedback (UX)**
1. En la pantalla `app/(tabs)/profile.tsx` (o en `settings.tsx`), agrega un botón destacado (ej: "Sugerencias o Reportar Error").
2. Este botón debe usar `expo-web-browser` o `Linking.openURL` para abrir el siguiente enlace de Google Forms (usa la URL literal, pero reemplaza la parte del parámetro de email si puedes concatenarle el email del usuario logueado):
   [NOTA PARA AGUS: REEMPLAZA ESTO POR EL LINK PRELLENADO DE GOOGLE FORMS]

Confírmame cuando todo esté implementado, la migración generada y el linter siga en verde. Asegúrate de no romper ninguna regla de UI preexistente ni desbordamientos de texto.
Cuando Claude termine esto, vas a tener tu propia consola de monitoreo incrustada directo en la app para atajar cualquier problema en la Beta al instante. ¡Avisame cómo resulta!