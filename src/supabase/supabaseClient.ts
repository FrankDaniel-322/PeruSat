import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || typeof url !== 'string' || !anonKey || typeof anonKey !== 'string') {
    return false;
  }

  // Descartar placeholders o URLs incompletas
  if (url.includes('tu-proyecto') || !url.startsWith('http')) {
    return false;
  }

  return true;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(
  customUrl?: string,
  customAnonKey?: string,
): SupabaseClient | null {
  if (cachedClient && !customUrl && !customAnonKey) {
    return cachedClient;
  }

  const url = customUrl ?? import.meta.env.VITE_SUPABASE_URL;
  const anonKey = customAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey || typeof url !== 'string' || typeof anonKey !== 'string') {
    return null;
  }

  if (url.includes('tu-proyecto') || !url.startsWith('http')) {
    return null;
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  if (!customUrl && !customAnonKey) {
    cachedClient = client;
  }

  return client;
}

/**
 * Garantiza una sesión autenticada para el jugador mediante autenticación anónima.
 * Asigna un UUID único a cada navegador sin exigir formulario de registro.
 */
export async function ensureAnonymousUser(client: SupabaseClient): Promise<User> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw new Error(`Error al recuperar sesión: ${sessionError.message}`);
  }

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data: authData, error: authError } = await client.auth.signInAnonymously();
  if (authError || !authData.user) {
    throw new Error(`Error al iniciar sesión anónima: ${authError?.message ?? 'Usuario no generado'}`);
  }

  return authData.user;
}
