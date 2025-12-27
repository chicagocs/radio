// scripts/supabase-presence.js

let currentChannel = null;

export function getUserUniqueID() {
  let userId = localStorage.getItem('radio_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('radio_user_id', userId);
  }
  return userId;
}

export async function joinStation(supabase, stationId) {
  // Salir del canal anterior si existe
  if (currentChannel) {
    await supabase.removeChannel(currentChannel);
  }

  const channelName = `station:${stationId}`;
  const userId = getUserUniqueID();

  currentChannel = supabase
    .channel(channelName, {
      config: {
        presence: { key: userId }
      }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = currentChannel.presenceState();
      const count = Object.keys(state).length;
      const counterElement = document.getElementById('totalListeners');
      if (counterElement) {
        counterElement.textContent = count;
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await currentChannel.track({ online_at: new Date().toISOString() });
      }
    });

  return currentChannel;
}

export async function leaveStation(supabase) {
  if (currentChannel) {
    await supabase.removeChannel(currentChannel);
    currentChannel = null;
    const counterElement = document.getElementById('totalListeners');
    if (counterElement) counterElement.textContent = '0';
  }
}
