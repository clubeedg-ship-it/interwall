import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const sharedDir = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));
const uiDir = fileURLToPath(new URL('../../packages/ui/src', import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': srcDir,
            '@interwall/shared': sharedDir,
            '@interwall/ui': uiDir
        }
    },
    esbuild: {
        jsx: 'automatic'
    },
    test: {
        root: rootDir,
        coverage: {
            exclude: [
                'next-env.d.ts',
                'src/test/**'
            ]
        },
        projects: [
            {
                test: {
                    name: 'app',
                    environment: 'jsdom',
                    setupFiles: ['./src/test/setup.ts'],
                    include: [
                        'src/**/*.{test,spec}.{ts,tsx}',
                        '!src/**/*.server.{test,spec}.{ts,tsx}'
                    ]
                }
            },
            {
                test: {
                    name: 'server',
                    environment: 'node',
                    include: [
                        'src/**/*.server.{test,spec}.ts',
                        'src/**/*.server.{test,spec}.tsx'
                    ]
                }
            }
        ]
    }
});
