# Animal Road Safety — Driver Web App

Mobile-friendly browser application for drivers. It uses the existing Animal Road Safety backend API and Socket.IO service; this folder does not contain the backend or firmware.

## Requirements
- Node.js and npm
- Existing Animal Road Safety API running and reachable from the phone/browser
- Phone and computer on the same network for LAN testing

## Setup

In a terminal opened in this `driver-web` folder:

```bash
npm install
```

Create a local environment file by copying `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `VITE_API_URL` to the base URL of the existing backend, including its port. Example only:

```dotenv
VITE_API_URL=http://192.168.1.100:3000
VITE_ALERT_RADIUS_KM=5
VITE_CHECK_INTERVAL_MS=15000
```

Replace the example IP with the actual computer/server IP. Do not use `localhost` in the phone's browser unless the backend is running on the phone itself.

## Run in development

```bash
npm run dev -- --host 0.0.0.0
```

Open the local URL on the computer or the Network URL printed by Vite on the phone.

## GPS and notifications

- Grant location permission when prompted.
- Grant notification permission when prompted.
- Browser geolocation requires a secure context: HTTPS is recommended for phone access. `localhost` is treated as secure on the same device, but an ordinary HTTP LAN IP generally is not.
- Browser notifications and GPS updates may be suspended when the page is backgrounded or closed. Keep the page open while using it; this is not a guaranteed background-monitoring replacement for a native app.
- Test alerts safely before real-world use. Do not interact with the screen while driving.

## Production build

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

The production files are generated in `dist/`. Deploy them over HTTPS. Configure the API URL before building.
