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
const MAX_PAX = { 0: 3, 1: 7, 2: 7, 3: 8, 4: 50, 5: 16, 6: 15, 7: 21, 8: 14 }; // 5 = 2 vans éco ; 6 = 2 vans Mercedes ; 7 = 3 V-Class ; 8 = 2 V-Class

// Prix d'UN trajet (aller simple) à une date donnée :
// samedi = colonne « samedi » (+ majoration les samedis de vacances, vers les stations) ; autres jours = colonne « semaine »
function groupeVclass(R, dep, dest) {
  return (R.groupesVclass || []).find((x) => (!x.departs.length || x.departs.includes(dep)) && (!x.dests.length || x.dests.includes(dest)));
}

// Montant fixe ajouté un jour précis (regles.csv, lignes ajout_jour) : une seule fois par trajet, même à 2 ou 3 véhicules
function ajoutJour(R, dateISO, dest, dep) {
  return (R.ajouts || []).filter((x) => x.date === dateISO && (!x.dests.length || x.dests.includes(dest)) && (!x.departs.length || x.departs.includes(dep))).reduce((s, x) => s + x.eur, 0);
}
function prixTrajet(ligne, veh, dateISO, dest, R, dep) {
  var SD = false;
  // Jours « sur devis » (regles.csv, lignes sur_devis_jour) : pas de réservation en ligne ce jour-là
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateISO || '')) {
    const p = dateISO.split('-'), jour = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
    // un jour (samedi), une date (2027-03-20) ou une période (2027-03-20..2027-03-27)
    const touche = (j) => j === jour || j === dateISO || (j.includes('..') && dateISO >= j.split('..')[0] && dateISO <= j.split('..')[1]);
    var SD = (R.surDevis || []).some((x) => x.jours.some(touche) && (!x.departs.length || x.departs.includes(dep)) && (!x.dests.length || x.dests.includes(dest)));
  }
  // Options de groupe :
  //  6 = « 2 vans Mercedes » (9-15 pers.) sur les trajets SANS règle groupe_vclass : 2 × V-Class du trajet
  //  8 = « 2 V-Class » (9-14 pers.) et 7 = « 3 V-Class » (15-21 pers.) sur les trajets AVEC règle groupe_vclass
  //  Prix par V-Class : celui de la règle s'il est indiqué, sinon le prix V-Class du trajet (tarifs.csv)
  if (veh === 6 || veh === 7 || veh === 8) {
    const G = groupeVclass(R, dep, dest);
    if (veh === 6 && G) return null;
    if ((veh === 7 || veh === 8) && !G) return null;
    const lv = { s: ligne.s.slice(), sa: ligne.sa.slice() };
    if (G && G.s) { lv.s[2] = G.s; lv.sa[2] = G.sa || G.s; }
    else if (G && G.sa) lv.sa[2] = G.sa;
    const un = prixTrajet(lv, 2, dateISO, dest, R, dep);
    const aj = ajoutJour(R, dateISO, dest, dep);
    return un === null ? null : Math.round(((un - aj) * (veh === 7 ? 3 : 2) + aj) * 100) / 100;
  }
  // 2 vans économiques : toujours 2 × le prix du Van Éco (mêmes règles du jour) ; pas proposé là où il y a des V-Class de groupe
  if (veh === 5 && groupeVclass(R, dep, dest)) return null;
  if (veh === 5) {
    const un = prixTrajet(ligne, 1, dateISO, dest, R, dep);
    const aj = ajoutJour(R, dateISO, dest, dep);
    return un === null ? null : Math.round(((un - aj) * 2 + aj) * 100) / 100;
  }
  // Pas de berline les samedis vers la montagne pendant la période indiquée dans regles.csv
  const SB = R.sansBerline || {};
  if (veh === 0 && SB.debut && SB.fin && dateISO >= SB.debut && dateISO <= SB.fin
      && new Date(dateISO + 'T12:00:00Z').getUTCDay() === 6 && DEST_SKI.includes(dest)) return null;
  // Prix fixé pour un jour précis (regles.csv, lignes prix_jour) : il remplace tout le reste ce jour-là
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const jour = JOURS[new Date(dateISO + 'T12:00:00Z').getUTCDay()];
  const ok = (x) => (!x.departs.length || x.departs.includes(dep)) && (!x.dests.length || x.dests.includes(dest)) && x.prix[veh];
  const enPeriode = (x) => x.date.includes('..') && dateISO >= x.date.split('..')[0] && dateISO <= x.date.split('..')[1];
  const PJ = (R.prixJour || []).find((x) => x.date === dateISO && ok(x)) || (R.prixJour || []).find((x) => enPeriode(x) && ok(x)) || (R.prixJour || []).find((x) => x.date === jour && ok(x));
  // Jour « sur devis » : seulement si aucun prix du jour n'est fixé pour ce véhicule
  if (!PJ && SD) return null;
  // Montant fixe ajouté ce jour-là (regles.csv, lignes ajout_jour), par véhicule et par trajet
  const AJ = ajoutJour(R, dateISO, dest, dep);
  if (PJ) return Math.round((PJ.prix[veh] + AJ) * 100) / 100;
  const samedi = new Date(dateISO + 'T12:00:00Z').getUTCDay() === 6;
  let p = (samedi ? ligne.sa : ligne.s)[veh];
  if (!p) return null;
  // Remise d'un jour précis (regles.csv, lignes remise_jour) : remplace les majorations ce jour-là
  const RM = (R.remises || []).find((x) => x.date === dateISO && (!x.dests.length || x.dests.includes(dest)) && (!x.departs.length || x.departs.includes(dep)));
  if (RM) p = p * (1 + RM.pct / 100);
  else if (samedi) {
    const S = R.saison || {};
    if (R.majo && R.samedis.includes(dateISO) && DEST_SKI.includes(dest)) p = p * (1 + R.majo / 100);          // samedis de vacances
    else if (S.pct && S.debut && S.fin && dateISO >= S.debut && dateISO <= S.fin) p = p * (1 + S.pct / 100); // samedis de haute saison
  }
  return Math.round((p + AJ) * 100) / 100; // arrondi au centime
}

