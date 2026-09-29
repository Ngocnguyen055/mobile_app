import { config as loadEnv } from 'dotenv';
import app from './app.json';

loadEnv({ path: '../../.env' });
export default app.expo;
