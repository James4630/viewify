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


const clientId = '2ec4eeb99cc94764b7dd30b898d7e3b1';
const redirectUri = 'http://127.0.0.1:5500/src/index.html';

const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state';
const authUrl = new URL("https://accounts.spotify.com/authorize")

window.localStorage.setItem('code_verifier', codeVerifier);
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
