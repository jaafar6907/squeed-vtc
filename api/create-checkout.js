const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Sites autorisés à appeler cette API
const ORIGINES_AUTORISEES = [
  'https://squeed.fr',
  'https://www.squeed.fr',
  'https://ski.squeed.fr',
];

// Stripe limite chaque valeur de metadata à 500 caractères
const meta = (v) => String(v == null ? '' : v).slice(0, 500);

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ORIGINES_AUTORISEES.includes(origin) ? origin : 'https://squeed.fr');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = req.body || {};
    const { vehicule, depart, destination, date, dateret, mode, pax, horaire, horaireRetour } = data;
    const montant = parseFloat(data.montant);

    // D'où vient la réservation ? (ski.squeed.fr envoie source + langue)
    const fromSki = data.source === 'ski.squeed.fr' || origin === 'https://ski.squeed.fr';
    const en = data.langue === 'en' || fromSki;

    if (!montant || montant <= 0) {
      return res.status(400).json({ error: en ? 'Invalid amount' : 'Montant invalide' });
    }

    const modeLabel = mode || (en ? 'One way' : 'Aller simple');
    const horaireStr = horaire ? ` ${horaire}` : '';
    const horaireRetourStr = horaireRetour ? ` ${horaireRetour}` : '';
    const retourLabel = en ? ' | Return: ' : ' | Retour : ';
    const paxLabel = en ? 'passenger(s)' : 'passager(s)';
    const descriptionLine =
      `${modeLabel} | ${depart} → ${destination} | ${vehicule} | ${date}${horaireStr}` +
      `${dateret ? retourLabel + dateret + horaireRetourStr : ''} | ${pax} ${paxLabel}`;

    // Client Stripe : pré-remplit le nom, l'e-mail et le téléphone sur la page de paiement
    const nomComplet = [data.prenom, data.nom].filter(Boolean).join(' ').trim();
    let customerId;
    if (data.email) {
      try {
        const infos = {
          name: nomComplet || undefined,
          phone: (data.telephone || '').trim() || undefined,
          preferred_locales: [en ? 'en' : 'fr'],
        };
        const existants = await stripe.customers.list({ email: data.email, limit: 1 });
        if (existants.data.length) {
          customerId = existants.data[0].id;
          await stripe.customers.update(customerId, infos);
        } else {
          customerId = (await stripe.customers.create({ email: data.email, ...infos })).id;
        }
      } catch (e) {
        console.error('Client Stripe non créé:', e.message);
        customerId = undefined; // on continue quand même avec le simple e-mail
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: en ? 'Private transfer — Squeed' : 'Transfert VTC — Squeed',
            description: ((nomComplet ? nomComplet + ' | ' : '') + descriptionLine).slice(0, 1000),
          },
          unit_amount: Math.round(montant * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      ...(customerId
        ? { customer: customerId, customer_update: { name: 'auto', address: 'auto' } }
        : { customer_email: data.email || undefined }),
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      metadata: {
        mode: meta(modeLabel),
        depart: meta(depart),
        destination: meta(destination),
        vehicule: meta(vehicule),
        date: meta(date),
        dateret: meta(dateret),
        horaire: meta(horaire),
        horaireRetour: meta(horaireRetour),
        pax: meta(pax),
        prenom: meta(data.prenom),
        nom: meta(data.nom),
        telephone: meta(data.telephone),
        // Infos envoyées par le formulaire mais qui n'étaient pas enregistrées avant
        vol: meta(data.vol),
        adresse: meta(data.adresse),
        equipements: meta(data.equipements),
        pays: meta(data.pays),
        langue: en ? 'en' : 'fr',
        source: fromSki ? 'ski.squeed.fr' : 'squeed.fr',
      },
      success_url: `https://reservation.squeed.fr/confirmation.html?session_id={CHECKOUT_SESSION_ID}&lang=${en ? 'en' : 'fr'}`,
      cancel_url: fromSki ? 'https://ski.squeed.fr/book/' : 'https://squeed.fr/reservation/',
      locale: en ? 'en' : 'fr',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};
