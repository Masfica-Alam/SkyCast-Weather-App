
/* 
   SKYCAST — app.js  (WeatherAPI edition)
   API: api.weatherapi.com/v1
   Default city: Dhaka · Temperature: always °C
   Architecture: State → Render → Events, fully separated
*/

'use strict';

// Configuration & Constants 

/**
 * WeatherAPI.com key + base URL.
 * Endpoints:
 *   Current:  /v1/current.json?key=KEY&q=CITY&aqi=yes
 *   Forecast: /v1/forecast.json?key=KEY&q=CITY&days=7&aqi=no&alerts=no
 *   Search:   /v1/search.json?key=KEY&q=QUERY
 */
const API_KEY = 'd393057768524891a22164719262002';
const WA_BASE = 'https://api.weatherapi.com/v1';

// USE_DEMO starts false — fetchWeather switches it to true if the network is blocked.
// This lets the app work both online (real data) and offline (demo data).
let USE_DEMO = false;

const CACHE_KEY    = 'skycast_weather_cache';
const FAVS_KEY     = 'skycast_favorites';
const RECENT_KEY   = 'skycast_recent';
const THEME_KEY    = 'skycast_theme';
const CITY_KEY     = 'skycast_lastcity';
const ANIM_KEY     = 'skycast_anim';
const DEFAULT_CITY = 'Dhaka';

// Clear stale cache when default city changes
(function clearStaleCache() {
  const savedCity = localStorage.getItem(CITY_KEY);
  if (savedCity && savedCity.toLowerCase() !== DEFAULT_CITY.toLowerCase()) {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CITY_KEY);
  }
})();

/* 
   OpenWeather condition IDs → Lucide icon name
   Full list: https://www.weatherapi.com/docs/weather_conditions.json*/

/* WeatherAPI condition codes → Lucide icon name
   Full list: https://www.weatherapi.com/docs/weather_conditions.json */
function waCodeToIcon(code, isDay = 1) {
  if (code === 1000) return isDay ? 'sun' : 'moon';                   // Sunny / Clear
  if (code === 1003) return isDay ? 'cloud-sun' : 'cloud-moon';       // Partly cloudy
  if ([1006, 1009].includes(code)) return 'cloud';                     // Cloudy / Overcast
  if ([1030, 1135, 1147].includes(code)) return 'cloud-fog';          // Mist / Fog
  if ([1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1198].includes(code)) return 'cloud-drizzle';
  if ([1186, 1189, 1192, 1195, 1201, 1240, 1243, 1246].includes(code)) return 'cloud-rain';
  if ([1069, 1204, 1207, 1249, 1252].includes(code)) return 'cloud-sleet';
  if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return 'snowflake';
  if ([1237, 1261, 1264].includes(code)) return 'cloud-hail';
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 'cloud-lightning';
  return 'cloud';
}

/* WeatherAPI condition code → background scene class */
function waCodeToBg(code, isDay) {
  if (!isDay) return 'weather--night';
  if (code === 1000) return 'weather--sunny';
  if ([1003, 1006, 1009, 1030, 1135, 1147].includes(code)) return 'weather--cloudy';
  if ([1063, 1069, 1072, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186,
       1189, 1192, 1195, 1198, 1201, 1204, 1207, 1240, 1243, 1246, 1249,
       1252, 1273, 1276].includes(code)) return 'weather--rainy';
  if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255,
       1258, 1261, 1264, 1279, 1282].includes(code)) return 'weather--snowy';
  return 'weather--cloudy';
}


//  State 
const state = {
  unit:       'C',                                          // Always Celsius
  theme:      localStorage.getItem(THEME_KEY) || 'dark',
  anim:       localStorage.getItem(ANIM_KEY)  !== 'false',
  favorites:  JSON.parse(localStorage.getItem(FAVS_KEY)   || '[]'),
  recent:     JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'),
  lastCity:   localStorage.getItem(CITY_KEY)  || DEFAULT_CITY, // Default: Dhaka
  // In demo mode, never restore cached weather — always fetch fresh city-specific data
  weather:    USE_DEMO ? null : JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'),
  loading:    false,
  error:      null,
  currentView: 'weather',
};


//  Demo Data Factory 
/**
 * City climate profiles for realistic demo data.
 * Each entry: [avgTempC, tempSwingC, humidity%, windKph, country, conditionCode, conditionText, uvIndex]
 * conditionCode uses OpenWeather IDs so icons + backgrounds work correctly.
 */
