import { notFound, redirect } from 'next/navigation';

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

export default async function OrderDetailPage({
    params,
}: {
    params: { orderId: string };
}): Promise<JSX.Element> {
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
    const selectedSummary = orders.find((order) => order.id === params.orderId);

    if (!selectedSummary) {
        notFound();
    }

    const selectedOrder =
        selectedSummary.orderType === 'purchase'
            ? await getPurchaseOrderDetail(
                  supabase as unknown as OrdersRepositoryClient,
                  {
                      tenantId: activeTenant.membership.tenantId,
                      purchaseOrderId: selectedSummary.id,
                  },
              )
            : await getSalesOrderDetail(
                  supabase as unknown as OrdersRepositoryClient,
                  {
                      tenantId: activeTenant.membership.tenantId,
                      salesOrderId: selectedSummary.id,
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
