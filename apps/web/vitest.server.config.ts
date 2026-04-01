import { mergeConfig } from 'vitest/config';

import { createVitestConfig } from './vitest.shared';

export default mergeConfig(createVitestConfig(), {
    test: {
        environment: 'node',
        include: [
            'src/lib/server/**/*.test.ts',
            'src/lib/server/**/*.test.tsx',
            'src/**/*.server.{test,spec}.ts',
            'src/**/*.server.{test,spec}.tsx',
        ],
    },
});
