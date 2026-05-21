// =====================================================
// scraper.js — Trae Top 10 por categoría desde TMDB
// Uso: node scraper.js
// =====================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_KEY  = 'e34fccb427b4744d95d52c5ab261c873';
const BASE_URL = 'api.themoviedb.org';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

/* ── IDs de proveedores en TMDB (Colombia) ── */
const PROVIDERS = {
  'netflix':      8,
  'amazon-prime': 119,
  'disney-plus':  337,
  'hbo-max':      619,
  'apple-tv':     350,
};

/* ── IDs de compañías de producción en TMDB ── */
const STUDIOS = {
  'warner':        { id: 174,  name: 'Warner Bros' },
  'pixar':         { id: 3,    name: 'Pixar' },
  'disney':        { id: 2,    name: 'Walt Disney' },
  'studio-ghibli': { id: 10342,name: 'Studio Ghibli' },
};

/* ── Colecciones/keywords para sagas ── */
const SAGAS = {
  'star-wars':    { keyword: 210024, name: 'Star Wars' },
  'harry-potter': { keyword: 83133,  name: 'Harry Potter' },
  'lotr':         { keyword: 818,    name: 'Lord of the Rings' },
  'mcu':          { keyword: 180547, name: 'Marvel Cinematic Universe' },
};

/* ── Helper fetch ── */
function fetchJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL,
      path:     urlPath,
      method:   'GET',
      headers:  { 'Accept': 'application/json' },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Error parseando JSON')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ── Obtener géneros ── */
async function obtenerGeneros() {
  const [gMovie, gTv] = await Promise.all([
    fetchJSON(`/3/genre/movie/list?api_key=${API_KEY}&language=es-ES`),
    fetchJSON(`/3/genre/tv/list?api_key=${API_KEY}&language=es-ES`),
  ]);
  const todos = [...(gMovie.genres||[]), ...(gTv.genres||[])];
  const mapa  = {};
  todos.forEach(g => { mapa[g.id] = g.name; });
  return mapa;
}

/* ── Obtener trailer ── */
async function getTrailer(id, mediaType) {
  try {
    const data = await fetchJSON(`/3/${mediaType}/${id}/videos?api_key=${API_KEY}&language=en-US`);
    const t = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    return t ? `https://www.youtube.com/embed/${t.key}?autoplay=1` : '';
  } catch { return ''; }
}

/* ── Obtener plataforma principal (Colombia) ── */
async function getPlataforma(id, mediaType) {
  const PLATAFORMAS = { 8:'Netflix', 9:'Amazon Prime Video', 337:'Disney+', 384:'HBO Max', 350:'Apple TV+' };
  try {
    const data = await fetchJSON(`/3/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`);
    const co   = data.results?.CO;
    const providers = co?.flatrate || co?.ads || [];
    if (!providers.length) return '';
    return PLATAFORMAS[providers[0].provider_id] || providers[0].provider_name || '';
  } catch { return ''; }
}

