import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  PORT: process.env.PORT || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET_KEY || 'super-secret-key-change-in-production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION_HOURS || '24',
};

// Validate required config
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️  Warning: ${envVar} is not set`);
  }
}
