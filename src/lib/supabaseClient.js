import { createClient } from '@supabase/supabase-js';
import { supabaseConfigured } from './supabaseConfig';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseReady = supabaseConfigured;
export const supabase = supabaseReady ? createClient(projectUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export async function listApprovedPuzzles() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('gallery_puzzles')
    .select('id,title,description,storage_path,created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (puzzle) => {
    const { data: signed, error: urlError } = await supabase.storage.from('gallery-images').createSignedUrl(puzzle.storage_path, 1800);
    if (urlError) throw urlError;
    return { ...puzzle, imageUrl: signed.signedUrl };
  }));
}

export async function submitPuzzle({ imageBlob, title, description, userId }) {
  if (!supabase) throw new Error('Configura Supabase para compartir en la galería.');
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { data, error } = await supabase.from('gallery_puzzles').insert({
    author_id: userId,
    title: title.trim(),
    description: description.trim() || null,
    storage_path: path,
    status: 'pending',
  }).select('id').single();
  if (error) throw error;
  const { error: uploadError } = await supabase.storage.from('gallery-images').upload(path, imageBlob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) {
    const { error: objectCleanupError } = await supabase.storage.from('gallery-images').remove([path]);
    if (objectCleanupError) {
      throw new Error('La carga falló y no se confirmó la limpieza del archivo. El envío permanece pendiente para revisión.');
    }
    const { error: rowCleanupError } = await supabase.from('gallery_puzzles').delete().eq('id', data.id).eq('status', 'pending');
    if (rowCleanupError) {
      throw new Error('La carga falló y no se pudo completar toda la limpieza. Revisa el envío pendiente en tu cuenta.');
    }
    throw uploadError;
  }
  return data;
}
