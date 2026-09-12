const byId = id => document.getElementById(id);
let lastMessage = null;
window.focusCat?.onState(state => {
  document.body.className = state.settings.color + (state.direction < 0 ? ' left' : '') + (state.message ? ' paused' : '');
  byId('cat').setAttribute('aria-label', state.settings.name + ' — check in');
  byId('name').textContent = state.settings.name + ' says…';
  const message = state.message;
  byId('bubble').hidden = !message;
  if (message) {
    byId('question').textContent = message.question || 'Time for a little reading check-in.';
    byId('source').textContent = message.source || '';
    byId('error').textContent = message.error || '';
    byId('answer').textContent = message.answer || '';
    if (JSON.stringify(message) !== lastMessage) { byId('answer').hidden = true; byId('reveal').hidden = !message.answer; }
    lastMessage = JSON.stringify(message);
  } else lastMessage = null;
});
for (const [id, action] of Object.entries({ cat: 'remind', close: 'dismiss', done: 'dismiss', disable: 'disable', reader: 'reader' })) byId(id).addEventListener('click', () => window.focusCat?.action(action));
byId('cat').addEventListener('mouseenter', () => window.focusCat?.action('pause'));
byId('cat').addEventListener('mouseleave', () => window.focusCat?.action('walk'));
byId('reveal').addEventListener('click', () => { byId('answer').hidden = false; byId('reveal').hidden = true; });
window.focusCat?.ready();
