// Shims uniquement pour l'IDE / linter TypeScript (le runtime est Deno).
// Ne pas importer ce fichier en runtime.

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

declare module 'npm:web-push' {
  const webpush: any
  export default webpush
}

declare module 'npm:@supabase/supabase-js' {
  export const createClient: any
}