// Mise à disposition d'un chauffeur (page « chauffeur à disposition ») :
// calc = { type:'dispo', veh:'vclass'|'velar', formule:'heures'|'journee', heures, date, datefin (facultatif, plusieurs jours), pax }
function calculerDispo(calc, D) {
  const veh = calc.veh, formule = calc.formule;
  const heures = parseInt(calc.heures, 10);
  const pax = parseInt(calc.pax, 10) || 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calc.date || '')) return { erreur: 'date_invalide' };
  const hier = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (calc.date < hier) return { erreur: 'date_passee' };
  // Plusieurs jours : du premier au dernier jour inclus (30 jours maximum)
  let jours = 1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(calc.datefin || '') && calc.datefin > calc.date) {
    jours = Math.round((Date.parse(calc.datefin) - Date.parse(calc.date)) / 864e5) + 1;
    if (jours > 30) return { erreur: 'dispo_invalide' };
  }
  const r = calculerDispoJour(veh, formule, heures, pax, D);
  return r.total ? { total: Math.round(r.total * jours * 100) / 100 } : r;
}
function calculerDispoJour(veh, formule, heures, pax, D) {
  if (veh === 'vclass') {
    if (pax < 1 || pax > 7) return { erreur: 'trop_de_passagers' };
    if (formule === 'journee') return { total: D.vclass_journee };
    if (formule === 'heures' && heures >= D.heures_min && heures < D.heures_max) return { total: heures * D.vclass_heure };
  } else if (veh === 'velar') {
    if (pax < 1 || pax > 3) return { erreur: 'trop_de_passagers' };
    if (formule === 'heures' && heures >= D.heures_min && heures <= D.heures_max) return { total: heures * D.velar_heure };
  }
  return { erreur: 'dispo_invalide' };
}