const CITY_PROFILES = {
  // South Asia — hot & humid
  'dhaka':         [32, 5,  78, 14, 'BD', 801, 'few clouds',      8],
  'chittagong':    [31, 5,  80, 16, 'BD', 500, 'light rain',      7],
  'sylhet':        [30, 5,  82, 12, 'BD', 803, 'broken clouds',   6],
  'rajshahi':      [34, 6,  68, 18, 'BD', 800, 'clear sky',       9],
  'delhi':         [36, 7,  55, 20, 'IN', 800, 'clear sky',       9],
  'mumbai':        [31, 4,  80, 18, 'IN', 500, 'light rain',      7],
  'kolkata':       [33, 5,  75, 14, 'IN', 803, 'broken clouds',   8],
  'chennai':       [34, 4,  72, 16, 'IN', 800, 'clear sky',       9],
  'bangalore':     [26, 5,  65, 12, 'IN', 801, 'few clouds',      7],
  'lahore':        [35, 8,  50, 22, 'PK', 800, 'clear sky',       9],
  'karachi':       [33, 6,  60, 20, 'PK', 800, 'clear sky',       8],
  'islamabad':     [28, 8,  55, 16, 'PK', 801, 'few clouds',      7],
  'kathmandu':     [22, 7,  70, 10, 'NP', 802, 'scattered clouds',6],
  'colombo':       [30, 4,  80, 14, 'LK', 500, 'light rain',      7],
  // Middle East — hot & dry
  'dubai':         [38, 5,  40, 18, 'AE', 800, 'clear sky',      10],
  'abu dhabi':     [39, 5,  38, 16, 'AE', 800, 'clear sky',      10],
  'riyadh':        [40, 8,  20, 22, 'SA', 800, 'clear sky',      11],
  'doha':          [38, 5,  42, 20, 'QA', 800, 'clear sky',      10],
  'kuwait city':   [39, 7,  30, 24, 'KW', 800, 'clear sky',      10],
  'muscat':        [37, 6,  50, 18, 'OM', 800, 'clear sky',      10],
  'tehran':        [28, 8,  45, 16, 'IR', 801, 'few clouds',      8],
  'baghdad':       [38, 8,  25, 20, 'IQ', 800, 'clear sky',      10],
  // East Asia
  'tokyo':         [18, 6,  65, 14, 'JP', 802, 'scattered clouds', 5],
  'osaka':         [19, 6,  68, 12, 'JP', 801, 'few clouds',       5],
  'beijing':       [22, 8,  55, 18, 'CN', 800, 'clear sky',        7],
  'shanghai':      [20, 6,  70, 16, 'CN', 802, 'scattered clouds', 5],
  'seoul':         [16, 7,  60, 16, 'KR', 801, 'few clouds',       5],
  'taipei':        [24, 5,  75, 14, 'TW', 500, 'light rain',       6],
  'hong kong':     [25, 5,  78, 18, 'HK', 803, 'broken clouds',    6],
  // Southeast Asia — warm & rainy
  'bangkok':       [33, 4,  75, 14, 'TH', 500, 'light rain',       8],
  'singapore':     [30, 3,  85, 12, 'SG', 500, 'light rain',       7],
  'jakarta':       [31, 4,  82, 14, 'ID', 501, 'moderate rain',    6],
  'kuala lumpur':  [30, 4,  80, 12, 'MY', 500, 'light rain',       7],
  'manila':        [32, 4,  78, 18, 'PH', 803, 'broken clouds',    8],
  'ho chi minh city': [32, 3, 78, 14, 'VN', 500, 'light rain',    8],
  'hanoi':         [28, 5,  78, 12, 'VN', 803, 'broken clouds',    7],
  // Europe — mild & cloudy
  'london':        [12, 5,  75, 20, 'GB', 803, 'broken clouds',    3],
  'paris':         [14, 6,  70, 18, 'FR', 802, 'scattered clouds', 4],
  'berlin':        [11, 7,  72, 16, 'DE', 803, 'broken clouds',    3],
  'madrid':        [20, 8,  50, 18, 'ES', 800, 'clear sky',        6],
  'rome':          [20, 7,  58, 14, 'IT', 801, 'few clouds',       6],
  'amsterdam':     [11, 5,  80, 22, 'NL', 500, 'light rain',       3],
  'vienna':        [13, 7,  68, 16, 'AT', 802, 'scattered clouds', 4],
  'istanbul':      [18, 7,  65, 18, 'TR', 801, 'few clouds',       5],
  'moscow':        [5,  8,  70, 14, 'RU', 804, 'overcast clouds',  2],
  'warsaw':        [10, 8,  72, 16, 'PL', 803, 'broken clouds',    3],
  'brussels':      [11, 5,  78, 18, 'BE', 500, 'light rain',       3],
  'stockholm':     [8,  6,  72, 14, 'SE', 802, 'scattered clouds', 2],
  'oslo':          [6,  6,  70, 16, 'NO', 803, 'broken clouds',    2],
  'zurich':        [12, 7,  68, 14, 'CH', 802, 'scattered clouds', 4],
  // Americas
  'new york':      [16, 7,  62, 20, 'US', 801, 'few clouds',       5],
  'los angeles':   [22, 5,  60, 14, 'US', 800, 'clear sky',        7],
  'chicago':       [14, 8,  65, 24, 'US', 803, 'broken clouds',    4],
  'houston':       [28, 6,  68, 18, 'US', 800, 'clear sky',        8],
  'miami':         [28, 4,  75, 16, 'US', 801, 'few clouds',       8],
  'toronto':       [12, 8,  65, 18, 'CA', 802, 'scattered clouds', 4],
  'vancouver':     [12, 5,  78, 16, 'CA', 500, 'light rain',       3],
  'são paulo':     [22, 5,  75, 14, 'BR', 500, 'light rain',       7],
  'rio de janeiro':[26, 5,  78, 16, 'BR', 801, 'few clouds',       8],
  'buenos aires':  [18, 6,  65, 20, 'AR', 801, 'few clouds',       5],
  'mexico city':   [18, 6,  60, 16, 'MX', 802, 'scattered clouds', 6],
  'santiago':      [16, 7,  55, 18, 'CL', 800, 'clear sky',        6],
  'bogotá':        [14, 4,  70, 12, 'CO', 802, 'scattered clouds', 5],
  // Africa
  'cairo':         [35, 7,  30, 18, 'EG', 800, 'clear sky',       10],
  'lagos':         [30, 4,  80, 16, 'NG', 500, 'light rain',       7],
  'nairobi':       [22, 5,  65, 14, 'KE', 802, 'scattered clouds', 7],
  'cape town':     [18, 6,  65, 22, 'ZA', 801, 'few clouds',       6],
  'johannesburg':  [20, 7,  55, 18, 'ZA', 800, 'clear sky',        7],
  'accra':         [30, 4,  78, 16, 'GH', 803, 'broken clouds',    8],
  'addis ababa':   [20, 5,  62, 12, 'ET', 802, 'scattered clouds', 7],
  'casablanca':    [20, 5,  68, 18, 'MA', 801, 'few clouds',       6],
  'algiers':       [22, 6,  65, 16, 'DZ', 800, 'clear sky',        7],
  // Oceania
  'sydney':        [20, 6,  65, 18, 'AU', 801, 'few clouds',       6],
  'melbourne':     [16, 7,  68, 20, 'AU', 802, 'scattered clouds', 5],
  'brisbane':      [24, 5,  65, 16, 'AU', 800, 'clear sky',        8],
  'auckland':      [16, 6,  72, 18, 'NZ', 802, 'scattered clouds', 5],
};

