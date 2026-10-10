/**
 * scripts/generate-config.js
 * Generates public/js/firebase-config.js from environment variables or .env file.
 * Zero external dependencies (uses built-in node fs and path).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const outputPath = path.join(rootDir, 'public', 'js', 'firebase-config.js');

function parseEnv(content) {
  const env = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

let fileEnv = {};
if (fs.existsSync(envPath)) {
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    fileEnv = parseEnv(raw);
  } catch (err) {
    console.warn('[config] Warning: Could not read .env file:', err.message);
  }
}

const config = {
  apiKey: process.env.FIREBASE_API_KEY || fileEnv.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || fileEnv.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || fileEnv.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || fileEnv.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || fileEnv.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || fileEnv.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || fileEnv.FIREBASE_MEASUREMENT_ID || ''
};

const jsContent = `// Auto-generated from .env. Do NOT commit this file to git.
export const firebaseConfig = ${JSON.stringify(config, null, 2)};
`;

fs.writeFileSync(outputPath, jsContent, 'utf-8');
console.log(`[config] Successfully generated ${outputPath}`);
