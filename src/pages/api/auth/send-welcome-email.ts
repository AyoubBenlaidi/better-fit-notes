// API route: Send welcome email after signup
// POST /api/auth/send-welcome-email

import { sendWelcomeEmail } from '@/lib/brevo';

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
