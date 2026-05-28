const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = req.body;
    const { montant, vehicule, depart, destination, date, dateret, mode, pax, horaire, horaireRetour } = data;

    if (!montant || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const modeLabel = mode || 'Aller simple';
    const horaireStr = horaire ? ` | Départ : ${horaire}` : '';
    const horaireRetourStr = horaireRetour ? ` | Retour : ${horaireRetour}` : '';
    const descriptionLine = `${modeLabel} | ${depart} → ${destination} | ${vehicule} | ${date}${horaireStr}${dateret ? ' | Retour : ' + dateret : ''}${horaireRetourStr} | ${pax} passager(s)`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Transfert VTC — Squeed',
            description: descriptionLine
          },
          unit_amount: Math.round(montant * 100)
        },
        quantity: 1
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
        horaire: horaire || '',
        horaireRetour: horaireRetour || '',
        pax: String(pax || ''),
        prenom: data.prenom || '',
        nom: data.nom || '',
        telephone: data.telephone || '',
      },
      success_url: 'https://reservation.squeed.fr/confirmation.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://squeed.fr/reservation/',
      locale: 'fr',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};
