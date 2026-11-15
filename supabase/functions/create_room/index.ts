// Edge Function create_room (Deno). Toda la lógica está en _shared/createRoom.ts.
import { handleCreateRoom } from '../_shared/createRoom.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { createSupabaseStore } from '../_shared/supabaseStore.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en la función.');

const store = createSupabaseStore(url, serviceKey);
const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

Deno.serve((req) =>
  handleCreateRoom(req, { store, now: () => new Date(), allowedOrigins, uuid: () => crypto.randomUUID() })
);
