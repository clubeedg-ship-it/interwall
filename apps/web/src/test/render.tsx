import type { PropsWithChildren, ReactElement } from 'react';

import { render, type RenderOptions, screen } from '@testing-library/react';

type AppRenderOptions = Omit<RenderOptions, 'wrapper'>;

function AppTestProviders({ children }: PropsWithChildren) {
    return <>{children}</>;
}

export function renderApp(ui: ReactElement, options?: AppRenderOptions) {
    return render(ui, {
        wrapper: AppTestProviders,
        ...options
    });
}

export { screen };
