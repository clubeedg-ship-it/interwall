import { redirect } from 'next/navigation';

import type {
    WallInventoryViewModel,
    WallScannerState,
} from '@interwall/shared';
import { WallShell } from '@interwall/ui';

import { WallExperienceScreen } from '@/components/wall/wall-experience-screen';
import { requireUserSession } from '@/lib/server/auth';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { resolveActiveTenant } from '@/lib/server/tenant-context';

function createWallViewModel(tenantName: string): WallInventoryViewModel {
    return {
        warehouseName: `${tenantName} main warehouse`,
        zones: [
            {
                id: 'zone-receiving',
                label: 'Receiving',
                displayCode: 'RCV',
                shelfCount: 3,
                shelves: [
                    {
                        id: 'shelf-rcv-01',
                        label: 'Inbound 01',
                        displayCode: 'RCV-01',
                        health: 'healthy',
                        productName: 'Anchor Bracket',
                        quantityOnHand: 18,
                        capacityUnits: 24,
                        reorderCount: 0,
                        lotCount: 2,
                        notes: null,
                    },
                    {
                        id: 'shelf-rcv-02',
                        label: 'Inbound 02',
                        displayCode: 'RCV-02',
                        health: 'warning',
                        productName: 'Mounting Rail',
                        quantityOnHand: 6,
                        capacityUnits: 20,
                        reorderCount: 2,
                        lotCount: 1,
                        notes: null,
                    },
                    {
                        id: 'shelf-rcv-03',
                        label: 'Inbound 03',
                        displayCode: 'RCV-03',
                        health: 'empty',
                        productName: null,
                        quantityOnHand: 0,
                        capacityUnits: 16,
                        reorderCount: 0,
                        lotCount: 0,
                        notes: null,
                    },
                ],
            },
            {
                id: 'zone-picking',
                label: 'Picking',
                displayCode: 'PCK',
                shelfCount: 2,
                shelves: [
                    {
                        id: 'shelf-pck-01',
                        label: 'Pick Face 01',
                        displayCode: 'PCK-01',
                        health: 'critical',
                        productName: 'Closure Clip',
                        quantityOnHand: 3,
                        capacityUnits: 18,
                        reorderCount: 4,
                        lotCount: 1,
                        notes: null,
                    },
                    {
                        id: 'shelf-pck-02',
                        label: 'Pick Face 02',
                        displayCode: 'PCK-02',
                        health: 'healthy',
                        productName: 'Frame Panel',
                        quantityOnHand: 14,
                        capacityUnits: 18,
                        reorderCount: 0,
                        lotCount: 2,
                        notes: null,
                    },
                ],
            },
        ],
        selectedZoneId: 'zone-receiving',
        selectedShelfId: 'shelf-rcv-02',
        detail: {
            shelfId: 'shelf-rcv-02',
            shelfLabel: 'Inbound 02',
            shelfDisplayCode: 'RCV-02',
            health: 'warning',
            quantityOnHand: 6,
            capacityUnits: 20,
            reorderThreshold: 8,
            stockValue: 312,
            primaryProductName: 'Mounting Rail',
            lots: [
                {
                    id: 'lot-rcv-02-a',
                    productName: 'Mounting Rail',
                    quantityOnHand: 6,
                    receivedAt: '2026-04-01T08:00:00.000Z',
                    unitCost: 52,
                    lotReference: 'MR-2401',
                    supplierReference: 'SUP-RAIL',
                    notes: null,
                },
            ],
        },
    };
}

function createScannerDefaults(): WallScannerState {
    return {
        query: '4891057781004',
        status: 'ready',
        activeModeLabel: 'Keyboard scanner',
        pendingDraft: {
            barcode: '4891057781004',
            sku: 'MR-2401',
            quantity: 6,
            unitCost: 52,
            lotReference: 'MR-2401',
            supplierReference: 'SUP-RAIL',
            shelfId: 'shelf-rcv-02',
        },
        matches: [
            {
                id: 'match-product-1',
                type: 'product',
                title: 'Mounting Rail',
                subtitle: 'MR-2401',
                barcode: '4891057781004',
                shelfLabel: 'Inbound 02',
            },
            {
                id: 'match-shelf-1',
                type: 'shelf',
                title: 'Inbound 02',
                subtitle: 'Receiving',
                barcode: '4891057781004',
                shelfLabel: 'Inbound 02',
            },
        ],
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

    const wall = createWallViewModel(activeTenant.membership.tenantName);
    const scanner = createScannerDefaults();

    return (
        <WallShell tenantName={activeTenant.membership.tenantName}>
            <WallExperienceScreen scanner={scanner} wall={wall} />
        </WallShell>
    );
}
