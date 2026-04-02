import { redirect } from 'next/navigation';

import { WallShell } from '@interwall/ui';

import { OrderWorkspaceScreen } from '@/components/orders/order-workspace-screen';
import { requireUserSession } from '@/lib/server/auth';
import type { OrdersRepositoryClient } from '@/lib/server/repositories/orders';
import {
    getPurchaseOrderDetail,
    getSalesOrderDetail,
    listOrders,
} from '@/lib/server/repositories/orders';
import {
    listMembershipsForUser,
    type MembershipRepositoryClient,
} from '@/lib/server/repositories/memberships';
import { createServerSupabaseClient } from '@/lib/server/supabase';
import { resolveActiveTenant } from '@/lib/server/tenant-context';

async function loadSelectedOrder(
    client: OrdersRepositoryClient,
    input: {
        tenantId: string;
        orderId: string | null;
        orderType: 'purchase' | 'sales' | null;
    },
) {
    if (!input.orderId || !input.orderType) {
        return null;
    }

    return input.orderType === 'purchase'
        ? await getPurchaseOrderDetail(client, {
              tenantId: input.tenantId,
              purchaseOrderId: input.orderId,
          })
        : await getSalesOrderDetail(client, {
              tenantId: input.tenantId,
              salesOrderId: input.orderId,
          });
}

export default async function OrdersPage(): Promise<JSX.Element> {
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

    const orders = await listOrders(supabase as unknown as OrdersRepositoryClient, {
        tenantId: activeTenant.membership.tenantId,
    });
    const firstOrder = orders[0] ?? null;
    const selectedOrder = await loadSelectedOrder(
        supabase as unknown as OrdersRepositoryClient,
        {
            tenantId: activeTenant.membership.tenantId,
            orderId: firstOrder?.id ?? null,
            orderType: firstOrder?.orderType ?? null,
        },
    );

    return (
        <WallShell
            activeItem="orders"
            tenantName={activeTenant.membership.tenantName}
        >
            <OrderWorkspaceScreen orders={orders} selectedOrder={selectedOrder} />
        </WallShell>
    );
}
