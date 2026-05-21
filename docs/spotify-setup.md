# Spotify integration — setup pentru cont propriu

DevLife are boxa din cameră legată la **Spotify Web Playback SDK** — click pe ea = play/pause
direct pe contul tău Spotify, prin browser. Codul e gata; trebuie doar un Spotify dev app
înregistrat (1x setup, gratuit) și client_id-ul pus în `.env`.

## Cerințe

- Cont **Spotify Premium** (Web Playback SDK nu funcționează cu Free)
- Chrome / Edge / Brave (Safari nu suportă SDK complet)
- Vite dev server pe `http://localhost:5173/` (default), sau orice origin pe care îl rulezi

## Pașii de înregistrare

1. **Mergi la dashboard-ul Spotify Developer**
   https://developer.spotify.com/dashboard → login cu contul tău (cel Premium)

2. **Create app**
   - App name: `DevLife` (sau orice)
   - App description: orice ("Biometric companion for developers")
   - Website: gol (sau https://github.com/your/repo)
   - Redirect URIs — adaugă **fiecare** URI de unde rulezi app-ul (trailing slash obligatoriu):
     - Dev local: `http://localhost:5173/`
     - Dacă Vite ascultă pe alt port, adaugă acel port
     - Prod Railway: `https://devlife-rog-production.up.railway.app/`
   - API used: bifează **Web Playback SDK** și **Web API**
   - Save

3. **Copy Client ID** de pe pagina app-ului

4. **Pune-l în `.env`** (în rădăcina proiectului, lângă `.env.example`)
   ```bash
   cp .env.example .env   # dacă nu există deja
   ```
   Apoi editează `.env` și completează:
   ```
   VITE_SPOTIFY_CLIENT_ID=clientul_tau_id_de_la_spotify
   ```

5. **Restart Vite** — env vars se citesc o singură dată, la pornirea dev server-ului
   ```bash
   cd frontend
   # Ctrl+C dacă rulează
   npm run dev
   ```

## Flow de conectare

- Pornește jocul → meniu principal → **Settings**
- Secțiunea nouă **SPOTIFY** apare doar când `VITE_SPOTIFY_CLIENT_ID` e setat
- Click **Connect Spotify** → redirect către accounts.spotify.com → login + Allow
- Te întoarce automat (URL-ul curat, fără `?code=`); secțiunea acum zice
  `🎵 Connected as <numele tău>` cu buton **Disconnect Spotify**

## Cum cânți efectiv

1. Pe telefon / laptop / desktop, deschide Spotify și **pornește orice melodie**
   (asta e necesar prima dată, ca Spotify să aibă un "playback context" activ pentru contul tău)
2. În joc, intră în cameră și apasă pe **boxa de lângă birou**
3. Toast: `🎵 Spotify playing — <nume>` și redarea continuă pe device-ul numit
   **DevLife — room speaker** (poți schimba și manual din Spotify > Devices)
4. Re-click pe boxă = pauză / play

## Limite & comportament

- **Fără client_id setat**: secțiunea Spotify e ascunsă în Settings, boxa cade pe pad-ul
  procedural Web Audio (acelaşi comportament ca înainte). **Zero regresie**.
- **Cu client_id dar neconectat**: boxa cade tot pe pad-ul procedural. După conectare, ia
  prioritate.
- **Cont non-Premium**: SDK emite `account_error`, toast: "Premium required". Boxa cade pe
  pad procedural până te deconectezi sau upgradezi.
- **Nimic nu cântă deja în Spotify-ul tău**: la prima apăsare pe boxă primești toast
  "No recent playback. Open Spotify on your phone, start any track, then click the speaker
  again." — odată ce ai un context activ, click-urile ulterioare funcționează direct.
- **Token-ul expiră în 1h**: auto-refresh transparent prin refresh_token.
- **Disconnect**: șterge toți token-ii din localStorage + revocă device-ul SDK.

## Securitate

- **PKCE flow** (RFC 7636) — nu există client_secret în frontend; verifier-ul stă în
  localStorage doar 1-2 secunde, între redirect și token exchange.
- **State CSRF protection** — random `state` generat la fiecare auth, verificat pe callback.
- Tokenii sunt în localStorage. Pentru un app educațional, riscul e acceptabil; dacă vrei
  cookies httpOnly, ar trebui un backend OAuth proxy (out-of-scope pentru iterația asta).

## Troubleshooting

| Simptom | Cauză probabilă | Fix |
|---|---|---|
| Secțiunea SPOTIFY nu apare în Settings | `VITE_SPOTIFY_CLIENT_ID` nu e setat sau Vite n-a fost restartat | restart `npm run dev` |
| Spotify zice "INVALID_CLIENT: Invalid redirect URI" | URI-ul curent nu e în lista din dashboard | adaugă `http://localhost:5173/` (cu slash final) |
| Toast "Premium required" la primul click | cont Free | upgrade Premium sau testează cu un cont Premium |
| Toast "No recent playback" la primul click | nu există context activ | pornește o melodie pe alt device Spotify, apoi reapasă boxa |
| Settings arată "Spotify token exchange failed (400)" | client_id greșit sau redirect URI mismatch | re-verifică client_id și redirect URI din dashboard |
| Toast "Spotify device not ready yet" | SDK în curs de inițializare | așteaptă 1-2s, reapasă |

## Fișiere relevante

- `frontend/src/network/Spotify.js` — serviciul singleton (PKCE + SDK + play/pause)
- `frontend/src/menu/SettingsMenu.js` — secțiunea Spotify în Settings
- `frontend/src/main.js` — `completeAuthFromUrl()` pe boot + dispatch boxă
- `.env.example` — `VITE_SPOTIFY_CLIENT_ID=` cu pașii de setup
