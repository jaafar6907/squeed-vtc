// api/stripe-webhook.js — Stripe appelle cette adresse dès qu'un paiement réussit.
// Les e-mails de réservation partent ici, même si le client ferme la page avant la confirmation.
// Variables Vercel nécessaires : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_…), RESEND_API_KEY
// + SQUEED_APP_URL et SQUEED_APP_KEY pour envoyer la course dans Squeed App
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { envoyerEmailsReservation } = require('./_emails');
const { envoyerVersSqueedApp } = require('./_squeed-app');

// Stripe exige le corps EXACT de la requête pour vérifier la signature : on le lit brut.
function lireCorpsBrut(req) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    req.on('data', (c) => morceaux.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let event;
  try {
    const corps = await lireCorpsBrut(req);
    event = stripe.webhooks.constructEvent(corps, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook : signature invalide —', err.message);
    return res.status(400).send('Signature invalide');
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const sessionId = event.data.object.id;
    try {
      const r = await envoyerEmailsReservation(sessionId, { delaiMinSecondes: 0 });
      console.log('Webhook ' + event.type + ' ' + sessionId + ' → ' + r.statut);

      // Course dans Squeed App (une seule fois, même si Stripe renvoie l'événement)
      if (r.statut !== 'non_paye') {
        try {
          const a = await envoyerVersSqueedApp(r);
          console.log('Squeed App ' + sessionId + ' → ' + a);
        } catch (errApp) {
          // Réponse 500 : Stripe réessaiera ; les e-mails ne repartent pas (déjà marqués envoyés)
          console.error('Webhook : course non envoyée à Squeed App —', errApp.message || errApp);
          return res.status(500).send('Erreur Squeed App');
        }
      }
    } catch (err) {
      // Réponse 500 : Stripe réessaiera automatiquement (pendant 3 jours)
      console.error('Webhook : e-mails non envoyés —', err.message || err);
      return res.status(500).send('Erreur envoi e-mails');
    }
  }

  return res.status(200).json({ received: true });
};