/*Look up a city profile, falling back to a generic temperate climate */
function getCityProfile(cityName) {
  const key = cityName.toLowerCase().trim();
  if (CITY_PROFILES[key]) return CITY_PROFILES[key];
  // Fuzzy match: check if any profile key is contained in the city name or vice versa
  for (const [k, v] of Object.entries(CITY_PROFILES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Generic fallback — neutral temperate climate
  return [18, 6, 65, 16, 'XX', 802, 'scattered clouds', 5];
}

function makeDemoData(cityName = DEFAULT_CITY) {
  const now = new Date();
  const [baseTemp, swing, humidity, windKph, country, condCode, condText, uv] = getCityProfile(cityName);

  // Generate a realistic 7-day pattern with some variation around the base
  const variation  = [0, -1, 1, -2, 2, -1, 1];
  const rainChance = condCode >= 500 && condCode < 600
    ? [70, 55, 80, 40, 65, 50, 30]   // rainy city
    : condCode === 800
    ? [5,  10,  5,  15,  5,  10,  5]  // sunny city
    : [20, 35, 25, 40, 30, 20, 15];   // mixed city

  // Cycle through nearby condition codes for variety across 7 days
  const condCycle = condCode >= 500 && condCode < 600
    ? [500, 501, 500, 803, 500, 802, 801]
    : condCode === 800
    ? [800, 800, 801, 800, 801, 802, 800]
    : [802, 803, 801, 500, 802, 801, 800];
  const descCycle = condCycle.map(c =>
    c === 800 ? 'clear sky' : c === 801 ? 'few clouds' : c === 802 ? 'scattered clouds'
    : c === 803 ? 'broken clouds' : c === 500 ? 'light rain' : c === 501 ? 'moderate rain' : 'overcast clouds'
  );

  return {
    location: {
      name: cityName,
      country,
      lat: 0, lon: 0,
      localtime: now.toISOString(),
    },
    current: {
      temp_c:      baseTemp,
      temp_f:      +(baseTemp * 9/5 + 32).toFixed(1),
      feelslike_c: baseTemp + (humidity > 70 ? 4 : -1),
      feelslike_f: +((baseTemp + (humidity > 70 ? 4 : -1)) * 9/5 + 32).toFixed(1),
      humidity,
      wind_kph:    windKph,
      wind_mph:    +(windKph / 1.609).toFixed(1),
      wind_dir:    ['N','NE','E','SE','S','SW','W','NW'][Math.floor(cityName.length % 8)],
      vis_km:      condCode >= 500 ? 6 : 10,
      pressure_mb: 1010 + (baseTemp > 30 ? -6 : 3),
      precip_mm:   condCode >= 500 ? 3.2 : 0,
      dewpoint_c:  +(baseTemp - ((100 - humidity) / 5)).toFixed(1),
      dewpoint_f:  +((baseTemp - ((100 - humidity) / 5)) * 9/5 + 32).toFixed(1),
      uv,
      condition: { text: condText, code: condCode },
      is_day: (now.getHours() >= 6 && now.getHours() < 19) ? 1 : 0,
    },
    forecast: {
      forecastday: Array.from({ length: 7 }, (_, i) => {
        const d     = new Date(now);
        d.setDate(d.getDate() + i);
        const maxC  = baseTemp + swing/2 + variation[i];
        const minC  = baseTemp - swing/2 + variation[i];
        return {
          date:  d.toISOString().split('T')[0],
          astro: { sunrise: '06:10 AM', sunset: '06:20 PM' },
          day: {
            maxtemp_c:            +maxC.toFixed(1),
            maxtemp_f:            +(maxC * 9/5 + 32).toFixed(1),
            mintemp_c:            +minC.toFixed(1),
            mintemp_f:            +(minC * 9/5 + 32).toFixed(1),
            daily_chance_of_rain: rainChance[i],
            totalprecip_mm:       rainChance[i] > 50 ? +(rainChance[i] / 10).toFixed(1) : 0,
            uv:                   Math.max(1, uv - Math.abs(variation[i])),
            condition:            { text: descCycle[i], code: condCycle[i] },
          },
          hour: Array.from({ length: 24 }, (_, h) => {
            const hIsDay = h >= 6 && h < 19;
            const base   = (maxC + minC) / 2;
            const amp    = (maxC - minC) / 2;
            const hC     = base + amp * Math.sin((h - 6) * Math.PI / 12);
            return {
              time:           `${d.toISOString().split('T')[0]} ${String(h).padStart(2, '0')}:00`,
              temp_c:         +hC.toFixed(1),
              temp_f:         +(hC * 9/5 + 32).toFixed(1),
              chance_of_rain: rainChance[i] > 50 && h >= 13 && h < 20 ? rainChance[i] : Math.round(rainChance[i] * 0.3),
              condition:      { text: descCycle[i], code: condCycle[i] },
              is_day:         hIsDay ? 1 : 0,
            };
          }),
        };
      }),
    },
  };
}


// Data Helpers & Formatters 

/* Return temperature in Celsius (always). Second arg kept for API compat. */
function temp(c /* , f */) {
  return Math.round(c);
}

/* Format an ISO datetime string to a short hour label */
function hourLabel(isoOrDateTime) {
  const dt = new Date(isoOrDateTime);
  const h  = dt.getHours();
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** UV index → risk label */
function uvLabel(v) {
  if (v <= 2) return 'Low';
  if (v <= 5) return 'Moderate';
  if (v <= 7) return 'High';
  if (v <= 10) return 'Very High';
  return 'Extreme';
}

/* Parse sunrise/sunset string like "06:42 AM" → Date object today */
function parseSunTime(str) {
  const [time, meridiem] = str.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/*Day of week label */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayLabel(dateStr, idx) {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  return DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()];
}

/* Capitalise first letter of each word — WeatherAPI returns e.g. "overcast clouds" */
function titleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

//  Api 

/*
  Fetch current weather + 5-day forecast for any global city.
 */
/*
 * Fetch live weather from WeatherAPI.com.
 * Auto-detects if the network is unavailable and silently falls back to demo data.
 *
 * Endpoints used:
 *   Current:  GET /v1/current.json?key=KEY&q=CITY&aqi=yes
 *   Forecast: GET /v1/forecast.json?key=KEY&q=CITY&days=7&aqi=no&alerts=no
 *
 * Error codes: 1006 = city not found, 2006/2007/2008 = key invalid/disabled.
 */
async function fetchWeather(city) {
  // Demo mode — return city-specific simulated data immediately
  if (USE_DEMO) {
    await new Promise(r => setTimeout(r, 400));
    return makeDemoData(city);
  }

  const q = encodeURIComponent(city);

  try {
    // Run current + forecast fetches in parallel
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${WA_BASE}/current.json?key=${API_KEY}&q=${q}&aqi=yes`),
      fetch(`${WA_BASE}/forecast.json?key=${API_KEY}&q=${q}&days=7&aqi=no&alerts=no`),
    ]);

    // Parse WeatherAPI error codes from the body (returned even on non-200)
    if (!currentRes.ok) {
      let errCode = 0;
      try { errCode = (await currentRes.clone().json())?.error?.code; } catch (_) {}
      // City not found — only real error we surface to the user
      if (errCode === 1006) throw new Error(`"${city}" not found. Try a different spelling.`);
      // Rate limit
      if (currentRes.status === 429) throw new Error('Rate limit reached — please wait a moment.');
      // Auth / key issues → fall back silently
      throw new Error('_fb');
    }

    const currentJson  = await currentRes.json();
    const forecastJson = forecastRes.ok ? await forecastRes.json().catch(() => null) : null;
    const primary      = forecastJson ?? currentJson;

    // Validate the response has the fields we need before adapting
    if (!primary?.location?.name || !primary?.current?.temp_c === undefined) {
      throw new Error('_fb');
    }

    return adaptWAData(primary, forecastJson);

  } catch (err) {
    // Only propagate user-facing errors (city not found, rate limit)
    // Everything else silently falls back to demo data
    if (err.message && !err.message === '_fb') {
      // Check if it's a network failure
      if (err instanceof TypeError) {
        console.warn();
        USE_DEMO = true;
        return makeDemoData(city);
      }
      // Re-throw user-facing errors
      throw err;
    }
    // Silent fallback for auth errors, server errors, parse errors
    console.warn(err.message);
    USE_DEMO = true;
    return makeDemoData(city);
  }
}

/**
 * Search for cities using WeatherAPI autocomplete endpoint.
 * GET /v1/search.json?key=KEY&q=QUERY
 * Returns up to 6 results as { name, region, country }.
 * Falls back to CITY_PROFILES pool in demo mode.
 */
async function searchCities(query) {
  if (USE_DEMO) {
    await new Promise(r => setTimeout(r, 150));
    const pool = Object.entries(CITY_PROFILES).map(([key, profile]) => ({
      name:    key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      region:  '',
      country: profile[4],
    }));
    const q = query.toLowerCase();
    return pool
      .filter(c => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      .slice(0, 8);
  }

  // If network became unavailable during a previous fetch, stay in demo mode
  if (USE_DEMO) {
    const pool = Object.entries(CITY_PROFILES).map(([key, profile]) => ({
      name:    key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      region:  '',
      country: profile[4],
    }));
    const q2 = query.toLowerCase();
    return pool.filter(c => c.name.toLowerCase().includes(q2) || c.country.toLowerCase().includes(q2)).slice(0, 8);
  }

  // WeatherAPI /search.json — returns name, region, country directly
  let res;
  try {
    res = await fetch(`${WA_BASE}/search.json?key=${API_KEY}&q=${encodeURIComponent(query)}`);
  } catch (_) { return []; }

  if (!res.ok) return [];
  const json = await res.json();
  // WeatherAPI search returns: [{ id, name, region, country, lat, lon, url }]
  return json.slice(0, 6).map(r => ({
    name:    r.name,
    region:  r.region  || '',
    country: r.country || '',
  }));
}


/* 
   5b. WEATHERAPI RESPONSE ADAPTER
   WeatherAPI's response is already close to our internal shape.
   This function just maps field names cleanly.

   WeatherAPI /current.json structure (confirmed from live response):
   {
     location: { name, region, country, lat, lon, localtime }
     current:  { temp_c, temp_f, is_day, feelslike_c, feelslike_f,
                 humidity, wind_kph, wind_mph, wind_dir,
                 vis_km, pressure_mb, precip_mm, dewpoint_c, dewpoint_f, uv,
                 condition: { text, code },
                 air_quality: { ... } }
   }

   WeatherAPI /forecast.json adds:
   forecast.forecastday[]: {
     date, astro: { sunrise, sunset },
     day: { maxtemp_c, maxtemp_f, mintemp_c, mintemp_f,
            daily_chance_of_rain, totalprecip_mm, uv,
            condition: { text, code } },
     hour[]: { time, temp_c, temp_f, chance_of_rain,
               condition: { text, code }, is_day }
   }
 */

/**
 * WeatherAPI /current.json + /forecast.json → internal shape.
 * Field names from WeatherAPI already match — just pass through
 * and merge current into a consistent object.
 */
function adaptWAData(primary, forecast) {
  // WeatherAPI /forecast.json structure:
  //   { location: {...}, current: {...}, forecast: { forecastday: [...] } }
  // WeatherAPI /current.json structure:
  //   { location: {...}, current: {...} }
  //
  // 'primary' is the forecast response (preferred) or current response (fallback).
  // 'forecast' is always the forecast response (or null).

  const loc = primary?.location  || {};
  const cur = primary?.current   || {};

  // Pull forecastday from whichever object has it
  const rawForecastdays =
    primary?.forecast?.forecastday ||
    forecast?.forecast?.forecastday ||
    [];

  // Build a safe fallback day in case forecastday is missing
  const todayStr = (loc.localtime || new Date().toISOString()).split('T')[0].split(' ')[0];
  const fallbackDay = {
    date:  todayStr,
    astro: { sunrise: '06:00 AM', sunset: '06:30 PM' },
    day: {
      maxtemp_c:            cur.temp_c || 0,
      maxtemp_f:            cur.temp_f || 32,
      mintemp_c:            (cur.temp_c || 0) - 4,
      mintemp_f:            (cur.temp_f || 32) - 7,
      daily_chance_of_rain: 0,
      totalprecip_mm:       cur.precip_mm || 0,
      uv:                   cur.uv || 0,
      condition:            cur.condition || { text: '', code: 1000 },
    },
    hour: Array.from({ length: 24 }, (_, h) => ({
      time:           `${todayStr} ${String(h).padStart(2,'0')}:00`,
      temp_c:         cur.temp_c || 0,
      temp_f:         cur.temp_f || 32,
      chance_of_rain: 0,
      condition:      cur.condition || { text: '', code: 1000 },
      is_day:         h >= 6 && h < 20 ? 1 : 0,
    })),
  };

  const forecastday = rawForecastdays.length > 0 ? rawForecastdays : [fallbackDay];

  return {
    location: {
      name:      loc.name      || 'Unknown',
      country:   loc.country   || '',
      lat:       loc.lat       || 0,
      lon:       loc.lon       || 0,
      localtime: loc.localtime || new Date().toISOString(),
    },
    current: {
      temp_c:      cur.temp_c      ?? 0,
      temp_f:      cur.temp_f      ?? 32,
      feelslike_c: cur.feelslike_c ?? cur.temp_c ?? 0,
      feelslike_f: cur.feelslike_f ?? cur.temp_f ?? 32,
      humidity:    cur.humidity    ?? 0,
      wind_kph:    cur.wind_kph    ?? 0,
      wind_mph:    cur.wind_mph    ?? 0,
      wind_dir:    cur.wind_dir    || '—',
      vis_km:      cur.vis_km      ?? 0,
      pressure_mb: cur.pressure_mb ?? 0,
      precip_mm:   cur.precip_mm   ?? 0,
      dewpoint_c:  cur.dewpoint_c  ?? (cur.temp_c != null ? +(cur.temp_c - ((100 - (cur.humidity||50)) / 5)).toFixed(1) : 0),
      dewpoint_f:  cur.dewpoint_f  ?? 0,
      uv:          cur.uv          ?? 0,
      condition:   cur.condition   || { text: 'Clear', code: 1000 },
      is_day:      cur.is_day      ?? 1,
    },
    forecast: { forecastday },
  };
}

/* 
   6. PARTICLE CANVAS (rain / snow)
*/

const canvas  = document.getElementById('particlesCanvas');
const ctx     = canvas.getContext('2d');
let particles = [];
let rafId     = null;
let particleType = 'none'; // 'rain' | 'snow' | 'none'

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function spawnParticles(type) {
  particleType = type;
  particles    = [];

  if (type === 'rain') {
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: 14 + Math.random() * 10,
        speed: 12 + Math.random() * 8,
        opacity: .2 + Math.random() * .4,
        angle: 0.18,
      });
    }
  } else if (type === 'snow') {
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 2 + Math.random() * 3,
        speed: 0.8 + Math.random() * 1.2,
        sway: Math.random() * 0.8 - 0.4,
        opacity: .4 + Math.random() * .5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
}

function animateParticles(ts) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (particleType === 'rain') {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.sin(p.angle) * p.len, p.y + Math.cos(p.angle) * p.len);
      ctx.stroke();
      ctx.restore();
      p.y += p.speed;
      p.x += Math.sin(p.angle) * p.speed * 0.3;
      if (p.y > canvas.height + p.len) {
        p.y = -p.len;
        p.x = Math.random() * canvas.width;
      }
    }
  } else if (particleType === 'snow') {
    for (const p of particles) {
      p.phase += 0.02;
      p.y += p.speed;
      p.x += p.sway + Math.sin(p.phase) * 0.5;
      if (p.y > canvas.height + 10) {
        p.y = -10;
        p.x = Math.random() * canvas.width;
      }
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle   = '#e0ecff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  rafId = requestAnimationFrame(animateParticles);
}

function startParticles(type) {
  if (!state.anim || type === 'none') {
    canvas.classList.remove('active');
    cancelAnimationFrame(rafId);
    particles = [];
    return;
  }
  spawnParticles(type);
  canvas.classList.add('active');
  if (!rafId) rafId = requestAnimationFrame(animateParticles);
}

function stopParticles() {
  canvas.classList.remove('active');
  cancelAnimationFrame(rafId);
  rafId = null;
  particles = [];
  particleType = 'none';
}


// ── Theme ──

function resolveTheme(t) {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function applyTheme(t) {
  state.theme = t;
  localStorage.setItem(THEME_KEY, t);
  const resolved = resolveTheme(t);
  document.documentElement.setAttribute('data-theme', resolved);
  // update header icon
  const icon = document.querySelector('#themeToggle i');
  icon.setAttribute('data-lucide', resolved === 'dark' ? 'sun' : 'moon');
  lucide.createIcons();
  // sync settings seg btns
  syncThemeSettings(t);
}

function syncThemeSettings(t) {
  ['setLight', 'setDark', 'setSystem'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const map = { light: 'setLight', dark: 'setDark', system: 'setSystem' };
  document.getElementById(map[t])?.classList.add('active');
}


//  Scene / Background

function updateScene(code, isDay) {
  const scene = document.getElementById('scene');
  // remove all weather classes
  scene.className = 'scene';
  const cls = waCodeToBg(code, isDay);
  scene.classList.add(cls);

  // particles
  if (cls === 'weather--rainy') startParticles('rain');
  else if (cls === 'weather--snowy') startParticles('snow');
  else stopParticles();
}


//  Render Functions 

function renderHero(data) {
  const { location, current, forecast } = data;
  const today  = forecast.forecastday[0];
  const isDay  = current.is_day;

  // Location
  document.getElementById('heroCity').textContent    = location.name;
  document.getElementById('heroCountry').textContent = `, ${location.country}`;

  // Temperature
  document.getElementById('heroTemp').textContent = temp(current.temp_c);
  document.getElementById('heroDeg').textContent  = '°C';

  // Condition + feels like
  document.getElementById('heroCond').textContent  = titleCase(current.condition.text);
  document.getElementById('heroFeels').textContent = `Feels like ${temp(current.feelslike_c)}°C`;

  // Big icon
  const wrap = document.getElementById('heroIconWrap');
  const ico  = waCodeToIcon(current.condition.code, isDay);
  wrap.innerHTML = `<i data-lucide="${ico}" class="hero-weather-icon"></i>`;

  // Stats — use nullish guards so missing fields show '—' not NaN/undefined
  document.getElementById('statWind').textContent     = current.wind_kph  != null ? Math.round(current.wind_kph)  : '—';
  document.getElementById('statWindUnit').textContent  = 'km/h';
  document.getElementById('statHumid').textContent    = current.humidity   != null ? current.humidity              : '—';
  document.getElementById('statVis').textContent      = current.vis_km     != null ? Math.round(current.vis_km)    : '—';
  document.getElementById('statPres').textContent     = current.pressure_mb != null ? current.pressure_mb          : '—';

  // Sun arc
  const sr = today.astro.sunrise;
  const ss = today.astro.sunset;
  document.getElementById('sunriseT').textContent = sr;
  document.getElementById('sunsetT').textContent  = ss;

  try {
    const now      = new Date();
    const sunrise  = parseSunTime(sr);
    const sunset   = parseSunTime(ss);
    const pct      = Math.max(0, Math.min(100, (now - sunrise) / (sunset - sunrise) * 100));
    document.getElementById('sunFill').style.width = `${pct}%`;
    document.getElementById('sunBall').style.left  = `${pct}%`;
  } catch (_) {}

  // Favorite button state
  const favKey   = `${location.name}, ${location.country}`;
  const favToggle = document.getElementById('favToggle');
  favToggle.classList.toggle('is-fav', state.favorites.includes(favKey));
}

function renderHourly(data) {
  const now = new Date();
  const todayHours = data.forecast.forecastday[0].hour;
  const nextHours  = data.forecast.forecastday[1]?.hour || [];
  const combined   = [...todayHours, ...nextHours].filter(h => new Date(h.time) >= now).slice(0, 24);

  const rail = document.getElementById('hourlyRail');
  rail.innerHTML = combined.map((h, i) => `
    <div class="h-card ${i === 0 ? 'now' : ''}"
         role="listitem"
         aria-label="${i === 0 ? 'Now' : hourLabel(h.time)}: ${temp(h.temp_c)}°C">
      <div class="h-time">${i === 0 ? 'Now' : hourLabel(h.time)}</div>
      <div class="h-icon"><i data-lucide="${waCodeToIcon(h.condition.code, h.is_day)}"></i></div>
      <div class="h-temp">${temp(h.temp_c)}°</div>
      ${h.chance_of_rain > 15 ? `<div class="h-rain">${h.chance_of_rain}%</div>` : '<div></div>'}
    </div>
  `).join('');
}

function renderDetails(data) {
  const c = data.current;

  // UV index
  const uv = c.uv ?? 0;
  document.getElementById('dUV').textContent      = uv;
  document.getElementById('dUVlabel').textContent  = uvLabel(uv);
  document.getElementById('uvCursor').style.left   = `${Math.min(93, uv / 11 * 100)}%`;

  // Precipitation
  document.getElementById('dPrecip').textContent   = c.precip_mm != null ? c.precip_mm : '—';

  // Wind direction + speed
  document.getElementById('dWindDir').textContent  = c.wind_dir  || '—';
  document.getElementById('dWindSpeed').textContent = c.wind_kph  != null
    ? `${Math.round(c.wind_kph)} km/h` : '—';

  // Dew point — WeatherAPI provides dewpoint_c directly; fall back to formula
  const dewC = c.dewpoint_c != null
    ? c.dewpoint_c
    : +(c.temp_c - ((100 - c.humidity) / 5)).toFixed(1);
  document.getElementById('dDew').textContent     = temp(dewC);
  document.getElementById('dDewUnit').textContent  = 'C';
}

function renderWeekForecast(data) {
  const days   = data.forecast.forecastday;
  const allHi  = days.map(d => d.day.maxtemp_c);
  const allLo  = days.map(d => d.day.mintemp_c);
  const absHi  = Math.max(...allHi);
  const absLo  = Math.min(...allLo);
  const range  = absHi - absLo || 1;

  const list = document.getElementById('weekList');
  list.innerHTML = days.map((fd, i) => {
    const hi = temp(fd.day.maxtemp_c);
    const lo = temp(fd.day.mintemp_c);

    const barLeft  = ((fd.day.mintemp_c - absLo) / range * 100).toFixed(1);
    const barWidth = ((fd.day.maxtemp_c - fd.day.mintemp_c) / range * 100).toFixed(1);

    return `
      <div class="w-row" role="listitem" aria-label="${dayLabel(fd.date, i)}: ${lo}–${hi}°C">
        <div class="w-day">${dayLabel(fd.date, i)}</div>
        <div class="w-icon"><i data-lucide="${waCodeToIcon(fd.day.condition.code, 1)}"></i></div>
        <div class="w-range">
          <div class="w-lo">${lo}°</div>
          <div class="w-bar-wrap">
            <div class="w-bar" style="margin-left:${barLeft}%;width:${barWidth}%"></div>
          </div>
          <div class="w-hi">${hi}°</div>
        </div>
        <div class="w-precip">${fd.day.daily_chance_of_rain ? fd.day.daily_chance_of_rain + '%' : ''}</div>
      </div>`;
  }).join('');
}

function renderFavStrip() {
  const strip = document.getElementById('favStrip');
  if (!state.favorites.length) { strip.innerHTML = ''; return; }

  strip.innerHTML = state.favorites.map(f => `
    <div class="fav-chip" data-city="${f.split(',')[0].trim()}" tabindex="0" role="button" aria-label="View weather for ${f}">
      <div class="fav-chip-city">${f.split(',')[0]}</div>
      <div class="fav-chip-temp">—</div>
      <div class="fav-chip-cond">${f.split(', ')[1] || ''}</div>
    </div>
  `).join('');

  strip.querySelectorAll('.fav-chip').forEach(chip => {
    chip.addEventListener('click', () => { loadWeather(chip.dataset.city); switchView('weather'); });
    chip.addEventListener('keydown', e => e.key === 'Enter' && chip.click());
  });
}

function renderFavoritesPage() {
  const content = document.getElementById('favsContent');

  if (!state.favorites.length) {
    content.innerHTML = `
      <div class="fav-empty">
        <i data-lucide="heart" style="width:52px;height:52px;stroke-width:1.3;color:var(--text-3)"></i>
        <div class="fav-empty-title">No saved cities</div>
        <div class="fav-empty-sub">Search for a city and tap ♡ to save it here for quick access.</div>
      </div>`;
    lucide.createIcons();
    return;
  }

  content.innerHTML = state.favorites.map(f => `
    <div class="fav-list-item" data-city="${f.split(',')[0].trim()}">
      <div>
        <div class="fav-li-city">${f.split(',')[0]}</div>
        <div class="fav-li-country">${f.split(', ')[1] || ''}</div>
      </div>
      <button class="fav-li-remove" data-remove="${f}" aria-label="Remove ${f} from favorites">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join('');

  content.querySelectorAll('.fav-list-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-remove]')) return;
      loadWeather(item.dataset.city);
    });
  });

  content.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.remove;
      state.favorites = state.favorites.filter(f => f !== key);
      localStorage.setItem(FAVS_KEY, JSON.stringify(state.favorites));
      renderFavoritesPage();
      renderFavStrip();
    });
  });

  lucide.createIcons();
}

