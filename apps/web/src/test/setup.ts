import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { resetNextNavigationMocks } from './mocks/next-navigation';

vi.mock('next/navigation', async () => import('./mocks/next-navigation'));

beforeEach(() => {
    resetNextNavigationMocks();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});
