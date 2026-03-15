/* Service Worker — Radio MiraMira
   Tourne dans un thread séparé, survit aux rechargements de page.
   Gère l'état audio et communique avec les pages via BroadcastChannel.
*/

const STREAM_URL = 'https://radio.radiomiramira.com/listen/radiomiramira/radio.mp3';
const API_URL    = 'https://radio.radiomiramira.com/api/nowplaying/radiomiramira';
const CHANNEL    = 'radio-miramira';

let audio        = null;
let playing      = false;
let volume       = 0.8;
let npTimer      = null;
let currentNP    = { title: '', artist: '', art: '', genre: '', songId: '' };

const bc = new BroadcastChannel(CHANNEL);

/* Envoie l'état courant à toutes les pages connectées */
function broadcast(msg) {
  try { bc.postMessage(msg); } catch(e) {}
}

function broadcastState() {
  broadcast({ type: 'SW_STATE', playing, volume: volume * 100 });
}

function broadcastNP() {
  broadcast({ type: 'SW_NOWPLAYING', ...currentNP });
}

/* Fetch now playing */
function fetchNP() {
  fetch(API_URL)
    .then(r => r.json())
    .then(d => {
      if (!d?.now_playing) return;
      const s      = d.now_playing.song;
      const songId = s.id || (s.title + s.artist);
      const title  = s.title  || '';
      const artist = s.artist || '';
      const album  = s.album  || '';
      const genre  = s.genre  || '';
      const sub    = [artist, album].filter(Boolean).join(' — ');

      currentNP = { title, artist: sub, art: s.art || '', genre, songId };
      broadcastNP();
    })
    .catch(() => {});
}

/* Démarre la lecture */
function startAudio() {
  if (!audio) {
    audio = new Audio(STREAM_URL);
    audio.preload = 'auto';
  }
  audio.volume = volume;
  audio.play().then(() => {
    playing = true;
    broadcastState();
    fetchNP();
    clearInterval(npTimer);
    npTimer = setInterval(fetchNP, 2000);
  }).catch(() => {
    /* Le SW ne peut pas lancer audio sans user gesture — on signale */
    broadcast({ type: 'SW_NEED_GESTURE' });
  });
}

function stopAudio() {
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  playing = false;
  clearInterval(npTimer);
  broadcastState();
  broadcast({ type: 'SW_NOWPLAYING', title: 'En pause', artist: '', art: '', genre: '', songId: '' });
}

function setVolume(v) {
  volume = v / 100;
  if (audio) audio.volume = volume;
  broadcastState();
}

/* Reçoit les commandes des pages */
bc.addEventListener('message', e => {
  const d = e.data;
  if (!d?.type) return;

  switch (d.type) {
    case 'PAGE_TOGGLE':
      if (playing) stopAudio(); else startAudio();
      break;
    case 'PAGE_PLAY':
      if (!playing) startAudio();
      break;
    case 'PAGE_STOP':
      if (playing) stopAudio();
      break;
    case 'PAGE_VOLUME':
      setVolume(d.volume);
      break;
    case 'PAGE_GET_STATE':
      /* Une page vient de se charger et demande l'état courant */
      broadcastState();
      if (currentNP.title) broadcastNP();
      break;
  }
});

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
