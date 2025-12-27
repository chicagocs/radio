// scripts/supabase-presence.js

export function getUserUniqueID() {
  let userId = localStorage.getItem('radio_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('radio_user_id', userId);
  }
  return userId;
}

export async function joinStation(supabase, stationId) {
  const userId = getUserUniqueID();
  const { data, error } = await supabase
    .from('listeners')
    .insert({ station_id: stationId, user_id: userId, last_seen: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    console.warn('Error joining station:', error);
    return null;
  }
  return data;
}

export async function leaveStation(supabase, channel) {
  const userId = getUserUniqueID();
  const { error } = await supabase
    .from('listeners')
    .delete()
    .match({ station_id: channel, user_id: userId });

  if (error) {
    console.warn('Error leaving station:', error);
  }
}
