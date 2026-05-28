const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = 'reservation@squeed.fr';
const FROM_EMAIL = 'reservation@squeed.fr';

// Génère le PDF en base64 (format simple HTML → texte encodé)
function generatePDFContent(data) {
  const { meta, amount, email } = data;
  const montant = (amount / 100).toFixed(2);
  const dateRetour = meta.dateret ? `\nDate retour       : ${meta.dateret}` : '';

  return `
RÉCAPITULATIF DE RÉSERVATION — SQUEED VTC
==========================================

Client
------
Prénom / Nom      : ${meta.prenom} ${meta.nom}
Email             : ${email}
Téléphone         : ${meta.telephone}

Trajet
------
Mode              : ${meta.mode}
Départ            : ${meta.depart}
Destination       : ${meta.destination}
Date aller        : ${meta.date}${dateRetour}
Passagers         : ${meta.pax}
Véhicule          : ${meta.vehicule}

Paiement
--------
Montant réglé     : ${montant} €
Statut            : Confirmé ✓

==========================================
Squeed VTC — reservation@squeed.fr
==========================================
  `.trim();
}

function emailClientHTML(meta, amount, email) {
  const montant = (amount / 100).toFixed(2);
  const dateRetourLine = meta.dateret
    ? `<tr><td style="padding:6px 12px;color:#666;">Date retour</td><td style="padding:6px 12px;font-weight:600;">${meta.dateret}</td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:2px;">SQUEED VTC</h1>
          <p style="margin:8px 0 0;color:#c9a84c;font-size:13px;letter-spacing:1px;">TRANSFERT DE LUXE</p>
        </td></tr>

        <!-- Confirmation badge -->
        <tr><td style="padding:32px 40px 16px;text-align:center;">
          <div style="display:inline-block;background:#e8f5e9;border-radius:50px;padding:10px 24px;">
            <span style="color:#2e7d32;font-weight:700;font-size:15px;">✓ Réservation confirmée</span>
          </div>
          <h2 style="margin:20px 0 4px;color:#1a1a2e;font-size:20px;">Bonjour ${meta.prenom},</h2>
          <p style="margin:0;color:#666;font-size:15px;">Votre transfert est bien enregistré. Voici le récapitulatif :</p>
        </td></tr>

        <!-- Détails trajet -->
        <tr><td style="padding:16px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;overflow:hidden;">
            <tr style="background:#1a1a2e;">
              <td colspan="2" style="padding:12px 16px;color:#c9a84c;font-size:12px;letter-spacing:1px;font-weight:700;">DÉTAILS DU TRAJET</td>
            </tr>
            <tr><td style="padding:8px 16px;color:#666;font-size:14px;width:45%;">Mode</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">${meta.mode}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;font-size:14px;">Départ</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">📍 ${meta.depart}</td></tr>
            <tr><td style="padding:8px 16px;color:#666;font-size:14px;">Destination</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">🏁 ${meta.destination}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;font-size:14px;">Date aller</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">📅 ${meta.date}</td></tr>
            ${dateRetourLine}
            <tr><td style="padding:8px 16px;color:#666;font-size:14px;">Passagers</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">👥 ${meta.pax}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;font-size:14px;">Véhicule</td><td style="padding:8px 16px;font-weight:600;font-size:14px;">🚗 ${meta.vehicule}</td></tr>
          </table>
        </td></tr>

        <!-- Montant -->
        <tr><td style="padding:16px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;">
            <tr>
              <td style="padding:16px 20px;color:#fff;font-size:15px;">Montant réglé</td>
              <td style="padding:16px 20px;text-align:right;">
                <span style="color:#c9a84c;font-size:22px;font-weight:700;">${montant} €</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Contact -->
        <tr><td style="padding:16px 40px 32px;text-align:center;">
          <p style="color:#666;font-size:13px;margin:0;">Une question ? Contactez-nous :</p>
          <p style="margin:4px 0 0;"><a href="mailto:reservation@squeed.fr" style="color:#1a1a2e;font-weight:700;text-decoration:none;">reservation@squeed.fr</a></p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f0f0f0;padding:16px 40px;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">© 2025 Squeed VTC — Tous droits réservés</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `;
}

