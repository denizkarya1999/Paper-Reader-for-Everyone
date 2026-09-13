(() => {
  const bridge = window.paperSpeech;
  let state = { id: null, status: 'idle', part: 0, total: 0 }, audio = null, ownedId = null, generation = 0;
  const listeners = new Set();
  function clearAudio() { if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; } }
  function update(next) {
    state = next;
    if (ownedId && (state.id !== ownedId || ['idle', 'error'].includes(state.status))) { generation++; ownedId = null; clearAudio(); }
    if (audio && state.id === ownedId) {
      if (state.status === 'paused') audio.pause();
      else if (state.status === 'playing' && audio.paused) void audio.play().catch(() => bridge.phase({ id: ownedId, status: 'error' }));
    }
    for (const listener of listeners) listener(state);
  }
  async function playNext(id, token) {
    try {
      const result = await bridge.next(id);
      if (token !== generation || ownedId !== id || !result) return;
      clearAudio(); audio = new Audio(result.audio);
      audio.onended = () => { if (token === generation) void playNext(id, token); };
      audio.onerror = () => { if (token === generation) bridge.phase({ id, status: 'error' }); };
      await audio.play();
      if (token === generation) bridge.phase({ id, status: 'playing' });
    } catch { if (token === generation) bridge.phase({ id, status: 'error' }); }
  }
  window.readerSpeech = {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    async start(id, text) {
      if (!bridge) { update({ id, status: 'error', part: 0, total: 0, error: 'Read aloud is available in the installed app.' }); return; }
      const token = ++generation; ownedId = null; clearAudio();
      try {
        const next = await bridge.start({ id, text });
        if (token !== generation) return;
        update(next); if (next.status === 'error') return;
        ownedId = id; void playNext(id, token);
      } catch (error) { update({ id, status: 'error', part: 0, total: 0, error: error.message || 'Could not start reading.' }); }
    },
    stop: () => { generation++; ownedId = null; clearAudio(); void bridge?.stop(); },
    pause: () => { void bridge?.pause(); },
  };
  if (bridge) { bridge.onState(update); void bridge.getState().then(update); }
  window.addEventListener('beforeunload', () => { if (ownedId) void bridge?.stop(ownedId); clearAudio(); });
})();
