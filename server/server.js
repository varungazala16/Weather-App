require('dotenv').config({ override: true });
;

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 5173;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

if (!OPENWEATHER_API_KEY) {
  console.warn('⚠️  Missing OPENWEATHER_API_KEY in .env; /api/weather will fail until you add it.');
}

app.use(cors());               
app.use(express.json());     
const db = new Database('data.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,         -- what user typed
  name TEXT NOT NULL,          -- resolved nice place name
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  start_date TEXT NOT NULL,    -- YYYY-MM-DD
  end_date TEXT NOT NULL,      -- YYYY-MM-DD
  units TEXT NOT NULL,         -- 'metric' or 'imperial'
  temps_json TEXT NOT NULL,    -- JSON [{date,tmin,tmax,tmean}]
  source TEXT NOT NULL,        -- 'open-meteo'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const insertRecord = db.prepare(`
  INSERT INTO records (query, name, lat, lon, start_date, end_date, units, temps_json, source)
  VALUES (@query, @name, @lat, @lon, @start_date, @end_date, @units, @temps_json, 'open-meteo')
`);
const updateRecord = db.prepare(`
  UPDATE records
     SET query=@query, name=@name, lat=@lat, lon=@lon,
         start_date=@start_date, end_date=@end_date,
         units=@units, temps_json=@temps_json,
         updated_at=datetime('now')
   WHERE id=@id
`);
const getAll = db.prepare(`SELECT * FROM records ORDER BY id DESC`);
const getOne = db.prepare(`SELECT * FROM records WHERE id=?`);
const delOne = db.prepare(`DELETE FROM records WHERE id=?`);
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function parseMaybeCoords(q) {
  const m = String(q).trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[3]);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180) return {lat, lon};
  return null;
}
function unitToOpenMeteoTemperature(units) {
  return units === 'imperial' ? 'fahrenheit' : 'celsius';
}

async function geocode(query) {
  const coords = parseMaybeCoords(query);
  if (coords) {
    return { name: `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`, ...coords };
  }
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  if (!data.results || !data.results.length) throw new Error('No matching place found.');
  const r = data.results[0];
  const pretty = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
  return { name: pretty, lat: r.latitude, lon: r.longitude };
}

async function getTempsForRange({ lat, lon, start, end, units='metric' }) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);
  url.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max,temperature_2m_mean');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('temperature_unit', unitToOpenMeteoTemperature(units));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive error (${res.status})`);
  const j = await res.json();
  if (!j.daily || !j.daily.time) throw new Error('No data for that date range.');
  const out = j.daily.time.map((date, i) => ({
    date,
    tmin: j.daily.temperature_2m_min[i],
    tmax: j.daily.temperature_2m_max[i],
    tmean: j.daily.temperature_2m_mean[i],
  }));
  return out;
}
async function getCurrentAndForecast({ lat, lon, units='metric' }) {
  const base = 'https://api.openweathermap.org/data/2.5';
  const u = (path) => `${base}/${path}&units=${units}&appid=${OPENWEATHER_API_KEY}`;

  const [curRes, fRes] = await Promise.all([
    fetch(u(`weather?lat=${lat}&lon=${lon}`)),
    fetch(u(`forecast?lat=${lat}&lon=${lon}`)),
  ]);
  if (!curRes.ok) throw new Error(`OpenWeather current error (${curRes.status})`);
  if (!fRes.ok) throw new Error(`OpenWeather forecast error (${fRes.status})`);
  return { current: await curRes.json(), forecast: await fRes.json() };
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/weather', async (req, res) => {
  try {
    const { query, units='metric' } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing ?query' });
    const place = await geocode(query);
    const data = await getCurrentAndForecast({ lat: place.lat, lon: place.lon, units });
    res.json({ place, ...data });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post('/api/records', async (req, res) => {
  try {
    const { query, startDate, endDate, units='metric' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query is required' });
    if (!isISODate(startDate) || !isISODate(endDate))
      return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });

    const start = new Date(startDate), end = new Date(endDate);
    if (start > end) return res.status(400).json({ error: 'startDate must be before endDate' });

    const msRange = end - start;
    if (msRange / 86400000 > 366) return res.status(400).json({ error: 'Date range too large (max 366 days)' });

    const place = await geocode(query);
    const temps = await getTempsForRange({ lat: place.lat, lon: place.lon, start: startDate, end: endDate, units });

    const info = {
      query,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      start_date: startDate,
      end_date: endDate,
      units,
      temps_json: JSON.stringify(temps),
    };
    const result = insertRecord.run(info);
    const saved = getOne.get(result.lastInsertRowid);
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get('/api/records', (req, res) => { res.json(getAll.all()); });
app.get('/api/records/:id', (req, res) => {
  const row = getOne.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.put('/api/records/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getOne.get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { query = existing.query,
            startDate = existing.start_date,
            endDate = existing.end_date,
            units = existing.units } = req.body || {};

    if (!isISODate(startDate) || !isISODate(endDate))
      return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });

    const start = new Date(startDate), end = new Date(endDate);
    if (start > end) return res.status(400).json({ error: 'startDate must be before endDate' });
    if ((end - start) / 86400000 > 366) return res.status(400).json({ error: 'Date range too large (max 366 days)' });

    const place = await geocode(query);
    const temps = await getTempsForRange({ lat: place.lat, lon: place.lon, start: startDate, end: endDate, units });

    updateRecord.run({
      id,
      query,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      start_date: startDate,
      end_date: endDate,
      units,
      temps_json: JSON.stringify(temps),
    });

    res.json(getOne.get(id));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.delete('/api/records/:id', (req, res) => {
  const info = delOne.run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.get('/api/export.csv', (req, res) => {
  const rows = getAll.all();
  const header = ['id','query','name','lat','lon','start_date','end_date','units','created_at','updated_at'];
  const csv = [
    header.join(','),
    ...rows.map(r => header.map(k => JSON.stringify(r[k] ?? '')).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="records.csv"');
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