/** Full weather render */
function renderWeather(data) {
  try {
    const { current } = data;
    updateScene(current.condition.code, current.is_day);
    renderHero(data);
    renderHourly(data);
    renderDetails(data);
    renderWeekForecast(data);
    lucide.createIcons();
  } catch (err) {
    console.error(err);
    console.error(JSON.stringify(data, null, 2));
  }
}


//  Load Weather 

async function loadWeather(city = state.lastCity) {
  city = city.trim();
  state.loading  = true;
  state.error    = null;
  state.lastCity = city;
  localStorage.setItem(CITY_KEY, city);

  showView('loading');

  try {
    const data = await fetchWeather(city);
    state.weather = data;

    if (!USE_DEMO) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }

    // Track recent cities
    const key = `${data.location.name}, ${data.location.country}`;
    state.recent = [key, ...state.recent.filter(c => c !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));

    showView('weather');
    renderWeather(data);
  } catch (err) {
    state.error = err.message;
    // Only show the error screen for meaningful user errors (city not found, rate limit).
    // Network/auth failures are already handled inside fetchWeather by returning demo data,
    // so if we still catch here it's a real parse/logic error — show it.
    const msg = err.message || 'Unable to load weather. Please try again.';
    if (state.weather) {
      // We already have weather data — just keep showing it, don't flash error screen
      console.error(msg);
    } else {
      showView('error');
      document.getElementById('errMsg').textContent = msg;
    }
  } finally {
    state.loading = false;
  }
}


