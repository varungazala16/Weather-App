
const API_BASE = 'http://localhost:5173/api';
console.log('app.js loaded, API_BASE =', API_BASE);

const form = document.getElementById('search-form');
const input = document.getElementById('location-input');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');
const forecastEl = document.getElementById('forecast');
const unitsSelect = document.getElementById('units');
const locBtn = document.getElementById('loc-btn');


const rangeForm = document.getElementById('range-form');
const rangeLocation = document.getElementById('range-location');
const startDate = document.getElementById('start-date');
const endDate = document.getElementById('end-date');
const rangeStatus = document.getElementById('range-status');
const recordsEl = document.getElementById('records');
const exportBtn = document.getElementById('export-btn');

let lastCoords = null;
let lastUnits = unitsSelect.value;

function setStatus(msg = '') { statusEl.textContent = msg; }
function setRangeStatus(msg = '') { rangeStatus.textContent = msg; }
function iconUrl(code) { return `https://openweathermap.org/img/wn/${code}@2x.png`; }
function fmtTemp(t, units) { return `${Math.round(t)}°${units === 'metric' ? 'C' : 'F'}`; }
function fmtSpeed(s, units) { return units === 'metric' ? `${Math.round(s)} m/s` : `${Math.round(s)} mph`; }
function toLocalTimeString(dtSec, tzShiftSec) {
  return new Date((dtSec + tzShiftSec) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function toLocalDateKey(dtSec, tzShiftSec) {
  return new Date((dtSec + tzShiftSec) * 1000).toISOString().slice(0, 10);
}
function toLocalDateLabel(dtSec, tzShiftSec) {
  return new Date((dtSec + tzShiftSec) * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} – ${text || res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}
function parseMaybeCoords(s) {
  const m = s?.trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[3]);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  return null;
}

function renderCurrent(data, units) {
  const { name, sys, weather, main, wind, dt, timezone } = data;
  const w = weather[0];
  const sunrise = toLocalTimeString(sys.sunrise, timezone);
  const sunset = toLocalTimeString(sys.sunset, timezone);
  const timeNow = toLocalTimeString(dt, timezone);

  currentEl.innerHTML = `
    <div class="current-header">
      <img src="${iconUrl(w.icon)}" alt="${w.description}" />
      <div>
        <h2 style="margin:0">${name}, ${sys.country ?? ''}</h2>
        <div>${timeNow} • ${w.description.replace(/\b\w/g, c => c.toUpperCase())}</div>
      </div>
      <div style="margin-left:auto; font-size:32px; font-weight:700;">${fmtTemp(main.temp, units)}</div>
    </div>

    <div class="current-grid">
      <div class="kv"><div class="k">Feels like</div><div class="v">${fmtTemp(main.feels_like, units)}</div></div>
      <div class="kv"><div class="k">Humidity</div><div class="v">${main.humidity}%</div></div>
      <div class="kv"><div class="k">Pressure</div><div class="v">${main.pressure} hPa</div></div>
      <div class="kv"><div class="k">Wind</div><div class="v">${fmtSpeed(wind.speed, units)}</div></div>
      <div class="kv"><div class="k">Sunrise</div><div class="v">${sunrise}</div></div>
      <div class="kv"><div class="k">Sunset</div><div class="v">${sunset}</div></div>
    </div>
  `;
}

function pickDailySummaries(forecast) {
  const tz = forecast.city.timezone || 0;
  const buckets = {};
  for (const item of forecast.list) {
    const key = toLocalDateKey(item.dt, tz);
    (buckets[key] ||= []).push(item);
  }
  const keys = Object.keys(buckets).sort().slice(0, 5);
  return keys.map(key => {
    const items = buckets[key];
    const temps = items.map(x => x.main.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const counter = {};
    let best = items[0].weather[0];
    for (const it of items) {
      const w = it.weather[0];
      counter[w.icon] = (counter[w.icon] || 0) + 1;
      if (counter[w.icon] >= (counter[best.icon] || 0)) best = w;
    }
    const noonish = items.reduce((p, c) =>
      Math.abs(((c.dt + tz) % 86400) - 43200) < Math.abs(((p.dt + tz) % 86400) - 43200) ? c : p
    , items[0]);
    return { dateKey: key, label: toLocalDateLabel(noonish.dt, tz), min, max, icon: best.icon, desc: best.description };
  });
}

function renderForecast(dailies, units) {
  forecastEl.innerHTML = dailies.map(d => `
    <div class="day">
      <h3>${d.label}</h3>
      <img src="${iconUrl(d.icon)}" alt="${d.desc}" />
      <div class="temps">${fmtTemp(d.max, units)} / ${fmtTemp(d.min, units)}</div>
      <div style="color:#9ca3af">${d.desc.replace(/\b\w/g, c => c.toUpperCase())}</div>
    </div>
  `).join('');
}

async function searchByQuery(query) {
  try {
    setStatus('Looking up location & weather…');
    const units = unitsSelect.value;
    const url = `${API_BASE}/weather?query=${encodeURIComponent(query)}&units=${units}`;
    const { place, current, forecast } = await fetchJson(url);
    lastCoords = { lat: place.lat, lon: place.lon }; lastUnits = units;

    renderCurrent(current, units);
    renderForecast(pickDailySummaries(forecast), units);
    setStatus('');
    localStorage.setItem('lastLocation', query);
    localStorage.setItem('lastUnits', units);

    if (!rangeLocation.value) rangeLocation.value = query;
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong.');
    currentEl.innerHTML = '';
    forecastEl.innerHTML = '';
  }
}

async function searchByCoords(lat, lon) {
  return searchByQuery(`${lat},${lon}`);
}

function recordRowHtml(r) {
  const temps = JSON.parse(r.temps_json);
  const first = temps[0], last = temps[temps.length - 1];
  const summary = `${temps.length} day(s): ${first.date} → ${last.date}`;
  return `
    <tr data-id="${r.id}">
      <td class="mono">${r.id}</td>
      <td>${r.name}<div class="mono" style="color:#9ca3af">${r.query}</div></td>
      <td>${r.start_date} → ${r.end_date}</td>
      <td>${r.units}</td>
      <td>${summary}</td>
      <td>
        <button class="btn" data-action="view">View</button>
        <button class="btn" data-action="edit">Edit</button>
        <button class="btn" data-action="delete">Delete</button>
      </td>
    </tr>
    <tr class="details" id="details-${r.id}" style="display:none">
      <td colspan="6">
        <div class="mono" style="overflow:auto; max-height:220px">${renderTempsTable(temps)}</div>
      </td>
    </tr>
  `;
}

function renderTempsTable(temps) {
  const header = `<table class="records-table"><thead><tr><th>Date</th><th>Min</th><th>Max</th><th>Mean</th></tr></thead><tbody>`;
  const rows = temps.map(t => `<tr><td>${t.date}</td><td>${t.tmin}</td><td>${t.tmax}</td><td>${t.tmean}</td></tr>`).join('');
  return header + rows + '</tbody></table>';
}

async function loadRecords() {
  const data = await fetchJson(`${API_BASE}/records`);
  if (!data.length) { recordsEl.innerHTML = `<p style="color:#94a3b8">No saved records yet.</p>`; return; }
  recordsEl.innerHTML = `
    <table class="records-table">
      <thead><tr><th>ID</th><th>Location</th><th>Range</th><th>Units</th><th>Summary</th><th>Actions</th></tr></thead>
      <tbody>${data.map(recordRowHtml).join('')}</tbody>
    </table>
  `;
  recordsEl.querySelector('tbody').addEventListener('click', onRecordAction);
}

function onRecordAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const tr = btn.closest('tr[data-id]');
  const id = tr?.dataset.id;
  if (!id) return;
  const action = btn.dataset.action;
  if (action === 'view') {
    const row = document.getElementById(`details-${id}`);
    row.style.display = row.style.display === 'none' ? '' : 'none';
  } else if (action === 'delete') {
    if (confirm(`Delete record #${id}?`)) {
      fetchJson(`${API_BASE}/records/${id}`, { method: 'DELETE' })
        .then(loadRecords).catch(err => alert(err.message));
    }
  } else if (action === 'edit') {
    editRecord(id);
  }
}

async function editRecord(id) {
  const r = await fetchJson(`${API_BASE}/records/${id}`);
  const q = prompt('Location (text or "lat,lon"):', r.query);
  if (q == null) return;
  const s = prompt('Start date (YYYY-MM-DD):', r.start_date);
  if (s == null) return;
  const e = prompt('End date (YYYY-MM-DD):', r.end_date);
  if (e == null) return;
  const u = prompt('Units ("metric" or "imperial"):', r.units);
  if (u == null) return;
  try {
    await fetchJson(`${API_BASE}/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, startDate: s, endDate: e, units: u })
    });
    await loadRecords();
    setRangeStatus('Updated ✓');
  } catch (err) {
    alert(err.message);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) { setStatus('Type a place (e.g., "Paris, FR" or "10001, US")'); return; }
  searchByQuery(q);
});

locBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('Geolocation is not supported.'); return; }
  setStatus('Asking for your location…');
  navigator.geolocation.getCurrentPosition(
    pos => searchByCoords(pos.coords.latitude, pos.coords.longitude),
    err => setStatus('Location permission denied or unavailable.')
  );
});

unitsSelect.addEventListener('change', () => {
  const newUnits = unitsSelect.value;
  if (!lastCoords) return;
  if (newUnits === lastUnits) return;
  searchByCoords(lastCoords.lat, lastCoords.lon);
});

rangeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = (rangeLocation.value || input.value).trim();
  const s = startDate.value;
  const ed = endDate.value;
  const u = unitsSelect.value;

  if (!q) return setRangeStatus('Please enter a location.');
  if (!s || !ed) return setRangeStatus('Pick start and end dates.');

  setRangeStatus('Saving…');
  try {
    await fetchJson(`${API_BASE}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, startDate: s, endDate: ed, units: u })
    });
    setRangeStatus('Saved ✓');
    await loadRecords();
  } catch (err) {
    setRangeStatus(err.message);
  }
});

exportBtn.addEventListener('click', () => {
  window.location.href = `${API_BASE}/export.csv`;
});

window.addEventListener('DOMContentLoaded', async () => {
  const q = localStorage.getItem('lastLocation');
  const u = localStorage.getItem('lastUnits');
  if (u) unitsSelect.value = u;
  if (q) {
    input.value = q;
    setTimeout(() => searchByQuery(q), 50);
  }
  loadRecords();
});
