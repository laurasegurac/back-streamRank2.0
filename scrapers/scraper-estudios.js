// =====================================================
// scrapers/scraper-estudios.js
// Scrapea top 100 por estudio/compañía y guarda en
// data/estudios/<nombre>.json
// Uso: node scrapers/scraper-estudios.js
//      node scrapers/scraper-estudios.js pixar
// =====================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_KEY  = 'e34fccb427b4744d95d52c5ab261c873';
const BASE_URL = 'api.themoviedb.org';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const STUDIOS = {
  'warner':        { id: 174,   name: 'Warner Bros.' },
  'pixar':         { id: 3,     name: 'Pixar' },
  'disney':        { id: 2,     name: 'Walt Disney' },
  'studio-ghibli': { id: 10342, name: 'Studio Ghibli' },
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

/* ── Plataforma ── */
async function getPlataforma(id, mediaType) {
  const NOMBRES = { 8: 'Netflix', 119: 'Amazon Prime Video', 337: 'Disney+', 384: 'HBO Max', 350: 'Apple TV+' };
  try {
    const data = await fetchJSON(`/3/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`);
    const co = data.results?.CO;
    const providers = co?.flatrate || co?.ads || [];
    if (!providers.length) return '';
    return NOMBRES[providers[0].provider_id] || providers[0].provider_name || '';
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

  const [trailer, platform, duration] = await Promise.all([
    getTrailer(id, mediaType),
    getPlataforma(id, mediaType),
    getDuracion(id, mediaType),
  ]);

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

/* ── Fetch páginas ── */
async function fetchPaginas(mediaType, companyId, categoriaId, generosMapa, maxItems = 50) {
  const results = [];
  const maxPages = Math.ceil(maxItems / 20);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `/3/discover/${mediaType}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&vote_count.gte=100&with_companies=${companyId}&page=${page}`;
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

/* ── Scraper de un estudio ── */
async function scrapearEstudio(categoriaId, companyId, nombre, generosMapa) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🎬 Scrapeando: ${nombre} (company ${companyId})`);
  console.log('═'.repeat(50));

  const peliculas = await fetchPaginas('movie', companyId, categoriaId, generosMapa, 60);
  const series    = await fetchPaginas('tv',    companyId, categoriaId, generosMapa, 40);

  const vistos = new Set();
  const todos  = [];
  for (const item of [...peliculas, ...series]) {
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
  console.log('🎬 StreamRank — Scraper Estudios');
  console.log('Trae ~100 items por estudio desde TMDB');

  const generosMapa = await obtenerGeneros();
  console.log(`✅ Géneros: ${Object.keys(generosMapa).length}`);

  const soloUno = process.argv[2];
  const targets = soloUno
    ? { [soloUno]: STUDIOS[soloUno] }
    : STUDIOS;

  if (soloUno && !STUDIOS[soloUno]) {
    console.error(`❌ Estudio desconocido: ${soloUno}`);
    console.error(`   Opciones: ${Object.keys(STUDIOS).join(', ')}`);
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', 'data', 'estudios');
  ensureDir(outDir);

  for (const [catId, studio] of Object.entries(targets)) {
    const items    = await scrapearEstudio(catId, studio.id, studio.name, generosMapa);
    const filePath = path.join(outDir, `${catId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`\n   💾 Guardado: data/estudios/${catId}.json (${items.length} items)`);
    await sleep(500);
  }

  console.log('\n✅ Scraper estudios completado');
}

main().catch(console.error);