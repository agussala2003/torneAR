/**
 * `tsc` (a diferencia de Metro) no resuelve los sufijos de plataforma
 * `.native.ts` / `.web.ts` — necesita un módulo llamado literalmente
 * `instagram-stories` para poder tipar `@/lib/instagram-stories`. Este
 * archivo sólo declara la forma pública; en runtime Metro ignora este `.d.ts`
 * y elige `instagram-stories.native.ts` o `instagram-stories.web.ts` según
 * la plataforma del bundle, como corresponde.
 */
export function shareToInstagramStories(uri: string): Promise<void>;
