let album_cover;
let progress;
let duration;
let time_left;
let last_track_id;
let track_id;
let track_name;
let lyrics;
let last_fetched_time;
let paused = true;
let currently_paused;

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

const clientId = '2ec4eeb99cc94764b7dd30b898d7e3b1';
const redirectUri = 'http://127.0.0.1:5500/src/index.html';

if (!clientId) {
  console.warn('clientId not found in localStorage. Make sure auth.js set it before redirect.');
}

const getToken = async (code) => {
  try {
    const codeVerifier = localStorage.getItem('code_verifier');
    if (!codeVerifier) throw new Error('code_verifier missing from localStorage');

    const url = "https://accounts.spotify.com/api/token";
    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    };

    const res = await fetch(url, payload);
    const response = await res.json();
    console.log('token endpoint response:', response);

    if (!res.ok) {
      throw new Error(`Token endpoint returned ${res.status}: ${JSON.stringify(response)}`);
    }

    if (!response.access_token) {
      throw new Error(`No access_token in token response: ${JSON.stringify(response)}`);
    }

    localStorage.setItem('access_token', response.access_token);
    if (response.refresh_token) localStorage.setItem('refresh_token', response.refresh_token);

    window.history.replaceState({}, document.title, window.location.pathname);

    console.log('Access token saved to localStorage.');
    return response.access_token;
  } catch (err) {
    console.error('getToken error:', err);

    // Remove the code from the URL so the page doesn't stay stuck with ?code=...
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
      console.warn('Could not clean URL:', e);
    }

    // If the error is due to a missing code_verifier, restart auth in the same tab
    // so a fresh PKCE flow is created. This avoids the user being stuck with an unusable code.
    if (err && err.message && err.message.includes('code_verifier')) {
      console.warn('code_verifier missing — restarting auth flow in this tab.');
      try { auth(); } catch (e) { console.error('Failed to restart auth:', e); }
      return; // return early — auth() will redirect the user
    }

    // for other errors, rethrow so upstream can decide
    throw err;
  }
};

async function getCurrentPlayer() {
  return fetchWrapper('https://api.spotify.com/v1/me/player');
}


//fetch data
let timerID_fetch;
function fetchData(){
    console.log('fetched data')
    getCurrentPlayer()
      .then(player => {
        console.log(player)
        if (player.item) {

        album_cover = player.item.album.images[0].url
        document.getElementById('img').src = album_cover
    
        progress = player.progress_ms
        last_fetched_time = Date.now();
        duration = player.item.duration_ms
        time_left = duration - progress
        clearTimeout(timerID_fetch)
        timerID_fetch = setTimeout(fetchData,time_left+5) //when not reliable: instead of fetching once, fetch every few ms for a second

        last_track_id = player.item.id

        track_name = player.item.name
        document.getElementById('trackName').innerText = track_name

        if (player.actions.disallows.pausing && !paused) {
          document.getElementById('play').innerHTML = '<span class="material-symbols-outlined">play_arrow</span>'
          document.getElementById('play').onclick = resume;
          paused = true
        }
        if (player.actions.disallows.resuming && paused) {
          document.getElementById('play').innerHTML = '<span class="material-symbols-outlined">pause</span>'
          document.getElementById('play').onclick = pause;
          paused = false
        }

        getLyrics(player.item.artists[0].name, track_name, player.item.album.name, Math.floor(duration/1000))
          .then (syncedLyrics => {

            if (!syncedLyrics || syncedLyrics.length === 0) {
              document.getElementById('lyricsDiv').innerHTML = "<p>No lyrics available</p>";
              lyrics = [];
              return;
            }

            //split lyrics into array {time, text}
            lyrics = syncedLyrics.split("\n").map(line => {
              const match = line.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
              if (!match) return null;
              const minutes = parseInt(match[1], 10)
              const seconds = parseFloat(match[2])
              const time = minutes * 60 + seconds
              return { time, text: match[3] };
            }).filter(Boolean);

            //render lyrics
            const lyricContainer = document.getElementById('lyricsDiv');
            lyricContainer.innerHTML = ''
            lyrics.forEach((lyric, i) => {
              const p = document.createElement('p')
              p.classList.add("line")
              p.textContent = lyric.text || "";
              lyricContainer.appendChild(p)
              lyric.el = p;
            })
            lyricContainer.scrollTop = 0
            startLyricSync();

          })
        } else {
          document.getElementById('img').src = "./media/no_track.png"
          document.getElementById('trackName').innerText = "Nothing Playing"
        }
      })
      .catch(err => console.error(err));
}


