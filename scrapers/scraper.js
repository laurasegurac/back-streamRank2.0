// =====================================================
// scrapers/scraper.js — Orquestador
// Corre los 3 scrapers en secuencia
// Uso: node scrapers/scraper.js
//      node scrapers/scraper.js plataformas
//      node scrapers/scraper.js estudios
//      node scrapers/scraper.js sagas
// =====================================================

const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');

const dir = __dirname;

function correr(archivo, label) {
  console.log(`\n${'▓'.repeat(55)}`);
  console.log(`▶  ${label}`);
  console.log('▓'.repeat(55));
  try {
    execSync(`node ${path.join(dir, archivo)}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Error corriendo ${archivo}:`, err.message);
  }
}

const solo = process.argv[2];

if (!solo || solo === 'plataformas') correr('scraper-plataformas.js', 'PLATAFORMAS');
if (!solo || solo === 'estudios')    correr('scraper-estudios.js',    'ESTUDIOS');
if (!solo || solo === 'sagas')       correr('scraper-sagas.js',       'SAGAS');

const fecha = new Date().toLocaleDateString('es-CO', {
  day: 'numeric', month: 'long', year: 'numeric'
});
const outPath = path.join(__dirname, '..', 'data', 'last-update.json');
fs.writeFileSync(outPath, JSON.stringify({ fecha, timestamp: Date.now() }), 'utf8');

console.log('\n✅ Todos los scrapers completados');
console.log(`📅 Última actualización guardada: ${fecha}`);
console.log('📁 Archivos en: data/plataformas/, data/estudios/, data/sagas/');