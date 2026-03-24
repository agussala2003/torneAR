---
name: create-ui-component
description: Crea un nuevo componente de UI para React Native usando NativeWind y TypeScript estricto. Usa este skill cuando el usuario pida "crear un componente visual", "armar una tarjeta" o "hacer un botón".
---

## Proceso de Creación de Componentes
1. Identifica las props necesarias y defínelas en una `interface`. No exportes la interface a menos que sea necesario.
2. Escribe el componente funcional exportándolo directamente (`export function ComponentName...`).
3. NO uses `StyleSheet`. Utiliza exclusivamente clases de NativeWind en la propiedad `className`.
4. Asegúrate de mapear los colores semánticos de TorneAR (ej. `bg-surface-base`, `text-brand-primary`).
5. Si el componente requiere interacción, utiliza `TouchableOpacity` y controla su opacidad activa (`activeOpacity={0.8}`).
6. El componente debe ser "tonto" (Dumb Component): debe recibir los datos por props y no hacer fetch directo a Supabase.