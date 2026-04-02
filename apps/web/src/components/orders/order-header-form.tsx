import type { OrderType } from '@interwall/shared';

export interface OrderHeaderFormValue {
    orderType: OrderType;
    orderNumber: string;
    supplierName: string;
    supplierReference: string;
    customerName: string;
    customerReference: string;
    warehouseId: string;
    orderDate: string;
    expectedDate: string;
    note: string;
}

export interface OrderHeaderFormProps {
    value: OrderHeaderFormValue;
    onChange: (nextValue: OrderHeaderFormValue) => void;
}

function updateValue(
    value: OrderHeaderFormValue,
    onChange: OrderHeaderFormProps['onChange'],
    patch: Partial<OrderHeaderFormValue>,
) {
    onChange({
        ...value,
        ...patch,
    });
}

export function OrderHeaderForm({
    value,
    onChange,
}: OrderHeaderFormProps): JSX.Element {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-slate-100">
                    <span>Order number</span>
                    <input
                        className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                        onChange={(event) =>
                            updateValue(value, onChange, {
                                orderNumber: event.target.value,
                            })
                        }
                        value={value.orderNumber}
                    />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-100">
                    <span>Warehouse ID</span>
                    <input
                        className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                        onChange={(event) =>
                            updateValue(value, onChange, {
                                warehouseId: event.target.value,
                            })
                        }
                        value={value.warehouseId}
                    />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-100">
                    <span>Order date</span>
                    <input
                        className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                        onChange={(event) =>
                            updateValue(value, onChange, {
                                orderDate: event.target.value,
                            })
                        }
                        type="date"
                        value={value.orderDate}
                    />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-100">
                    <span>Expected date</span>
                    <input
                        className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                        onChange={(event) =>
                            updateValue(value, onChange, {
                                expectedDate: event.target.value,
                            })
                        }
                        type="date"
                        value={value.expectedDate}
                    />
                </label>
                {value.orderType === 'purchase' ? (
                    <>
                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>Supplier name</span>
                            <input
                                className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                onChange={(event) =>
                                    updateValue(value, onChange, {
                                        supplierName: event.target.value,
                                    })
                                }
                                value={value.supplierName}
                            />
                        </label>
                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>Supplier reference</span>
                            <input
                                className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                onChange={(event) =>
                                    updateValue(value, onChange, {
                                        supplierReference: event.target.value,
                                    })
                                }
                                value={value.supplierReference}
                            />
                        </label>
                    </>
                ) : (
                    <>
                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>Customer name</span>
                            <input
                                className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                onChange={(event) =>
                                    updateValue(value, onChange, {
                                        customerName: event.target.value,
                                    })
                                }
                                value={value.customerName}
                            />
                        </label>
                        <label className="space-y-2 text-sm font-semibold text-slate-100">
                            <span>Customer reference</span>
                            <input
                                className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 text-base text-white"
                                onChange={(event) =>
                                    updateValue(value, onChange, {
                                        customerReference: event.target.value,
                                    })
                                }
                                value={value.customerReference}
                            />
                        </label>
                    </>
                )}
            </div>
            <label className="space-y-2 text-sm font-semibold text-slate-100">
                <span>Notes</span>
                <textarea
                    className="min-h-24 w-full rounded-[1.5rem] border border-white/10 bg-[#09111f] px-4 py-3 text-base text-white"
                    onChange={(event) =>
                        updateValue(value, onChange, {
                            note: event.target.value,
                        })
                    }
                    value={value.note}
                />
            </label>
        </div>
    );
}
