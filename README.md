# Cyber World – deploy on Render
1. Upload this folder to a GitHub repo (or use "Public Git repo").
2. Render → New → Web Service → connect the repo.
3. Build Command: `npm install`   Start Command: `npm start`
4. Environment → add `JWT_SECRET` = any long random text (render.yaml does this automatically if you use Blueprints).
5. Deploy, then open your https:// URL (camera, mic and GPS need https).

Notes
- Data is saved in data/db.json. On Render's free plan the disk resets on redeploy/restart; add a Render Disk and set DATA_DIR=/var/data to keep data permanently.
- Live/video use WebRTC peer-to-peer (STUN only): great for small groups; add a TURN server for strict networks.
- Orbit tab tracks the ISS live; free internet from a satellite needs real satellite hardware/service.
