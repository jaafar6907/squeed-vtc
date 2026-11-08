// ============================================================
// api/_emails.js — logique commune des e-mails de réservation
// (le « _ » au début du nom : Vercel ne le publie pas comme une adresse)
// Utilisé par : api/stripe-webhook.js (envoi principal, immédiat)
//               api/get-session.js    (secours, si le webhook n'est pas passé)
// ============================================================
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'reservation@squeed.fr';
const FROM_EMAIL = 'reservation@squeed.fr';

// Les infos viennent du formulaire client : on les "neutralise" avant de les mettre dans un e-mail HTML
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const T = {
  fr: {
    tagline: 'TRANSFERT DE LUXE',
    badge: '✓ Réservation confirmée',
    hello: (p) => `Bonjour ${p},`,
    intro: 'Votre transfert est bien enregistré.',
    details: 'DÉTAILS DU TRAJET',
    mode: 'Mode', depart: 'Départ', destination: 'Destination', date: 'Date aller', heure: 'Heure de prise en charge',
    retour: 'Date retour', heureRetour: 'Heure retour', vol: 'Vol / train', adresse: 'Adresse de dépose',
    equip: 'Équipements', pax: 'Passagers', vehicule: 'Véhicule', paid: 'Montant réglé',
    question: 'Une question ?', subject: (m) => `✓ Confirmation — ${m.depart} → ${m.destination}`,
    recapTitle: 'RÉCAPITULATIF DE RÉSERVATION — SQUEED VTC', client: 'Client', trajet: 'Trajet', paiement: 'Paiement',
    nom: 'Prénom / Nom', tel: 'Téléphone', statut: 'Statut', confirme: 'Confirmé ✓', fichier: 'reservation-squeed.txt',
  },
  en: {
    tagline: 'PRIVATE ALPINE TRANSFERS',
    badge: '✓ Booking confirmed',
    hello: (p) => `Hello ${p},`,
    intro: 'Your transfer is booked. Here are your details.',
    details: 'TRIP DETAILS',
    mode: 'Trip', depart: 'From', destination: 'To', date: 'Date', heure: 'Pick-up time',
    retour: 'Return date', heureRetour: 'Return pick-up time', vol: 'Flight / train', adresse: 'Drop-off address',
    equip: 'Extras', pax: 'Passengers', vehicule: 'Vehicle', paid: 'Amount paid',
    question: 'Any question?', subject: (m) => `✓ Booking confirmed — ${m.depart} → ${m.destination}`,
    recapTitle: 'BOOKING SUMMARY — SQUEED', client: 'Customer', trajet: 'Trip', paiement: 'Payment',
    nom: 'Name', tel: 'Phone', statut: 'Status', confirme: 'Confirmed ✓', fichier: 'squeed-booking.txt',
  },
};

// Lignes du trajet, dans l'ordre, sans les champs vides
function lignesTrajet(meta, t) {
  return [
    [t.mode, meta.mode],
    [t.depart, meta.depart],
    [t.destination, meta.destination],
    [t.date, meta.date],
    [t.heure, meta.horaire],
    [t.retour, meta.dateret],
    [t.heureRetour, meta.horaireRetour],
    [t.vol, meta.vol],
    [t.adresse, meta.adresse],
    [t.equip, meta.equipements],
    [t.pax, meta.pax],
    [t.vehicule, meta.vehicule],
  ].filter(([, v]) => v && String(v).trim() !== '' && v !== 'Non précisé' && v !== 'Not specified');
}

function lignesHTML(lignes) {
  return lignes.map(([label, val], i) =>
    `<tr${i % 2 ? ' style="background:#fff;"' : ''}><td style="padding:8px 16px;color:#666;font-size:14px;width:45%;">${esc(label)}</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">${esc(val)}</td></tr>`
  ).join('');
}

function recapTexte(meta, amount, email, telephone, t) {
  const montant = (amount / 100).toFixed(2);
  const pad = (s) => (s + '                          ').slice(0, 26);
  const trajet = lignesTrajet(meta, t).map(([l, v]) => `${pad(l)}: ${v}`).join('\n');
  return `
${t.recapTitle}
==========================================
${t.client}
------
${pad(t.nom)}: ${meta.prenom} ${meta.nom}
${pad('Email')}: ${email || ''}
${pad(t.tel)}: ${telephone || ''}

${t.trajet}
------
${trajet}

${t.paiement}
--------
${pad(t.paid)}: ${montant} €
${pad(t.statut)}: ${t.confirme}
==========================================
Squeed — reservation@squeed.fr — +33 6 29 39 26 31
==========================================`.trim();
}

function emailClientHTML(meta, amount, lang) {
  const t = T[lang];
  const montant = (amount / 100).toFixed(2);
  const annee = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:2px;">SQUEED</h1><p style="margin:8px 0 0;color:#c9a84c;font-size:13px;">${t.tagline}</p></td></tr><tr><td style="padding:32px 40px 16px;text-align:center;"><div style="display:inline-block;background:#e8f5e9;border-radius:50px;padding:10px 24px;"><span style="color:#2e7d32;font-weight:700;">${t.badge}</span></div><h2 style="margin:20px 0 4px;color:#1a1a2e;">${esc(t.hello(meta.prenom || ''))}</h2><p style="margin:0;color:#666;">${t.intro}</p></td></tr><tr><td style="padding:16px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;overflow:hidden;"><tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 16px;color:#c9a84c;font-size:12px;font-weight:700;">${t.details}</td></tr>${lignesHTML(lignesTrajet(meta, t))}</table></td></tr><tr><td style="padding:16px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;"><tr><td style="padding:16px 20px;color:#fff;">${t.paid}</td><td style="padding:16px 20px;text-align:right;color:#c9a84c;font-size:22px;font-weight:700;">${montant} €</td></tr></table></td></tr><tr><td style="padding:16px 40px 32px;text-align:center;"><p style="color:#666;font-size:13px;margin:0;">${t.question}</p><p style="margin:4px 0 0;"><a href="mailto:reservation@squeed.fr" style="color:#1a1a2e;font-weight:700;">reservation@squeed.fr</a> · <a href="https://wa.me/33629392631" style="color:#1a1a2e;font-weight:700;">WhatsApp +33 6 29 39 26 31</a></p></td></tr><tr><td style="background:#f0f0f0;padding:16px 40px;text-align:center;"><p style="margin:0;color:#999;font-size:12px;">© ${annee} Squeed</p></td></tr></table></td></tr></table></body></html>`;
}

