const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Sites autorisés à appeler cette API
const ORIGINES_AUTORISEES = [
  'https://squeed.fr',
  'https://www.squeed.fr',
  'https://ski.squeed.fr',
];


// ============================================================
// TARIFS — le prix est recalculé ICI, le montant du navigateur
// n'est plus jamais utilisé tel quel.
// ⚠️ Si tu changes un prix, change-le aussi dans les 2 formulaires
//    (squeed.fr/reservation et ski.squeed.fr/book).
// Ordre des véhicules : [Berline, Van Éco, V-Class, Vito, Sprinter]
// ============================================================
const PRIX = {
  LYS: {
    lyon_ville:[70,85,110,95,255],vienne:[110,130,150,170,345],saint_etienne:[153,180,207,220,475],
    bourg_en_bresse:[153,180,207,220,475],chambery_ville:[196,230,264,270,605],grenoble_ville:[212,250,288,290,660],
    valence:[255,300,345,340,795],annecy:[255,300,345,340,795],roanne:[255,300,345,340,795],
    geneve_ville:[340,400,460,440,1060],geneve_airport:[280,330,400,350,920],dijon:[450,530,610,570,1405],
    marseille_ville:[650,750,1000,900,1950],paris_ville:[850,1000,1350,1200,2900],paris_cdg:[850,1000,1350,1200,2900],
    st_tropez:[1020,1200,1380,1240,3175],cannes_ville:[1062,1250,1438,1290,3305],
    courchevel:[360,425,490,470,1125],meribel:[360,425,490,470,1125],valmorel:[323,380,437,420,1005],
    valthorens:[360,425,490,465,1125],menuires:[360,425,490,465,1125],chamonix:[330,390,450,430,1035],
    tignes:[370,435,500,475,1150],valdisere:[405,480,550,525,1265],lesarcs:[360,425,490,465,1125],
    rosiere:[355,418,481,458,1105],laplagne:[355,418,481,458,1105],megeve:[365,395,470,420,1080],
    alpedhuez:[330,390,450,440,1035],deuxalpes:[330,390,450,440,1035],serrechevalier:[400,450,530,490,1220]
  },
  PARTDIEU: {
    lyon_ville:[35,50,70,60,160],vienne:[72,85,98,102,225],saint_etienne:[128,150,172,180,395],
    bourg_en_bresse:[170,200,230,240,530],chambery_ville:[212,250,288,300,660],grenoble_ville:[212,250,288,300,660],
    valence:[212,250,288,300,660],roanne:[212,250,288,300,660],annecy:[298,350,402,420,925],
    geneve_ville:[298,350,402,420,925],dijon:[425,500,575,600,1320],marseille_ville:[650,750,1000,900,1950],
    paris_ville:[850,1000,1350,1200,2900],paris_cdg:[850,1000,1350,1200,2900],
    st_tropez:[850,1000,1150,1200,2645],cannes_ville:[1020,1200,1380,1440,3175],
    courchevel:[360,425,490,470,1125],meribel:[360,425,490,470,1125],valmorel:[323,380,437,420,1005],
    valthorens:[360,425,490,465,1125],menuires:[360,425,490,465,1125],chamonix:[330,390,450,430,1035],
    tignes:[370,435,500,475,1150],valdisere:[405,480,550,525,1265],lesarcs:[360,425,490,465,1125],
    rosiere:[355,418,481,458,1105],laplagne:[355,418,481,458,1105],megeve:[365,395,470,420,1080],
    alpedhuez:[330,390,450,440,1035],deuxalpes:[330,390,450,440,1035],serrechevalier:[400,450,530,490,1220]
  },
  GVA: {
    lyon_ville:[300,350,430,390,990],geneve_airport:[250,280,330,320,760],paris_ville:[1012,1200,1388,1240,3190],paris_cdg:[1012,1200,1388,1240,3190],
    courchevel:[375,415,490,450,1125],meribel:[385,425,500,460,1150],valthorens:[385,425,500,460,1150],
    menuires:[385,425,500,460,1150],tignes:[430,470,550,510,1265],valdisere:[430,470,550,510,1265],
    lesarcs:[415,455,530,490,1220],laplagne:[430,470,550,510,1265],rosiere:[430,470,550,510,1265],
    valmorel:[430,470,550,510,1265],alpedhuez:[435,475,550,510,1265],deuxalpes:[450,490,570,530,1310],
    megeve:[215,255,330,275,760],chamonix:[195,230,300,250,690]
  },
  GNB_AIR: {
    courchevel:[323,380,437,420,1005],meribel:[360,425,490,470,1125],valmorel:[323,380,437,420,1005],
    valthorens:[360,425,490,465,1125],menuires:[360,425,490,465,1125],chamonix:[355,418,481,458,1105],
    tignes:[370,435,500,475,1150],valdisere:[405,480,550,525,1265],lesarcs:[360,425,490,465,1125],
    rosiere:[355,418,481,458,1105],laplagne:[355,418,481,458,1105],megeve:[350,380,450,400,1035],
    alpedhuez:[310,335,390,370,895],deuxalpes:[310,335,390,370,895],serrechevalier:[350,400,480,440,1105]
  },
  CMF_AIR: {
    courchevel:[305,325,380,360,875],meribel:[310,335,390,370,895],valthorens:[310,335,390,370,895],
    menuires:[310,335,390,370,895],alpedhuez:[310,335,390,370,895],valmorel:[280,300,350,330,805],
    tignes:[310,335,390,370,895],valdisere:[345,370,430,405,990],lesarcs:[310,335,390,370,895],
    laplagne:[336,360,420,396,965],rosiere:[336,360,420,396,965],megeve:[230,270,350,290,805],chamonix:[230,270,350,290,805]
  }
};
PRIX.GNB_TRAIN = PRIX.GNB_AIR;   // mêmes tarifs que l'aéroport
PRIX.CMF_TRAIN = PRIX.CMF_AIR;

