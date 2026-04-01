import { redirect } from 'next/navigation';

import type { WallScannerState } from '@interwall/shared';
import { WallShell } from '@interwall/ui';

import { WorkspaceClient } from './workspace-client';
import { requireUserSession } from '@/lib/server/auth';
import type { InventoryRepositoryClient } from '@/lib/server/repositories/inventory';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { resolveActiveTenant } from '@/lib/server/tenant-context';
import { getWallExperienceData } from '@/lib/server/wall-data';

function createScannerDefaults(): WallScannerState {
    return {
        query: '',
        status: 'ready',
        activeModeLabel: 'Keyboard scanner',
        pendingDraft: null,
        matches: [],
    };
}

export default async function WorkspacePage(): Promise<JSX.Element> {
    const supabase = createServerSupabaseClient();
    const user = await requireUserSession({ supabase });
    const activeTenant = await resolveActiveTenant({
        user,
        listMemberships: (authenticatedUser) =>
            listMembershipsForUser(
                supabase as unknown as MembershipRepositoryClient,
                authenticatedUser,
            ),
    });

    if (activeTenant.status !== 'active') {
        redirect('/select-organization');
    }

    const wall = await getWallExperienceData(
        supabase as unknown as InventoryRepositoryClient,
        { tenantId: activeTenant.membership.tenantId },
    );
    const scanner = createScannerDefaults();

    return (
        <WallShell tenantName={activeTenant.membership.tenantName}>
            <WorkspaceClient scanner={scanner} wall={wall} />
        </WallShell>
    );
}