function emailAdminHTML(meta, amount, email) {
  const montant = (amount / 100).toFixed(2);
  const dateRetourLine = meta.dateret
    ? `<tr><td style="padding:6px 12px;color:#666;">Date retour</td><td style="padding:6px 12px;font-weight:600;">${meta.dateret}</td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        
        <tr><td style="background:#c0392b;padding:24px 40px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">🚨 Nouvelle réservation reçue</h1>
        </td></tr>

        <tr><td style="padding:24px 40px;">
          <h3 style="margin:0 0 16px;color:#1a1a2e;">Client</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;">
            <tr><td style="padding:8px 16px;color:#666;width:40%;">Nom</td><td style="padding:8px 16px;font-weight:600;">${meta.prenom} ${meta.nom}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;">Email</td><td style="padding:8px 16px;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 16px;color:#666;">Téléphone</td><td style="padding:8px 16px;font-weight:600;">${meta.telephone}</td></tr>
          </table>

          <h3 style="margin:20px 0 16px;color:#1a1a2e;">Trajet</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;">
            <tr><td style="padding:8px 16px;color:#666;width:40%;">Mode</td><td style="padding:8px 16px;font-weight:600;">${meta.mode}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;">Départ</td><td style="padding:8px 16px;font-weight:600;">${meta.depart}</td></tr>
            <tr><td style="padding:8px 16px;color:#666;">Destination</td><td style="padding:8px 16px;font-weight:600;">${meta.destination}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;">Date aller</td><td style="padding:8px 16px;font-weight:600;">${meta.date}</td></tr>
            ${dateRetourLine}
            <tr><td style="padding:8px 16px;color:#666;">Passagers</td><td style="padding:8px 16px;font-weight:600;">${meta.pax}</td></tr>
            <tr style="background:#fff;"><td style="padding:8px 16px;color:#666;">Véhicule</td><td style="padding:8px 16px;font-weight:600;">${meta.vehicule}</td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;margin-top:20px;">
            <tr>
              <td style="padding:16px 20px;color:#fff;">Montant encaissé</td>
              <td style="padding:16px 20px;text-align:right;color:#c9a84c;font-size:22px;font-weight:700;">${montant} €</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="background:#f0f0f0;padding:12px 40px;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">Squeed VTC — Notification automatique</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `;
}

exports.handler = async (event) => {
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'session_id manquant' }) };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const meta = session.metadata || {};
    const amount = session.amount_total;
    const email = session.customer_details && session.customer_details.email;

    // Générer le PDF texte en pièce jointe
    const pdfContent = generatePDFContent({ meta, amount, email });
    const pdfBase64 = Buffer.from(pdfContent, 'utf-8').toString('base64');

    // Envoyer email client
    if (email) {
      await resend.emails.send({
        from: `Squeed VTC <${FROM_EMAIL}>`,
        to: email,
        subject: `✓ Confirmation de votre réservation — ${meta.depart} → ${meta.destination}`,
        html: emailClientHTML(meta, amount, email),
        attachments: [{
          filename: `reservation-squeed-${meta.date || 'vtc'}.txt`,
          content: pdfBase64,
        }],
      });
    }

    // Envoyer email admin
    await resend.emails.send({
      from: `Squeed VTC <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `🚨 Nouvelle réservation — ${meta.prenom} ${meta.nom} | ${meta.depart} → ${meta.destination}`,
      html: emailAdminHTML(meta, amount, email),
      attachments: [{
        filename: `reservation-${meta.prenom}-${meta.nom}-${meta.date || 'vtc'}.txt`,
        content: pdfBase64,
      }],
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: meta,
        amount_total: amount,
        customer_email: email,
      }),
    };

  } catch (err) {
    console.error('Erreur get-session:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