// Renvoie { total } ou { erreur }
function calculerPrix(calc) {
  if (!calc || typeof calc !== 'object') return { erreur: 'calc_manquant' };
  if (calc.type === 'dispo') return calculerDispo(calc, chargerTarifs().regles.dispo);
  const T = chargerTarifs();
  const PRIX = T.prix, R = T.regles, SUPPLEMENTS = R.supplements;
  const { dep, dest, date, retour } = calc;
  const veh = parseInt(calc.veh, 10);
  const pax = parseInt(calc.pax, 10) || 1;

  if (!PRIX[dep] || !PRIX[dep][dest]) return { erreur: 'trajet_sur_devis' };
  const ligne = PRIX[dep][dest];
  if (!(veh in MAX_PAX)) return { erreur: 'vehicule_inconnu' };
  if (veh === 0) return { erreur: 'vehicule_inconnu' }; // berline retirée de la flotte
  if (pax < 1 || pax > MAX_PAX[veh]) return { erreur: 'trop_de_passagers' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { erreur: 'date_invalide' };

  // Pas de réservation dans le passé (1 jour de marge pour les fuseaux horaires)
  const hier = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (date < hier) return { erreur: 'date_passee' };

  const aller = prixTrajet(ligne, veh, date, dest, R, dep);
  if (aller === null) return { erreur: 'trajet_sur_devis' };
  // Créneau horaire imposé certains jours (regles.csv, lignes horaire_jour), ex. retours du festival entre 00:00 et 04:00
  const heureOk = (d, a, jour, h) => {
    const regle = (R.horaires || []).find((x) => (x.date === jour || (x.date.includes('..') && jour >= x.date.split('..')[0] && jour <= x.date.split('..')[1]))
      && (!x.departs.length || x.departs.includes(d)) && (!x.dests.length || x.dests.includes(a)));
    if (!regle) return true;
    const t = String(h || '').replace('h', ':');
    return /^\d{2}:\d{2}$/.test(t) && t >= regle.de && t <= regle.a;
  };
  if (!heureOk(dep, dest, date, calc.heure)) return { erreur: 'horaire_hors_creneau' };
  let base = aller;
  if (retour) {
    // Le retour est calculé à SA date (samedi ou semaine) ; sans date de retour, on prend celle de l'aller
    const dateRet = /^\d{4}-\d{2}-\d{2}$/.test(calc.dateret || '') ? calc.dateret : date;
    if (dateRet < date) return { erreur: 'date_retour_invalide' }; // retour avant l'aller : refusé
    // Trajet retour avec son propre tarif s'il existe (ex. ALPEDHUEZ;oisans pour le retour de OISANS;alpedhuez), sinon le même trajet
    const rDep = String(dest).toUpperCase(), rDest = String(dep).toLowerCase();
    const inverse = PRIX[rDep] && PRIX[rDep][rDest];
    const ret = inverse ? prixTrajet(PRIX[rDep][rDest], veh, dateRet, rDest, R, rDep) : prixTrajet(ligne, veh, dateRet, dest, R, dep);
    if (ret === null) return { erreur: 'trajet_sur_devis' };
    if (!(inverse ? heureOk(rDep, rDest, dateRet, calc.heureRet) : heureOk(dep, dest, dateRet, calc.heureRet))) return { erreur: 'horaire_hors_creneau' };
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
    horaire_hors_creneau: 'Cet horaire n\'est pas réservable en ligne pour ce trajet : choisissez un horaire dans le créneau indiqué ou contactez-nous.',
    vehicule_inconnu: 'Véhicule invalide : rechargez la page puis réessayez.',
    trop_de_passagers: 'Trop de passagers pour ce véhicule : choisissez un véhicule plus grand.',
    date_invalide: 'Date invalide : vérifiez la date de départ.',
    date_passee: 'La date de départ est passée : choisissez une autre date.',
    date_retour_invalide: 'La date de retour est avant la date de l\'aller : vérifiez vos dates.',
    prix_change: 'Le prix a été mis à jour : rechargez la page pour voir le tarif exact.',
    dispo_invalide: 'Durée de mise à disposition invalide : vérifiez le nombre d\'heures.',
  },
  en: {
    calc_manquant: 'This page is out of date: please reload it (Cmd+R / Ctrl+R) and try again.',
    trajet_sur_devis: 'This route is on quote: please contact us on WhatsApp or by email.',
    horaire_hors_creneau: 'This pick-up time cannot be booked online for this route: choose a time within the indicated slot or contact us.',
    vehicule_inconnu: 'Invalid vehicle: please reload the page and try again.',
    trop_de_passagers: 'Too many passengers for this vehicle: please choose a larger one.',
    date_invalide: 'Invalid date: please check your outbound date.',
    date_passee: 'This date is in the past: please choose another date.',
    date_retour_invalide: 'Your return date is before your outbound date: please check your dates.',
    prix_change: 'The price has been updated: please reload the page to see the exact fare.',
    dispo_invalide: 'Invalid number of hours: please check your booking duration.',
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
      cancel_url: /^https:\/\/(ski\.|www\.)?squeed\.fr\//.test(data.pageRetour || '') ? String(data.pageRetour).slice(0, 300)
        : (fromSki ? 'https://ski.squeed.fr/book/' : 'https://squeed.fr/reservation/'),
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
