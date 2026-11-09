const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Sites autorisés à appeler cette API
const ORIGINES_AUTORISEES = [
  'https://squeed.fr',
  'https://www.squeed.fr',
  'https://ski.squeed.fr',
];


// ============================================================
// TARIFS — lus dans tarifs.csv et regles.csv (racine du dépôt GitHub).
// Pour changer un prix : modifier tarifs.csv, c'est tout (les 2 sites suivent automatiquement).
// Le prix est recalculé ICI : le montant envoyé par le navigateur n'est jamais utilisé tel quel.
// ============================================================
const { chargerTarifs } = require('./_tarifs');
const DEST_SKI = ['courchevel','meribel','valthorens','menuires','tignes','valdisere','lesarcs','laplagne','rosiere','valmorel','megeve','chamonix','alpedhuez','deuxalpes','serrechevalier'];

// Nombre max de passagers par véhicule (index du tableau de prix)
const MAX_PAX = { 0: 3, 1: 7, 2: 7, 3: 8, 4: 50 };

// Prix d'UN trajet (aller simple) à une date donnée :
// samedi = colonne « samedi » (+ majoration les samedis de vacances, vers les stations) ; autres jours = colonne « semaine »
function prixTrajet(ligne, veh, dateISO, dest, R) {
  const samedi = new Date(dateISO + 'T12:00:00Z').getUTCDay() === 6;
  let p = (samedi ? ligne.sa : ligne.s)[veh];
  if (!p) return null;
  if (samedi) {
    const S = R.saison || {};
    if (R.majo && R.samedis.includes(dateISO) && DEST_SKI.includes(dest)) p = p * (1 + R.majo / 100);          // samedis de vacances
    else if (S.pct && S.debut && S.fin && dateISO >= S.debut && dateISO <= S.fin) p = p * (1 + S.pct / 100); // samedis de haute saison
  }
  return Math.round(p * 100) / 100; // arrondi au centime
}

// Renvoie { total } ou { erreur }
function calculerPrix(calc) {
  if (!calc || typeof calc !== 'object') return { erreur: 'calc_manquant' };
  const T = chargerTarifs();
  const PRIX = T.prix, R = T.regles, SUPPLEMENTS = R.supplements;
  const { dep, dest, date, retour } = calc;
  const veh = parseInt(calc.veh, 10);
  const pax = parseInt(calc.pax, 10) || 1;

  if (!PRIX[dep] || !PRIX[dep][dest]) return { erreur: 'trajet_sur_devis' };
  const ligne = PRIX[dep][dest];
  if (!(veh in MAX_PAX)) return { erreur: 'vehicule_inconnu' };
  if (pax < 1 || pax > MAX_PAX[veh]) return { erreur: 'trop_de_passagers' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { erreur: 'date_invalide' };

  // Pas de réservation dans le passé (1 jour de marge pour les fuseaux horaires)
  const hier = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (date < hier) return { erreur: 'date_passee' };

  const aller = prixTrajet(ligne, veh, date, dest, R);
  if (aller === null) return { erreur: 'trajet_sur_devis' };
  let base = aller;
  if (retour) {
    // Le retour est calculé à SA date (samedi ou semaine) ; sans date de retour, on prend celle de l'aller
    const dateRet = /^\d{4}-\d{2}-\d{2}$/.test(calc.dateret || '') ? calc.dateret : date;
    const ret = prixTrajet(ligne, veh, dateRet, dest, R);
    if (ret === null) return { erreur: 'trajet_sur_devis' };
    base += ret;
  }

  const extras = Array.isArray(calc.extras) ? calc.extras : [];
  const vus = new Set();
  let suppl = 0;
  for (const i of extras) {
    const n = parseInt(i, 10);
    if (n >= 0 && n < SUPPLEMENTS.length && !vus.has(n)) { vus.add(n); suppl += SUPPLEMENTS[n]; }
  }
  return { total: Math.round((base + suppl) * 100) / 100 };
}

const MESSAGES = {
  fr: {
    calc_manquant: 'Formulaire obsolète : rechargez la page (Cmd+R / Ctrl+R) puis réessayez.',
    trajet_sur_devis: 'Ce trajet est sur devis : contactez-nous par WhatsApp ou par e-mail.',
    vehicule_inconnu: 'Véhicule invalide : rechargez la page puis réessayez.',
    trop_de_passagers: 'Trop de passagers pour ce véhicule : choisissez un véhicule plus grand.',
    date_invalide: 'Date invalide : vérifiez la date de départ.',
    date_passee: 'La date de départ est passée : choisissez une autre date.',
    prix_change: 'Le prix a été mis à jour : rechargez la page pour voir le tarif exact.',
  },
  en: {
    calc_manquant: 'This page is out of date: please reload it (Cmd+R / Ctrl+R) and try again.',
    trajet_sur_devis: 'This route is on quote: please contact us on WhatsApp or by email.',
    vehicule_inconnu: 'Invalid vehicle: please reload the page and try again.',
    trop_de_passagers: 'Too many passengers for this vehicle: please choose a larger one.',
    date_invalide: 'Invalid date: please check your outbound date.',
    date_passee: 'This date is in the past: please choose another date.',
    prix_change: 'The price has been updated: please reload the page to see the exact fare.',
  },
};

// Stripe limite chaque valeur de metadata à 500 caractères
const meta = (v) => String(v == null ? '' : v).slice(0, 500);

async function handler(req, res) {
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

    // D'où vient la réservation ? (ski.squeed.fr envoie source + langue)
    const fromSki = data.source === 'ski.squeed.fr' || origin === 'https://ski.squeed.fr';
    const en = data.langue === 'en' || fromSki;
    const M = MESSAGES[en ? 'en' : 'fr'];

    // 🔒 Prix recalculé par le serveur
    const calcul = calculerPrix(data.calc);
    if (calcul.erreur) {
      console.warn('Prix refusé:', calcul.erreur, JSON.stringify(data.calc));
      return res.status(400).json({ error: M[calcul.erreur] });
    }
    const montant = calcul.total;

    // Si le navigateur affichait un autre prix, on ne fait pas payer une surprise au client
    const montantAffiche = parseFloat(data.montant);
    if (!(Math.abs(montantAffiche - montant) < 0.01)) {
      console.warn('Écart de prix:', { affiche: montantAffiche, serveur: montant, calc: data.calc });
      return res.status(409).json({ error: M.prix_change });
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
        prix_verifie: 'oui',
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

module.exports = handler;
module.exports.calculerPrix = calculerPrix; // utilisé pour les tests
