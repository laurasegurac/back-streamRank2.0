// =====================================================
// scrapers/scraper-plataformas.js
// Scrapea top 100 por plataforma y guarda en
// data/plataformas/<nombre>.json
// Uso: node scrapers/scraper-plataformas.js
//      node scrapers/scraper-plataformas.js netflix
// =====================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'api.themoviedb.org';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const PROVIDERS = {
  'netflix':      8,
  'amazon-prime': 119,
  'disney-plus':  337,
  'hbo-max':      1899,
  'apple-tv':     350,
};

const PLATAFORMA_NOMBRES = {
  'netflix':      'Netflix',
  'amazon-prime': 'Amazon Prime Video',
  'disney-plus':  'Disney+',
  'hbo-max':      'HBO Max',
  'apple-tv':     'Apple TV+',
};

/* ── Helpers ── */
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/* ── Géneros ── */
async function obtenerGeneros() {
  const [gMovie, gTv] = await Promise.all([
    fetchJSON(`/3/genre/movie/list?api_key=${API_KEY}&language=es-ES`),
    fetchJSON(`/3/genre/tv/list?api_key=${API_KEY}&language=es-ES`),
  ]);
  const mapa = {};
  [...(gMovie.genres || []), ...(gTv.genres || [])].forEach(g => { mapa[g.id] = g.name; });
  return mapa;
}

/* ── Trailer ── */
async function getTrailer(id, mediaType) {
  try {
    const data = await fetchJSON(`/3/${mediaType}/${id}/videos?api_key=${API_KEY}&language=en-US`);
    const t = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    return t ? `https://www.youtube.com/embed/${t.key}?autoplay=1` : '';
  } catch { return ''; }
}

/* ── Duración ── */
async function getDuracion(id, mediaType) {
  try {
    if (mediaType === 'movie') {
      const det = await fetchJSON(`/3/movie/${id}?api_key=${API_KEY}&language=es-ES`);
      return det.runtime ? `${det.runtime} min` : '';
    } else {
      const det = await fetchJSON(`/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
      const s = det.number_of_seasons;
      return s ? `${s} Temporada${s > 1 ? 's' : ''}` : '';
    }
  } catch { return ''; }
}

/* ── Procesar item ── */
async function procesarItem(item, mediaType, generosMapa, categoriaId) {
  const id      = item.id;
  const title   = item.title || item.name || '';
  const desc    = item.overview || '';
  const rating  = parseFloat((item.vote_average || 0).toFixed(1));
  const img     = item.poster_path ? `${IMG_BASE}${item.poster_path}` : '';
  const year    = (item.release_date || item.first_air_date || '').slice(0, 4);
  const generos = (item.genre_ids || []).map(gid => generosMapa[gid]).filter(Boolean);
  const points  = item.popularity ? Math.round(item.popularity) : Math.round(rating * 1000);

  const [trailer, duration] = await Promise.all([
    getTrailer(id, mediaType),
    getDuracion(id, mediaType),
  ]);

  // Para plataformas, forzamos el nombre correcto
  const platform = PLATAFORMA_NOMBRES[categoriaId] || '';

  return {
    id:        `tmdb-${id}`,
    tmdbId:    id,
    title,
    type:      mediaType === 'tv' ? 'Serie' : 'Película',
    genres:    generos,
    rating,
    points,
    duration,
    platform,
    year:      parseInt(year) || 0,
    img,
    trailer,
    desc,
    categoria: categoriaId,
  };
}

/* ── Fetch páginas (hasta 100 items = 5 páginas de 20) ── */
async function fetchPaginas(mediaType, providerId, categoriaId, generosMapa, maxItems = 100) {
  const results = [];
  const maxPages = Math.ceil(maxItems / 20);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `/3/discover/${mediaType}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&vote_count.gte=300&with_watch_providers=${providerId}&watch_region=CO&page=${page}`;
      const data = await fetchJSON(url);
      const items = data.results || [];
      if (!items.length) break;

      for (const item of items) {
        if (results.length >= maxItems) break;
        const procesado = await procesarItem(item, mediaType, generosMapa, categoriaId);
        results.push(procesado);
        process.stdout.write(`   ✅ [${results.length}] ${procesado.title} ⭐${procesado.rating}\n`);
        await sleep(200);
      }

      if (items.length < 20) break;
      await sleep(300);
    } catch (err) {
      console.error(`   ❌ Página ${page} error:`, err.message);
      break;
    }
  }

  return results;
}

/* ── Scraper de una plataforma ── */
async function scrapearPlataforma(categoriaId, providerId, generosMapa) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📺 Scrapeando: ${PLATAFORMA_NOMBRES[categoriaId]} (provider ${providerId})`);
  console.log('═'.repeat(50));

  const series    = await fetchPaginas('tv',    providerId, categoriaId, generosMapa, 50);
  const peliculas = await fetchPaginas('movie', providerId, categoriaId, generosMapa, 50);

  // Combinar, quitar duplicados por tmdbId, ordenar por rating
  const vistos = new Set();
  const todos  = [];
  for (const item of [...series, ...peliculas]) {
    if (!vistos.has(item.tmdbId)) {
      vistos.add(item.tmdbId);
      todos.push(item);
    }
  }
  todos.sort((a, b) => b.rating - a.rating);

  console.log(`\n   📊 Total único: ${todos.length} items`);
  console.log(`   🏆 Top 10:`);
  todos.slice(0, 10).forEach((i, idx) => {
    console.log(`      ${idx + 1}. ${i.title} ⭐${i.rating} (${i.type})`);
  });

  return todos;
}

/* ── MAIN ── */
async function main() {
  console.log('🎬 StreamRank — Scraper Plataformas');
  console.log('Trae ~100 items por plataforma desde TMDB');

  const generosMapa = await obtenerGeneros();
  console.log(`✅ Géneros: ${Object.keys(generosMapa).length}`);

  // Permite correr una sola plataforma: node scraper-plataformas.js netflix
  const soloUna = process.argv[2];
  const targets = soloUna
    ? { [soloUna]: PROVIDERS[soloUna] }
    : PROVIDERS;

  if (soloUna && !PROVIDERS[soloUna]) {
    console.error(`❌ Plataforma desconocida: ${soloUna}`);
    console.error(`   Opciones: ${Object.keys(PROVIDERS).join(', ')}`);
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', 'data', 'plataformas');
  ensureDir(outDir);

  for (const [catId, providerId] of Object.entries(targets)) {
    const items    = await scrapearPlataforma(catId, providerId, generosMapa);
    const filePath = path.join(outDir, `${catId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`\n   💾 Guardado: data/plataformas/${catId}.json (${items.length} items)`);
    await sleep(500);
  }

  console.log('\n✅ Scraper plataformas completado');
}

main().catch(console.error);