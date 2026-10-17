import { configDefaults, defineConfig } from 'vitest/config';

// npm test: DB 없이 도는 테스트만. (실제 MySQL이 필요한 tests/db/ 는 npm run test:db)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/db/**'],
  },
});
