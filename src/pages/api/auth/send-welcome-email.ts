// API route: Send welcome email after signup
// POST /api/auth/send-welcome-email

async function sendBrevoEmail(params: {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL || 'noreply@betterfitnotes.com',
        name: process.env.BREVO_SENDER_NAME || 'Better Fit Notes',
      },
      to: params.to,
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`BREVO API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

async function sendWelcomeEmail(userEmail: string, userName?: string) {
  const displayName = userName || userEmail.split('@')[0];
  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue dans Better Fit Notes</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 40px 20px; text-align: center; margin-bottom: 30px; color: white;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 600;">👋 Bienvenue, ${displayName}!</h1>
      <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Ton compte Better Fit Notes est prêt!</p>
    </div>

    <!-- Content -->
    <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
      <p style="margin-top: 0; font-size: 16px;">Merci de rejoindre la communauté Better Fit Notes! 🏋️</p>
      
      <p style="font-size: 16px;">Voici ce que tu peux faire:</p>
      
      <ul style="margin: 15px 0; padding-left: 20px;">
        <li style="margin: 8px 0;"><strong>📊 Suivre tes séances</strong> — Enregistre chaque exercice et série</li>
        <li style="margin: 8px 0;"><strong>📈 Analyser tes performances</strong> — Vois ton progrès au fil du temps</li>
        <li style="margin: 8px 0;"><strong>🎯 Gérer tes objectifs</strong> — Crée des templates et des records personnels</li>
        <li style="margin: 8px 0;"><strong>📱 Accès complet offline</strong> — Entraîne-toi sans connexion internet</li>
      </ul>

      <p style="font-size: 16px;">C'est parti! 🚀</p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 30px;">
      <a href="${process.env.APP_URL || 'https://betterfitnotes.com'}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Ouvrir Better Fit Notes
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; color: #666; font-size: 12px;">
      <p style="margin: 5px 0;">Questions? Contacte-nous sur support@betterfitnotes.com</p>
      <p style="margin: 5px 0;">© 2026 Better Fit Notes. Tous droits réservés.</p>
    </div>
  </div>
</body>
</html>`;

  return sendBrevoEmail({
    to: [{ email: userEmail, name: displayName }],
    subject: '👋 Bienvenue dans Better Fit Notes!',
    htmlContent,
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    await sendWelcomeEmail(email, name);
    return res.status(200).json({ message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return res.status(500).json({ 
      message: 'Failed to send welcome email',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
