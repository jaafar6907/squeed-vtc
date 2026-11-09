// api/_tarifs.js — lit tarifs.csv et regles.csv (à la racine du dépôt GitHub)
// C'est le SEUL endroit où sont les prix : le serveur et les 2 formulaires (squeed.fr, ski.squeed.fr) les lisent ici.
// tarifs.csv : 1 ligne par trajet, prix ALLER SIMPLE —
//   colonnes 5 à 9  = du lundi au vendredi + dimanche (Berline, Van Éco, V-Class, Vito, Sprinter)
//   colonnes 10 à 14 = le samedi (même ordre). Case vide = « sur devis ».
const fs = require('fs');
const path = require('path');

const VEHICULES = 5;

function lireCsv(nom) {
  const txt = fs.readFileSync(path.join(process.cwd(), nom), 'utf-8').replace(/^\uFEFF/, '');
  const lignes = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  const sep = (lignes[0] || '').includes(';') ? ';' : ',';
  return lignes.slice(1).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
}

function nombre(c) {
  if (c == null || c === '') return null;
  const n = parseFloat(String(c).replace(/[€\s]/g, '').replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

let cache = null, cacheLe = 0;

function chargerTarifs() {
  if (cache && Date.now() - cacheLe < 30000) return cache; // cache 30 s

  const prix = {};
  for (const c of lireCsv('tarifs.csv')) {
    const dep = c[0], dest = c[1];
    if (!dep || !dest) continue;
    const s = [], sa = [];
    for (let i = 0; i < VEHICULES; i++) { s.push(nombre(c[4 + i])); sa.push(nombre(c[9 + i])); }
    // Si la colonne samedi est entièrement vide, on reprend le prix de la semaine
    const samediVide = sa.every((x) => x === null);
    if (!prix[dep]) prix[dep] = {};
    prix[dep][dest] = { s, sa: samediVide ? s.slice() : sa };
  }
  // Gares de Grenoble et Chambéry : mêmes prix que leurs aéroports
  if (prix.GNB_AIR) prix.GNB_TRAIN = prix.GNB_AIR;
  if (prix.CMF_AIR) prix.CMF_TRAIN = prix.CMF_AIR;

  const r = { majo: 20, samedis: [], saison: { pct: 0, debut: '', fin: '' }, supplements: [0, 0, 5, 20, 18, 0] };
  const SUPP = ['supplement_rehausseur', 'supplement_siege_enfant', 'supplement_siege_bebe',
    'supplement_support_ski', 'supplement_velo', 'supplement_fauteuil_roulant'];
  try {
    for (const c of lireCsv('regles.csv')) {
      const cle = c[0], val = c[1];
      if (cle === 'majoration_samedi_vacances') r.majo = parseFloat(val) || 0;
      else if (cle === 'saison_samedi_pourcent') r.saison.pct = parseFloat(String(val).replace(',', '.')) || 0;
      else if (cle === 'saison_debut' && /^\d{4}-\d{2}-\d{2}$/.test(val)) r.saison.debut = val;
      else if (cle === 'saison_fin' && /^\d{4}-\d{2}-\d{2}$/.test(val)) r.saison.fin = val;
      else if (cle === 'samedi_vacances' && /^\d{4}-\d{2}-\d{2}$/.test(val)) r.samedis.push(val);
      else if (SUPP.includes(cle)) r.supplements[SUPP.indexOf(cle)] = parseFloat(String(val).replace(',', '.')) || 0;
    }
  } catch (e) {
    console.error('regles.csv illisible, règles par défaut utilisées :', e.message);
  }

  cache = { prix, regles: r };
  cacheLe = Date.now();
  return cache;
}

module.exports = { chargerTarifs };