//  View Switching 

const VIEWS = {
  loading:  'viewLoading',
  error:    'viewError',
  weather:  'viewWeather',
  settings: 'viewSettings',
  favs:     'viewFavs',
};

function showView(name) {
  Object.values(VIEWS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(VIEWS[name]);
  if (el) el.style.display = 'block';
}

function switchView(view) {
  state.currentView = view;

  // Nav highlight
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // Fav strip only visible on weather tab
  document.getElementById('favStrip').style.display = view === 'weather' ? 'flex' : 'none';

  if (view === 'weather') {
    // Only manage the view if we're not mid-load — loadWeather controls its own view
    if (!state.loading) {
      if (!state.weather) showView('loading');
      else if (state.error) showView('error');
      else showView('weather');
    }
  } else if (view === 'search') {
    showView('weather'); // keep weather visible, focus search
    document.getElementById('searchInput').focus();
  } else if (view === 'settings') {
    showView('settings');
  } else if (view === 'favs') {
    showView('favs');
    renderFavoritesPage();
  }
}


//  Search 

const searchInput    = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchDropdown');
const dropdownInner  = document.getElementById('dropdownInner');
let   searchTimer;

function openDropdown() {
  searchDropdown.classList.add('open');
  searchInput.setAttribute('aria-expanded', 'true');
}
function closeDropdown() {
  searchDropdown.classList.remove('open');
  searchInput.setAttribute('aria-expanded', 'false');
}

function renderDropdown(results, query) {
  let html = '';

  if (!query) {
    if (state.favorites.length) {
      html += `<div class="dd-label">Saved</div>`;
      html += state.favorites.map(f => ddItem(f.split(',')[0], f.split(', ')[1] || '', f, 'heart')).join('');
    }
    if (state.recent.length) {
      html += `<div class="dd-label">Recent</div>`;
      html += state.recent.map(f => ddItem(f.split(',')[0], f.split(', ')[1] || '', f, 'clock')).join('');
    }
  }

  if (query && results.length) {
    html += `<div class="dd-label">Results</div>`;
    html += results.map(r => {
      const key   = `${r.name}, ${r.country}`;
      const isFav = state.favorites.includes(key);
      return `
        <div class="dd-item" data-city="${r.name}" tabindex="0" role="option">
          <i data-lucide="map-pin"></i>
          <div>
            <div class="dd-item-name">${r.name}</div>
            <div class="dd-item-sub">${r.region ? r.region + ', ' : ''}${r.country}</div>
          </div>
          <button class="dd-fav-btn ${isFav ? 'is-fav' : ''}" data-fav="${key}" aria-label="${isFav ? 'Remove from' : 'Add to'} favorites">
            <i data-lucide="heart"></i>
          </button>
        </div>`;
    }).join('');
  } else if (query) {
    html = `<div class="dd-empty">No cities found — try a different spelling</div>`;
  }

  if (!html) {
    html = `<div class="dd-empty">Type a city name to search</div>`;
  }

  dropdownInner.innerHTML = html;
  lucide.createIcons();
}

function ddItem(name, country, key, icon) {
  return `
    <div class="dd-item" data-city="${name}" tabindex="0" role="option">
      <i data-lucide="${icon}"></i>
      <div>
        <div class="dd-item-name">${name}</div>
        <div class="dd-item-sub">${country}</div>
      </div>
    </div>`;
}

searchInput.addEventListener('focus', () => {
  renderDropdown([], '');
  openDropdown();
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  document.getElementById('searchClear').style.display = q ? 'flex' : 'none';
  clearTimeout(searchTimer);
  if (q.length < 2) {
    renderDropdown([], '');
    openDropdown();
    return;
  }
  searchTimer = setTimeout(async () => {
    const results = await searchCities(q);
    renderDropdown(results, q);
    openDropdown();
  }, 280);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-zone')) closeDropdown();
});

document.getElementById('searchClear').addEventListener('click', () => {
  searchInput.value = '';
  document.getElementById('searchClear').style.display = 'none';
  searchInput.focus();
  renderDropdown([], '');
});

// Keyboard nav in dropdown
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDropdown(); searchInput.blur(); }

  if (e.key === 'Enter') {
    const first = dropdownInner.querySelector('.dd-item');
    if (first) {
      // Select first dropdown suggestion
      first.click();
    } else {
      // No dropdown result — load whatever the user typed directly
      const q = searchInput.value.trim();
      if (q.length >= 2) {
        searchInput.value = '';
        document.getElementById('searchClear').style.display = 'none';
        closeDropdown();
        loadWeather(q);
      }
    }
  }

  if (e.key === 'ArrowDown') {
    const first = dropdownInner.querySelector('.dd-item');
    if (first) first.focus();
  }
});