/* ── Procesar resultado de TMDB → objeto estándar ── */
async function procesarItem(item, mediaType, generosMapa, categoriaId) {
  const id      = item.id;
  const title   = item.title || item.name || '';
  const desc    = item.overview || '';
  const rating  = parseFloat((item.vote_average || 0).toFixed(1));
  const img     = item.poster_path ? `${IMG_BASE}${item.poster_path}` : '';
  const year    = (item.release_date || item.first_air_date || '').slice(0, 4);
  const generos = (item.genre_ids || []).map(gid => generosMapa[gid]).filter(Boolean);

  const [trailer, plataforma] = await Promise.all([
    getTrailer(id, mediaType),
    getPlataforma(id, mediaType),
  ]);

  // Duración
  let duration = '';
  try {
    if (mediaType === 'movie') {
      const det = await fetchJSON(`/3/movie/${id}?api_key=${API_KEY}&language=es-ES`);
      duration = det.runtime ? `${det.runtime} min` : '';
    } else {
      const det = await fetchJSON(`/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
      const s   = det.number_of_seasons;
      duration  = s ? `${s} Temporada${s > 1 ? 's' : ''}` : '';
    }
  } catch {}

  return {
    id:         `tmdb-${id}`,
    tmdbId:     id,
    title,
    type:       mediaType === 'tv' ? 'Serie' : 'Película',
    genres:     generos,
    rating,
    points:     Math.round(rating * 1000),
    duration,
    platform:   plataforma,
    year:       parseInt(year) || 0,
    img,
    trailer,
    desc,
    categoria:  categoriaId,
  };
}

/* ── Top por PLATAFORMA (discover) ── */
async function fetchPorPlataforma(categoriaId, providerId, generosMapa) {
  console.log(`\n📺 Plataforma: ${categoriaId} (provider ${providerId})`);
  const results = [];

  for (const mediaType of ['tv', 'movie']) {
    try {
      const url  = `/3/discover/${mediaType}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&vote_count.gte=500&with_watch_providers=${providerId}&watch_region=CO&page=1`;
      const data = await fetchJSON(url);
      const top5 = (data.results || []).slice(0, 5);

      for (const item of top5) {
        const procesado = await procesarItem(item, mediaType, generosMapa, categoriaId);
        results.push(procesado);
        console.log(`   ✅ ${procesado.title} (${procesado.type}) ⭐${procesado.rating}`);
        await sleep(250);
      }
    } catch (err) {
      console.error(`   ❌ Error ${mediaType}:`, err.message);
    }
  }

  // Ordenar por rating y tomar top 10
  return results.sort((a,b) => b.rating - a.rating).slice(0, 10);
}

/* ── Top por ESTUDIO (discover + company) ── */
async function fetchPorEstudio(categoriaId, companyId, generosMapa) {
  console.log(`\n🎬 Estudio: ${categoriaId} (company ${companyId})`);
  const results = [];

  for (const mediaType of ['movie', 'tv']) {
    try {
      const url  = `/3/discover/${mediaType}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&vote_count.gte=200&with_companies=${companyId}&page=1`;
      const data = await fetchJSON(url);
      const top5 = (data.results || []).slice(0, 5);

      for (const item of top5) {
        const procesado = await procesarItem(item, mediaType, generosMapa, categoriaId);
        results.push(procesado);
        console.log(`   ✅ ${procesado.title} (${procesado.type}) ⭐${procesado.rating}`);
        await sleep(250);
      }
    } catch (err) {
      console.error(`   ❌ Error ${mediaType}:`, err.message);
    }
  }

  return results.sort((a,b) => b.rating - a.rating).slice(0, 10);
}

/* ── Top por SAGA (keyword) ── */
async function fetchPorSaga(categoriaId, keywordId, generosMapa) {
  console.log(`\n⚡ Saga: ${categoriaId} (keyword ${keywordId})`);
  const results = [];

  for (const mediaType of ['movie', 'tv']) {
    try {
      const url  = `/3/discover/${mediaType}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&vote_count.gte=200&with_keywords=${keywordId}&page=1`;
      const data = await fetchJSON(url);
      const top5 = (data.results || []).slice(0, 5);

      for (const item of top5) {
        const procesado = await procesarItem(item, mediaType, generosMapa, categoriaId);
        results.push(procesado);
        console.log(`   ✅ ${procesado.title} (${procesado.type}) ⭐${procesado.rating}`);
        await sleep(250);
      }
    } catch (err) {
      console.error(`   ❌ Error ${mediaType}:`, err.message);
    }
  }

  return results.sort((a,b) => b.rating - a.rating).slice(0, 10);
}

/* ── MAIN ── */
async function main() {
  console.log('🎬 StreamRank Scraper — TMDB');
  console.log('═'.repeat(50));

  const generosMapa = await obtenerGeneros();
  console.log(`✅ Géneros cargados: ${Object.keys(generosMapa).length}`);

  const todoElCatalogo = {};

  // Plataformas
  for (const [catId, providerId] of Object.entries(PROVIDERS)) {
    todoElCatalogo[catId] = await fetchPorPlataforma(catId, providerId, generosMapa);
    await sleep(500);
  }

  // Estudios
  for (const [catId, studio] of Object.entries(STUDIOS)) {
    todoElCatalogo[catId] = await fetchPorEstudio(catId, studio.id, generosMapa);
    await sleep(500);
  }

  // Sagas
  for (const [catId, saga] of Object.entries(SAGAS)) {
    todoElCatalogo[catId] = await fetchPorSaga(catId, saga.keyword, generosMapa);
    await sleep(500);
  }

  // Guardar
  const outputPath = path.join(__dirname, 'data', 'movies.json');
  fs.writeFileSync(outputPath, JSON.stringify(todoElCatalogo, null, 2), 'utf8');

  // Resumen
  console.log('\n' + '═'.repeat(50));
  console.log('✅ movies.json actualizado');
  let total = 0;
  for (const [cat, items] of Object.entries(todoElCatalogo)) {
    console.log(`   ${cat}: ${items.length} items`);
    total += items.length;
  }
  console.log(`\n📊 Total: ${total} items`);
  console.log(`📁 ${outputPath}`);
}

main().catch(console.error);