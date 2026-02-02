import { Request, Response } from 'express';
import { getSession, updateSession } from '../services/sessionService';
import {
  createPaymentIntentForSession,
  verifyAndMarkSessionPaid,
} from '../services/paymentService';
import { notifyStatusUpdate } from '../services/websocketService';

export const createPaymentIntentHandler = async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const session = getSession(token as string);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.imagePath) {
      return res.status(400).json({ error: 'No image associated with this session' });
    }

    const { clientSecret, paymentIntentId } = await createPaymentIntentForSession(token as string);

    updateSession(token as string, { status: 'payment_pending' });
    notifyStatusUpdate(token as string, 'payment_pending', 'Waiting for payment');

    return res.status(201).json({
      clientSecret,
      paymentIntentId,
      amount: Number(process.env.STRIPE_AMOUNT_CENTS || 393),
      currency: process.env.STRIPE_CURRENCY || 'usd',
    });
  } catch (error: any) {
    console.error('[Stripe] Error creating payment intent:', error);
    return res.status(500).json({
      error: 'Failed to create payment intent',
      details: error?.message,
    });
  }
};

export const confirmPaymentHandler = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { paymentIntentId } = req.body as { paymentIntentId?: string };

  if (!paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId is required' });
  }

  try {
    const session = getSession(token as string);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const isPaid = await verifyAndMarkSessionPaid(token as string, paymentIntentId);

    if (!isPaid) {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    updateSession(token as string, { status: 'paid' });
    notifyStatusUpdate(token as string, 'paid', 'Payment completed');

    return res.json({
      status: 'paid',
    });
  } catch (error: any) {
    console.error('[Stripe] Error confirming payment:', error);
    return res.status(500).json({
      error: 'Failed to confirm payment',
      details: error?.message,
    });
  }
};


