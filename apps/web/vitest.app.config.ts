import { mergeConfig } from 'vitest/config';

import { createVitestConfig } from './vitest.shared';

export default mergeConfig(createVitestConfig(), {
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['src/**/*.server.{test,spec}.{ts,tsx}'],
    },
});
