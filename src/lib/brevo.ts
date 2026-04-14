// ─── Brevo Email Service ──────────────────────────────────────────────────────

/**
 * Send email via Brevo API
 * Requires env vars: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
 */
export async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
}: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL || 'noreply@betterfitness.app',
        name: process.env.BREVO_SENDER_NAME || 'Better Fit Notes',
      },
      to,
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${errorText}`);
  }

  return res.json();
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(userEmail: string, userName?: string) {
  const displayName = userName || userEmail.split('@')[0];

  const htmlContent = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #4F7FFA 0%, #3A65D4 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
      .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
      .header p { margin: 10px 0 0; opacity: 0.9; }
      .content { background: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
      .content h2 { color: #4F7FFA; margin-top: 0; }
      .features { list-style: none; padding: 0; margin: 20px 0; }
      .features li { padding: 10px 0; padding-left: 30px; position: relative; }
      .features li:before { content: "✓"; position: absolute; left: 0; color: #52B788; font-weight: bold; }
      .cta-button { display: inline-block; background: #4F7FFA; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
      .footer { text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
      .divider { height: 1px; background: #ddd; margin: 30px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🏋️ Bienvenue dans Better Fit Notes!</h1>
        <p>Ton compagnon de fitness personnalisé</p>
      </div>

      <div class="content">
        <h2>Salut ${displayName}! 👋</h2>
        <p>Merci de t'être inscrit à <strong>Better Fit Notes</strong>. Tu as maintenant accès à un suivi complet de tes séances d'entraînement et de tes performances.</p>

        <h3>Voici ce que tu peux faire:</h3>
        <ul class="features">
          <li>📅 <strong>Suivre tes séances</strong> - Enregistre chaque exercice, poids, reps</li>
          <li>📊 <strong>Visualiser tes progrès</strong> - Graphiques et statistiques détaillés</li>
          <li>🏆 <strong>Tracker tes records personnels</strong> - Max weight, volume, reps</li>
          <li>📱 <strong>Accès offline</strong> - Continue même sans connexion internet</li>
          <li>📋 <strong>Templates de séances</strong> - Sauvegarde et réutilise tes routines</li>
        </ul>

        <p style="margin-top: 30px;">
          <a href="${process.env.APP_URL || 'https://betterfitness.app'}/auth" class="cta-button">Commencer maintenant</a>
        </p>

        <div class="divider"></div>

        <h3>Besoin d'aide?</h3>
        <p>Consulte notre <a href="${process.env.APP_URL || 'https://betterfitness.app'}/help" style="color: #4F7FFA; text-decoration: none;">documentation</a> ou <a href="mailto:support@betterfitness.app" style="color: #4F7FFA; text-decoration: none;">contacte-nous</a>.</p>
      </div>

      <div class="footer">
        <p>© ${new Date().getFullYear()} Better Fit Notes. Tous droits réservés.</p>
        <p>Tu as reçu cet email car tu viens de créer un compte avec nous.</p>
      </div>
    </div>
  </body>
</html>
  `.trim();

  return sendBrevoEmail({
    to: [{ email: userEmail, name: displayName }],
    subject: '👋 Bienvenue dans Better Fit Notes!',
    htmlContent,
  });
}