function startLyricSync() {
  setInterval(() => {
    if (!lyrics || lyrics.length === 0 || paused) return;

    const timestamp_s = Math.floor((progress + (Date.now() - last_fetched_time))/1000)

    // Find current lyric index
    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (timestamp_s >= lyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    // Update classes
lyrics.forEach((lyric, i) => {
  lyric.el.classList.remove("active", "faded");

  if (i === activeIndex) {
    lyric.el.classList.add("active");
  } else if (i === activeIndex - 1 || i === activeIndex + 1) {
    lyric.el.classList.add("faded");
  }
});

    // Scroll active line into view
    if (activeIndex !== -1) {
      const activeEl = lyrics[activeIndex].el;
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, 50);
}


async function checkTimestamp() {
    await getCurrentPlayer().then(player => {
        track_id = player.item.id
        currently_paused = player.actions.disallows.pausing ?? false
    })
    console.log('checked timestamp')
    if (track_id != last_track_id || paused != currently_paused) {
        fetchData();
    }
    setTimeout(checkTimestamp,3000)
}

async function getLyrics(artist, name, album, duration) {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(name)}&album_name=${encodeURIComponent(album)}&duration=${duration}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Lyrics API error ${res.status}: ${text}`)
    }
    const data = await res.json();
    if (!data.syncedLyrics || data.syncedLyrics.trim() === "") {
      console.warn(`No lyrics found for ${artist} - ${name}`);
      return [];
    }
    return data.syncedLyrics;

  } catch (error) {
    console.error('Error fetching lyrics:', error);
    return [];
  }
}


//apply gradient when img loads/changes
document.addEventListener("DOMContentLoaded", () => {
  const img = document.getElementById("img");
  const container = document.getElementById("albumDiv");
  const container2 = document.getElementById("detailsDiv");
  const colorThief = new ColorThief();

  function applyGradient() {
    try {
      const palette = colorThief.getPalette(img, 2);
      const [c1, c2] = palette.map(rgb => `rgb(${rgb.join(",")})`);
      container.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      container2.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    } catch (err) {
      console.warn("Could not extract colors:", err);
    }
  }

  // update whenever the image finishes loading
  img.addEventListener("load", applyGradient);

  if (img.complete) {
    applyGradient();
  }
});

//change view
function showLyrics() {
  document.getElementById('albumDiv').style.display = 'none'
  document.getElementById('detailsDiv').style.display = 'flex'
}

function showCover() {
  document.getElementById('albumDiv').style.display = 'flex'
  document.getElementById('detailsDiv').style.display = 'none'
}


//buttons
async function pause() {
  await fetchWrapper('https://api.spotify.com/v1/me/player/pause', { method: 'PUT' })
  fetchData();
}

function resume() {
  console.log('tried to resume')
}

async function next() {
  await fetchWrapper('https://api.spotify.com/v1/me/player/next', { method: 'POST' });
  fetchData();
}

async function previous() {
  await fetchWrapper('https://api.spotify.com/v1/me/player/previous', { method: 'POST' });
  fetchData();
}


//refresh token
const refreshToken = async () => {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) throw new Error('No refresh token available');

  const clientId = localStorage.getItem('client_id');
  const url = 'https://accounts.spotify.com/api/token';

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: clientId,
    }),
  };

  const res = await fetch(url, payload);
  const data = await res.json();

  if (!res.ok) throw new Error(`Refresh token failed: ${JSON.stringify(data)}`);

  localStorage.setItem('access_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);

  console.log('Access token refreshed');
  return data.access_token;
};


//fetch wrapper for refresh tolken handling
async function fetchWrapper(url, options = {}, retry = true) {
  const accessToken = localStorage.getItem('access_token');

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      ...(options.headers || {}),
    }
  });

  if (res.status === 401 && retry) {
    // Token expired, refresh and retry once
    console.log('Access token expired, refreshing...');
    const newToken = await refreshToken();
    return fetchWrapper(url, options, false); // retry only once
  }

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;

  return await res.json();
}


//init
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const token = localStorage.getItem('access_token');

  if (code) {
    try {
      await getToken(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Token exchange failed:', err);
      return;
    }
  }

  if (!localStorage.getItem('access_token')) {
    console.log("No token found, starting auth flow…");
    auth();
    return;
  }

  fetchData();
  checkTimestamp();
}
init();


//first auth
async function auth() {
  const generateRandomString = (length) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

const sha256 = async (plain) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return window.crypto.subtle.digest('SHA-256', data)
}

const base64encode = (input) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const codeVerifier  = generateRandomString(64);

const hashed = await sha256(codeVerifier)
const codeChallenge = base64encode(hashed);


const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state';
const authUrl = new URL("https://accounts.spotify.com/authorize")

window.localStorage.setItem('code_verifier', codeVerifier);
window.localStorage.setItem('client_id', clientId);


const params =  {
  response_type: 'code',
  client_id: clientId,
  scope,
  code_challenge_method: 'S256',
  code_challenge: codeChallenge,
  redirect_uri: redirectUri,
}

authUrl.search = new URLSearchParams(params).toString();
window.location.href = authUrl.toString();

}

//debug
window.runAuth = auth;