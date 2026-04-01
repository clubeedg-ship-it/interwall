import type { PropsWithChildren, ReactElement } from 'react';

import { render, type RenderOptions, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type AppRenderOptions = Omit<RenderOptions, 'wrapper'>;

function AppTestProviders({ children }: PropsWithChildren) {
    return <>{children}</>;
}

export function renderApp(ui: ReactElement, options?: AppRenderOptions) {
    const result = render(ui, {
        wrapper: AppTestProviders,
        ...options,
    });
    return {
        ...result,
        user: userEvent.setup(),
    };
}

export { screen };