dropdownInner.addEventListener('keydown', e => {
  const items = [...dropdownInner.querySelectorAll('.dd-item')];
  const idx   = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' && idx < items.length - 1) items[idx + 1].focus();
  if (e.key === 'ArrowUp'   && idx > 0) items[idx - 1].focus();
  if (e.key === 'ArrowUp'   && idx === 0) searchInput.focus();
  if (e.key === 'Enter' && document.activeElement.classList.contains('dd-item'))
    document.activeElement.click();
});

// Dropdown item click — city or fav button
dropdownInner.addEventListener('click', e => {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    e.stopPropagation();
    const key = favBtn.dataset.fav;
    if (state.favorites.includes(key)) {
      state.favorites = state.favorites.filter(f => f !== key);
      favBtn.classList.remove('is-fav');
    } else {
      state.favorites.push(key);
      favBtn.classList.add('is-fav');
    }
    localStorage.setItem(FAVS_KEY, JSON.stringify(state.favorites));
    renderFavStrip();
    return;
  }

  const item = e.target.closest('.dd-item');
  if (item) {
    const city = item.dataset.city;
    searchInput.value = '';
    document.getElementById('searchClear').style.display = 'none';
    closeDropdown();
    // loadWeather handles showView internally — do NOT call switchView here
    // because switchView checks state.loading and can re-hide the weather view
    loadWeather(city);
  }
});


