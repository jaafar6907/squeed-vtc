// api/get-session.js — appelé par la page confirmation.html après le paiement
// Affiche le récapitulatif. Les e-mails sont envoyés par le webhook Stripe ;
// cette page ne les envoie qu'en secours (si, 90 s après le paiement, ils ne sont toujours pas partis).
const { envoyerEmailsReservation } = require('./_emails');

module.exports = async function handler(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id manquant' });

  try {
    let r;
    try {
      r = await envoyerEmailsReservation(sessionId, { delaiMinSecondes: 90 });
    } catch (mailErr) {
      // Un souci d'e-mail ne doit pas empêcher le client de voir sa confirmation
      console.error('Erreur envoi e-mail (secours):', mailErr.message || mailErr);
      return res.status(200).json({ metadata: {}, amount_total: null, info: 'email_erreur' });
    }
    if (r.statut === 'non_paye') return res.status(402).json({ error: 'Paiement non confirmé' });

    return res.status(200).json({
      metadata: r.meta,
      amount_total: r.amount,
      customer_email: r.email,
    });
  } catch (err) {
    console.error('Erreur get-session:', err);
    return res.status(500).json({ error: err.message });
  }
};
