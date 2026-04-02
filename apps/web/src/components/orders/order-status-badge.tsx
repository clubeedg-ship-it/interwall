import { cn } from '@interwall/ui';

const STATUS_STYLES: Record<
    string,
    {
        label: string;
        background: string;
        foreground: string;
    }
> = {
    draft: {
        label: 'Draft',
        background: '#475569',
        foreground: '#e2e8f0',
    },
    confirmed: {
        label: 'Confirmed',
        background: '#d97706',
        foreground: '#fffbeb',
    },
    partially_received: {
        label: 'Partial',
        background: '#14b8a6',
        foreground: '#042f2e',
    },
    partially_shipped: {
        label: 'Partial',
        background: '#14b8a6',
        foreground: '#042f2e',
    },
    received: {
        label: 'Completed',
        background: '#166534',
        foreground: '#dcfce7',
    },
    shipped: {
        label: 'Completed',
        background: '#166534',
        foreground: '#dcfce7',
    },
    cancelled: {
        label: 'Cancelled',
        background: '#dc2626',
        foreground: '#fee2e2',
    },
    blocked: {
        label: 'Blocked',
        background: '#dc2626',
        foreground: '#fee2e2',
    },
};

export interface OrderStatusBadgeProps {
    status: string;
    className?: string;
}

export function OrderStatusBadge({
    status,
    className,
}: OrderStatusBadgeProps): JSX.Element {
    const style = STATUS_STYLES[status] ?? {
        label: status,
        background: '#475569',
        foreground: '#e2e8f0',
    };

    return (
        <span
            className={cn(
                'inline-flex min-h-8 items-center rounded-full border border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.16em]',
                className,
            )}
            style={{
                backgroundColor: style.background,
                color: style.foreground,
            }}
        >
            {style.label}
        </span>
    );
}
