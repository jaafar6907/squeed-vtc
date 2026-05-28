const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { montant, vehicule, depart, destination, date, dateret, mode, pax, description } = data;

    if (!montant || montant <= 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Montant invalide' }) };
    }

    // Description complète avec aller-retour si applicable
    const modeLabel = mode || 'Aller simple';
    const descriptionLine = description || 
      `${modeLabel} | ${depart} → ${destination} | ${vehicule} | ${date}${dateret ? ' | Retour : ' + dateret : ''} | ${pax} passager(s)`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Transfert VTC — Squeed',
            description: descriptionLine,
          },
          unit_amount: Math.round(montant * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: data.email || undefined,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      metadata: {
        mode: modeLabel,
        depart: depart || '',
        destination: destination || '',
        vehicule: vehicule || '',
        date: date || '',
        dateret: dateret || '',
        pax: String(pax || ''),
        prenom: data.prenom || '',
        nom: data.nom || '',
        telephone: data.telephone || '',
      },
      success_url: 'https://squeed.fr/confirmation-paiement/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://squeed.fr/reservation/',
      locale: 'fr',
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
