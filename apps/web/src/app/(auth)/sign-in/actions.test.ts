import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async () => import('@/test/mocks/next-navigation'));

import { signInWithPassword } from './actions';

const {
    mockCreateServerSupabaseClient,
    mockSignInWithPassword,
} = vi.hoisted(() => ({
    mockCreateServerSupabaseClient: vi.fn(),
    mockSignInWithPassword: vi.fn(),
}));

vi.mock('@/lib/server/supabase', () => ({
    createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

describe('signInWithPassword', () => {
    beforeEach(() => {
        mockSignInWithPassword.mockReset();
        mockCreateServerSupabaseClient.mockReset();
        mockCreateServerSupabaseClient.mockReturnValue({
            auth: {
                signInWithPassword: mockSignInWithPassword,
            },
        });
    });

    it('submitting valid credentials signs the user in and redirects into the protected flow', async () => {
        mockSignInWithPassword.mockResolvedValue({
            data: {
                session: { access_token: 'token' },
                user: { id: 'user-1', email: 'owner@example.com' },
            },
            error: null,
        });

        const formData = new FormData();
        formData.set('email', 'owner@example.com');
        formData.set('password', 'secret123');

        await expect(
            signInWithPassword({ error: null }, formData),
        ).rejects.toThrow('NEXT_REDIRECT:/workspace');

        expect(mockSignInWithPassword).toHaveBeenCalledWith({
            email: 'owner@example.com',
            password: 'secret123',
        });
    });

    it('returns an error state when Supabase rejects the credentials', async () => {
        mockSignInWithPassword.mockResolvedValue({
            data: {
                session: null,
                user: null,
            },
            error: {
                message: 'Invalid login credentials',
            },
        });

        const formData = new FormData();
        formData.set('email', 'owner@example.com');
        formData.set('password', 'wrong-password');

        await expect(
            signInWithPassword({ error: null }, formData),
        ).resolves.toEqual({
            error: 'Invalid login credentials',
        });
    });
});
