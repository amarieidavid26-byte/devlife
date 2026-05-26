# Spotify integration — setup pentru cont propriu

Boxa din cameră deschide o **interfață Spotify**: un player oficial **embed** (iframe) plus o
**căutare** prin care pui orice melodie. Codul e gata; trebuie doar un Spotify dev app
înregistrat (1x setup, gratuit) și `VITE_SPOTIFY_CLIENT_ID` pus în `.env`.

## Cum funcționează (2 suprafețe Spotify)

1. **Căutarea** folosește Web API cu token-ul tău OAuth (PKCE, fără backend, fără secret).
2. **Redarea** folosește **embed-ul oficial Spotify** (iframe) controlat prin *Embed iFrame API*.
   Embed-ul redă **melodii complete doar dacă ești logat în Spotify (Premium) în același browser**;
   altfel redă preview-uri de 30s. (Asta e independent de token-ul OAuth de căutare.)

## Cerințe

- Cont **Spotify Premium** + **logat în Spotify în browser-ul demo** (pentru melodii complete)
- Chrome / Edge / Brave
- Prezinți jocul pe **`http://127.0.0.1:5173`** (NU `localhost` — vezi mai jos)

## ⚠️ De ce 127.0.0.1 și nu localhost

Dashboard-ul Spotify **respinge** redirect URI-urile `http://localhost:...` ("not secure") și
cere IP-ul loopback explicit `http://127.0.0.1:...`. Pentru ca login-ul (PKCE) să meargă,
redirect-ul derivat (`window.location.origin + '/'`) trebuie să fie exact cel înregistrat — deci
**rulezi tot jocul pe `http://127.0.0.1:5173`**.

Backend-ul acceptă deja această origine: `config.py` `ALLOWED_ORIGINS` include atât
`http://localhost:5173` cât și `http://127.0.0.1:5173`, ca să nu pice WebSocket-ul (biometrice /
ghost / IDE) când prezinți pe 127.0.0.1.

## Pașii de înregistrare

1. https://developer.spotify.com/dashboard → login (cont Premium)
2. **Create app**
   - App name: `DevLife`
   - App description: orice
   - Website: gol
   - **Redirect URIs** (slash final obligatoriu): `http://127.0.0.1:5173/`
     - (opțional, prod) `https://devlife-rog-production.up.railway.app/`
   - API used: bifează **Web API** (Web Playback SDK e opțional — embed-ul nu îl folosește)
   - Save
3. **Copy Client ID** de pe pagina app-ului
4. Pune-l în `.env` (rădăcina proiectului — Vite citește root prin `envDir:'..'`):
   ```
   VITE_SPOTIFY_CLIENT_ID=clientul_tau_id
   ```
5. **Restart Vite** (env vars se citesc la pornire):
   ```bash
   cd frontend && npm run dev
   ```

## Cum cânți efectiv

1. Deschide jocul pe **`http://127.0.0.1:5173`** și asigură-te că ești **logat în Spotify**
   (Premium) în același browser.
2. În cameră, apasă **E** lângă boxă (sau click pe ea) → se deschide interfața Spotify.
3. (O dată) click **Connect Spotify** → login + Allow → te întoarce conectat (căutarea e activă).
4. Scrie în caseta de căutare → apar rezultate → click pe o melodie → se încarcă în embed și pornește.
5. Închizi cu **✕** (sau Escape) → revii în joc.

## Limite & comportament

- **Melodii complete** doar dacă ești logat în Spotify (Premium) în browser; altfel preview 30s.
- **Fără client_id**: căutarea e dezactivată (apare buton Connect); embed-ul tot poate reda
  playlist-ul default.
- Embed-ul e UI oficial Spotify (opac) — îl controlăm doar prin iFrame API (`loadUri`/`play`);
  volumul master din Settings nu îl conduce.
- Token OAuth expiră în 1h → refresh transparent.

## Securitate

- **PKCE** (RFC 7636) — fără client_secret în frontend; `.env` e gitignored.
- **State CSRF** verificat pe callback.
- Tokenii stau în localStorage (acceptabil pentru un app educațional).

## Troubleshooting

| Simptom | Cauză | Fix |
|---|---|---|
| Spotify: "INVALID_CLIENT: Invalid redirect URI" | rulezi pe `localhost` în loc de `127.0.0.1`, sau lipsește slash-ul | deschide pe `http://127.0.0.1:5173`; redirect înregistrat `http://127.0.0.1:5173/` |
| Căutarea nu merge / butonul Connect rămâne | `VITE_SPOTIFY_CLIENT_ID` lipsă sau Vite nerestartat | pune client_id în root `.env`, restart `npm run dev` |
| Melodia pornește dar e doar 30s | nu ești logat în Spotify în browser sau cont Free | loghează-te în Spotify (Premium) în același browser |
| Biometricele/ghost-ul nu apar pe 127.0.0.1 | origine blocată | confirmă `127.0.0.1:5173` în `ALLOWED_ORIGINS` (deja default), restart backend |

## Fișiere relevante

- `frontend/src/network/Spotify.js` — OAuth PKCE + `search()` (Web API)
- `frontend/src/apps/SpotifyApp.js` — overlay-ul boxei: embed iFrame API + căutare
- `frontend/src/main.js` — `apps.speaker` + dispatch boxă → `openApp('speaker')`
- `config.py` — `ALLOWED_ORIGINS` (include 127.0.0.1)
- `.env` — `VITE_SPOTIFY_CLIENT_ID=`
