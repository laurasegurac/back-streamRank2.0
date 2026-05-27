// =====================================================
// scrapers/scheduler.js
// Corre el scraper automáticamente cada lunes a las 3am
// Uso: node scrapers/scheduler.js
// =====================================================

const { execSync } = require('child_process');
const path         = require('path');

function getMsHastaLunes3am() {
  const ahora  = new Date();
  const target = new Date(ahora);

  // Ir al próximo lunes
  const dia = ahora.getDay(); // 0=dom, 1=lun...
  const diasHastaLunes = dia === 1 ? 7 : (8 - dia) % 7 || 7;
  target.setDate(ahora.getDate() + diasHastaLunes);
  target.setHours(3, 0, 0, 0);

  return target.getTime() - ahora.getTime();
}

function correrScraper() {
  console.log(`\n🕐 ${new Date().toLocaleString('es-CO')} — Iniciando actualización semanal...`);
  try {
    execSync(`node ${path.join(__dirname, 'scraper.js')}`, { stdio: 'inherit' });
    console.log('✅ Actualización completada');
  } catch (err) {
    console.error('❌ Error en actualización:', err.message);
  }

  // Programar la siguiente (en 7 días)
  setTimeout(correrScraper, 7 * 24 * 60 * 60 * 1000);
}

const msHasta = getMsHastaLunes3am();
const horas   = Math.round(msHasta / 1000 / 60 / 60);

console.log(`⏰ Scheduler activo — próxima actualización en ~${horas} horas (lunes 3am)`);
setTimeout(correrScraper, msHasta);