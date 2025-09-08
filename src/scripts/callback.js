let album_cover;
let progress;
let duration;
let time_left;
let timestamp;
let last_track_id;
let track_id;

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

const clientId = localStorage.getItem('client_id');
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
    throw err;
  }
};

async function getCurrentPlayer(accessToken) {
  const url = 'https://api.spotify.com/v1/me/player';

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (res.status === 204) {
      return null;
    }
    if (res.status === 401) {
      throw new Error('Unauthorized — access token may have expired. Refresh token required.');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify API error ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching player:', err);
    throw err;
  }
}

if (code) {
  getToken(code)
    .then(tok => console.log('Token exchange successful'))
    .catch(err => console.error('Token exchange failed:', err));
}

//fetch data
let timerID_fetch;
function fetchData(){
    console.log('fetched data')
    const access_token = localStorage.getItem('access_token')
    getCurrentPlayer(access_token)
      .then(player => {
        console.log(player)
        album_cover = player.item.album.images[0].url
        document.getElementById('img').src = album_cover
    
        progress = player.progress_ms
        duration = player.item.duration_ms
        time_left = duration - progress
        clearTimeout(timerID_fetch)
        timerID_fetch = setTimeout(fetchData,time_left+10)

        last_track_id = player.item.id
      })
      .catch(err => console.error(err));
}
fetchData();

async function checkTimestamp() {
    await getCurrentPlayer(localStorage.getItem('access_token')).then(player => {
        track_id = player.item.id
    })
    console.log('checked timestamp')
    if (track_id != last_track_id) {
        fetchData();
    }
    setTimeout(checkTimestamp,3000) //poll every 3s
}
checkTimestamp();

//apply gradient when img loads/changes
document.addEventListener("DOMContentLoaded", () => {
  const img = document.getElementById("img");
  const container = document.getElementById("albumDiv");
  const colorThief = new ColorThief();

  function applyGradient() {
    try {
      const palette = colorThief.getPalette(img, 2);
      const [c1, c2] = palette.map(rgb => `rgb(${rgb.join(",")})`);
      container.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
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


//refresh token (does this work?)
  const getRefreshToken = async () => {

   // refresh token that has been previously stored
   const refreshToken = localStorage.getItem('refresh_token');
   const url = "https://accounts.spotify.com/api/token";

    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
      }),
    }
    const body = await fetch(url, payload);
    const response = await body.json();

    localStorage.setItem('access_token', response.access_token);
    if (response.refresh_token) {
      localStorage.setItem('refresh_token', response.refresh_token);
    }
  }