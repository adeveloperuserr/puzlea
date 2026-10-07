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

export async function listPendingPuzzles() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('gallery_puzzles')
    .select('id,title,description,storage_path,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
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
  const { error: uploadError } = await supabase.storage.from('gallery-images').upload(path, imageBlob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('gallery_puzzles').insert({
    author_id: userId,
    title: title.trim(),
    description: description.trim() || null,
    storage_path: path,
    status: 'pending',
  }).select('id').single();
  if (error) {
    await supabase.storage.from('gallery-images').remove([path]);
    throw error;
  }
  return data;
}
