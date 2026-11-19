// ============================================================
// api/_squeed-app.js — envoie chaque réservation payée vers Squeed App
// (l'application des chauffeurs). La course y apparaît « à attribuer ».
// Variables Vercel nécessaires : SQUEED_APP_URL, SQUEED_APP_KEY
// Sans ces variables, rien n'est envoyé (le site fonctionne comme avant).
// ============================================================

async function envoyerVersSqueedApp(r) {
  const url = process.env.SQUEED_APP_URL;
  const key = process.env.SQUEED_APP_KEY;
  if (!url || !key) return 'non_configure';
  if (!r || !r.session) return 'sans_session';

  const telephone = (r.meta && r.meta.telephone) || (r.session.customer_details && r.session.customer_details.phone) || '';
  const reponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-squeed-key': key },
    body: JSON.stringify({
      sessionId: r.session.id,
      meta: r.meta || {},
      amount: r.amount,
      email: r.email || '',
      telephone,
    }),
  });
  if (!reponse.ok) throw new Error('Squeed App a répondu ' + reponse.status + ' : ' + (await reponse.text()).slice(0, 200));
  return 'envoye';
}

module.exports = { envoyerVersSqueedApp };