// Samedis de vacances d'hiver 2027 : forte demande, +20 %
const SAMEDIS_MAJO = ['2027-02-06','2027-02-13','2027-02-20','2027-02-27','2027-03-06'];
const DEST_SKI = ['courchevel','meribel','valthorens','menuires','tignes','valdisere','lesarcs','laplagne','rosiere','valmorel','megeve','chamonix','alpedhuez','deuxalpes','serrechevalier'];

// Nombre max de passagers par véhicule (index du tableau de prix)
const MAX_PAX = { 0: 3, 1: 7, 2: 7, 3: 8, 4: 50 };

// Suppléments, dans l'ordre des cases du formulaire :
// réhausseur, siège enfant, siège bébé, support ski, vélo, fauteuil roulant
const SUPPLEMENTS = [0, 0, 5, 20, 18, 0];

function tauxMajo(dateISO, dest) {
  const jour = new Date(dateISO + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
  if (SAMEDIS_MAJO.includes(dateISO)) return 0.20;
  if (DEST_SKI.includes(dest) && jour >= 1 && jour <= 5) return -0.15;
  if (DEST_SKI.includes(dest) && jour === 0) return -0.15;
  return 0;
}

// Renvoie { total } ou { erreur }
function calculerPrix(calc) {
  if (!calc || typeof calc !== 'object') return { erreur: 'calc_manquant' };
  const { dep, dest, date, retour } = calc;
  const veh = parseInt(calc.veh, 10);
  const pax = parseInt(calc.pax, 10) || 1;

  if (!PRIX[dep] || !PRIX[dep][dest]) return { erreur: 'trajet_sur_devis' };
  const ligne = PRIX[dep][dest];
  if (!(veh in MAX_PAX) || !ligne[veh]) return { erreur: 'vehicule_inconnu' };
  if (pax < 1 || pax > MAX_PAX[veh]) return { erreur: 'trop_de_passagers' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { erreur: 'date_invalide' };

  // Pas de réservation dans le passé (1 jour de marge pour les fuseaux horaires)
  const hier = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (date < hier) return { erreur: 'date_passee' };

  let p = ligne[veh];
  const t = tauxMajo(date, dest);
  if (t !== 0) p = Math.round(p * (1 + t));
  const base = retour ? p * 2 : p;

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
