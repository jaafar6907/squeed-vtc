// api/tarifs.js — donne la grille de prix aux formulaires de squeed.fr et ski.squeed.fr
// Adresse : https://reservation.squeed.fr/api/tarifs
const { chargerTarifs } = require('./_tarifs');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  try {
    const t = chargerTarifs();
    return res.status(200).json({
      prix: t.prix,                     // prix[depart][destination] = { s: [semaine…], sa: [samedi…] }
      samedis: t.regles.samedis,
      majo: t.regles.majo / 100,
      saison: { pct: t.regles.saison.pct / 100, debut: t.regles.saison.debut, fin: t.regles.saison.fin },
      supplements: t.regles.supplements,
    });
  } catch (err) {
    console.error('Erreur tarifs :', err);
    return res.status(500).json({ error: 'Tarifs indisponibles' });
  }
};
