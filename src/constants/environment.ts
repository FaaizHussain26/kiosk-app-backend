import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export const env = process.env.NODE_ENV || 'development';
export const port = process.env.PORT || 5000;