// L'e-mail que TU reçois reste en français, avec toutes les infos
function emailAdminHTML(meta, amount, email, telephone) {
  const t = T.fr;
  const montant = (amount / 100).toFixed(2);
  const client = lignesHTML([
    ['Nom', `${meta.prenom || ''} ${meta.nom || ''}`],
    ['Email', email],
    ['Téléphone', telephone],
    ['Pays', meta.pays],
  ].filter(([, v]) => v && String(v).trim()));
  const site = meta.source === 'ski.squeed.fr' ? '🇬🇧 ski.squeed.fr (client anglophone)' : 'squeed.fr';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#c0392b;padding:24px 40px;"><h1 style="margin:0;color:#fff;font-size:20px;">🚨 Nouvelle réservation reçue</h1><p style="margin:6px 0 0;color:#fde2e2;font-size:13px;">Via ${site}</p></td></tr><tr><td style="padding:24px 40px;"><h3 style="margin:0 0 16px;color:#1a1a2e;">Client</h3><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;">${client}</table><h3 style="margin:20px 0 16px;color:#1a1a2e;">Trajet</h3><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;">${lignesHTML(lignesTrajet(meta, t))}</table><table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;margin-top:20px;"><tr><td style="padding:16px 20px;color:#fff;">Montant encaissé</td><td style="padding:16px 20px;text-align:right;color:#c9a84c;font-size:22px;font-weight:700;">${montant} €</td></tr></table></td></tr></table></td></tr></table></body></html>`;
}


/**
 * Envoie les 2 e-mails (client + admin) d'une session Checkout, une seule fois.
 * options.delaiMinSecondes : n'envoie que si le paiement date d'au moins N secondes
 *   (0 pour le webhook ; 90 pour la page de confirmation, afin de laisser le webhook passer en premier
 *    et d'éviter les doublons quand les deux arrivent en même temps).
 * Renvoie { session, meta, amount, email, statut } où statut = 'envoye' | 'deja_envoye' | 'trop_tot' | 'non_paye'.
 * Lève une erreur si Resend refuse un e-mail (pour que Stripe réessaie le webhook).
 */
async function envoyerEmailsReservation(sessionId, options) {
  options = options || {};
  const delaiMin = options.delaiMinSecondes || 0;

  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
  const meta = session.metadata || {};
  const amount = session.amount_total;
  const email = session.customer_details && session.customer_details.email;
  const telephone = meta.telephone || (session.customer_details && session.customer_details.phone) || '';
  const lang = meta.langue === 'en' ? 'en' : 'fr';
  const base = { session, meta, amount, email };

  if (session.payment_status !== 'paid') return Object.assign(base, { statut: 'non_paye' });

  const pi = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null;
  if (pi && pi.metadata && pi.metadata.emails_envoyes === 'oui') return Object.assign(base, { statut: 'deja_envoye' });

  if (delaiMin > 0) {
    const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const payeLe = charge ? charge.created : session.created;
    if (Date.now() / 1000 - payeLe < delaiMin) return Object.assign(base, { statut: 'trop_tot' });
  }

  // ⚠️ Resend ne « plante » pas en cas de refus : il renvoie { error }. On vérifie chaque envoi.
  const verifier = (r, qui) => {
    if (!r || r.error) throw new Error('Resend a refusé l\'e-mail ' + qui + ' : ' + JSON.stringify(r && r.error));
  };

  if (email) {
    const t = T[lang];
    const rClient = await resend.emails.send({
      from: `Squeed <${FROM_EMAIL}>`,
      to: email,
      reply_to: ADMIN_EMAIL,
      subject: t.subject(meta),
      html: emailClientHTML(meta, amount, lang),
      attachments: [{ filename: t.fichier, content: Buffer.from(recapTexte(meta, amount, email, telephone, t), 'utf-8').toString('base64') }],
    });
    verifier(rClient, 'client');
  }

  const rAdmin = await resend.emails.send({
    from: `Squeed <${FROM_EMAIL}>`,
    to: ADMIN_EMAIL,
    reply_to: email || undefined,
    subject: `🚨 Nouvelle réservation${meta.source === 'ski.squeed.fr' ? ' (SKI 🇬🇧)' : ''} — ${meta.prenom} ${meta.nom} | ${meta.depart} → ${meta.destination}`,
    html: emailAdminHTML(meta, amount, email, telephone),
    attachments: [{ filename: `reservation-${meta.prenom || ''}-${meta.nom || ''}.txt`, content: Buffer.from(recapTexte(meta, amount, email, telephone, T.fr), 'utf-8').toString('base64') }],
  });
  verifier(rAdmin, 'admin');

  // On ne note « envoyé » que si les deux e-mails ont vraiment été acceptés par Resend
  if (pi) await stripe.paymentIntents.update(pi.id, { metadata: { emails_envoyes: 'oui' } });
  return Object.assign(base, { statut: 'envoye' });
}

module.exports = { envoyerEmailsReservation };
