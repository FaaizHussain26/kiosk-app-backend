import Stripe from 'stripe';
import { getSession, updateSession } from './sessionService';
import dotenv from 'dotenv';
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn(
    '[Stripe] STRIPE_SECRET_KEY is not set. Payment endpoints will fail until this is configured.'
  );
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    })  
  : (null as unknown as Stripe);

// console.log(stripe, stripeSecretKey, "stripe secret key")
const DEFAULT_CURRENCY = process.env.STRIPE_CURRENCY || 'usd';
// Amount in the smallest currency unit (e.g. cents). 3.93 USD -> 393 cents.
const DEFAULT_AMOUNT = Number(process.env.STRIPE_AMOUNT_CENTS || 393);

export interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export const createPaymentIntentForSession = async (
  token: string
): Promise<CreatePaymentIntentResult> => {
  const session = getSession(token);

  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.imagePath) {
    throw new Error('No image associated with this session');
  }

  if (!stripeSecretKey || !stripe) {
    throw new Error('Stripe is not configured');
  }

  const amount = DEFAULT_AMOUNT;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: DEFAULT_CURRENCY,
    metadata: {
      sessionToken: token,
    },
    automatic_payment_methods: {
      enabled: true,
    },
  });

  if (!paymentIntent.client_secret || !paymentIntent.id) {
    throw new Error('Failed to create payment intent');
  }

  // Store payment intent on the session for later verification
  updateSession(token, {
    paymentIntentId: paymentIntent.id,
    paid: false,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
};

export const verifyAndMarkSessionPaid = async (
  token: string,
  paymentIntentId: string
): Promise<boolean> => {
  const session = getSession(token);

  if (!session) {
    throw new Error('Session not found');
  }

  if (!stripeSecretKey || !stripe) {
    throw new Error('Stripe is not configured');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    throw new Error('PaymentIntent not found');
  }

  if (paymentIntent.metadata?.sessionToken !== token) {
    throw new Error('PaymentIntent does not belong to this session');
  }

  const isPaid = paymentIntent.status === 'succeeded';

  if (isPaid) {
    updateSession(token, {
      paid: true,
    });
  }

  return isPaid;
};