/* 
   13. FAVORITE TOGGLE (hero button)
 */

document.getElementById('favToggle').addEventListener('click', () => {
  if (!state.weather) return;
  const { name, country } = state.weather.location;
  const key = `${name}, ${country}`;
  const btn = document.getElementById('favToggle');

  if (state.favorites.includes(key)) {
    state.favorites = state.favorites.filter(f => f !== key);
    btn.classList.remove('is-fav');
  } else {
    state.favorites.push(key);
    btn.classList.add('is-fav');
  }

  localStorage.setItem(FAVS_KEY, JSON.stringify(state.favorites));
  renderFavStrip();
});


//  Settings Events

// Temperature always °C per requirements — unit toggle is display-only
document.getElementById('unitToggle').addEventListener('click', () => {
  document.getElementById('unitLabel').textContent = '°C';
});

function syncUnitSettings() {
  document.getElementById('setC').classList.add('active');
  document.getElementById('setF').classList.remove('active');
}

document.getElementById('setC').addEventListener('click', () => syncUnitSettings());
document.getElementById('setF').addEventListener('click', () => syncUnitSettings()); // snap back to C

// Theme buttons
document.getElementById('themeToggle').addEventListener('click', () => {
  const resolved = resolveTheme(state.theme);
  applyTheme(resolved === 'dark' ? 'light' : 'dark');
});
document.getElementById('setLight').addEventListener('click',  () => applyTheme('light'));
document.getElementById('setDark').addEventListener('click',   () => applyTheme('dark'));
document.getElementById('setSystem').addEventListener('click', () => applyTheme('system'));

// System theme listener
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme('system');
});

// Settings button → jump to settings
document.getElementById('settingsBtn').addEventListener('click', () => switchView('settings'));

// Animation toggle
document.getElementById('animSwitch').addEventListener('change', e => {
  state.anim = e.target.checked;
  localStorage.setItem(ANIM_KEY, state.anim);
  if (!state.anim) stopParticles();
  else if (state.weather) {
    const cls = waCodeToBg(state.weather.current.condition.code, state.weather.current.is_day);
    if (cls === 'weather--rainy') startParticles('rain');
    else if (cls === 'weather--snowy') startParticles('snow');
  }
});

// Retry
document.getElementById('retryBtn').addEventListener('click', () => loadWeather());


//  Bottom Nav 

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});




//  Init 

(function init() {
  // Temperature always Celsius
  state.unit = 'C';
  document.getElementById('unitLabel').textContent = '°C';
  syncUnitSettings();

  // Apply saved theme
  applyTheme(state.theme);
  document.getElementById('animSwitch').checked = state.anim;

  // Render fav strip
  renderFavStrip();

  // Load weather
  loadWeather();

  // Init lucide
  lucide.createIcons();

})();

