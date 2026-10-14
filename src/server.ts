import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, (error) => {
  if (error) {
    throw error;
  }
  console.log(`[${env.NODE_ENV}] 서버 실행 중 → http://localhost:${env.PORT}/health`);
});
