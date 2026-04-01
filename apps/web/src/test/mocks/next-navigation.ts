import { vi } from 'vitest';

type MockSearchParamsInput = URLSearchParams | string | Record<string, string> | undefined;

const redirectErrorCode = 'NEXT_REDIRECT';
const notFoundErrorCode = 'NEXT_NOT_FOUND';

const createReadonlySearchParams = (value?: MockSearchParamsInput) => {
    if (value instanceof URLSearchParams) {
        return new URLSearchParams(value);
    }

    if (typeof value === 'string') {
        return new URLSearchParams(value);
    }

    return new URLSearchParams(value);
};

const navigationState = {
    pathname: '/',
    params: {} as Record<string, string>,
    searchParams: createReadonlySearchParams(),
    selectedLayoutSegment: null as string | null,
    selectedLayoutSegments: [] as string[]
};

export const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
    back: vi.fn(),
    forward: vi.fn()
};

export function resetNextNavigationMocks() {
    navigationState.pathname = '/';
    navigationState.params = {};
    navigationState.searchParams = createReadonlySearchParams();
    navigationState.selectedLayoutSegment = null;
    navigationState.selectedLayoutSegments = [];

    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockRouter.refresh.mockReset();
    mockRouter.prefetch.mockReset();
    mockRouter.prefetch.mockResolvedValue(undefined);
    mockRouter.back.mockReset();
    mockRouter.forward.mockReset();
}

export function setMockPathname(pathname: string) {
    navigationState.pathname = pathname;
}

export function setMockParams(params: Record<string, string>) {
    navigationState.params = { ...params };
}

export function setMockSearchParams(searchParams?: MockSearchParamsInput) {
    navigationState.searchParams = createReadonlySearchParams(searchParams);
}

export function setMockSelectedLayoutSegment(segment: string | null) {
    navigationState.selectedLayoutSegment = segment;
}

export function setMockSelectedLayoutSegments(segments: string[]) {
    navigationState.selectedLayoutSegments = [...segments];
}

export const redirect = vi.fn((location: string) => {
    throw new Error(`${redirectErrorCode}:${location}`);
});

export const permanentRedirect = vi.fn((location: string) => {
    throw new Error(`${redirectErrorCode}:${location}`);
});

export const notFound = vi.fn(() => {
    throw new Error(notFoundErrorCode);
});

export const useRouter = vi.fn(() => mockRouter);
export const usePathname = vi.fn(() => navigationState.pathname);
export const useParams = vi.fn(() => navigationState.params);
export const useSearchParams = vi.fn(() => navigationState.searchParams);
export const useSelectedLayoutSegment = vi.fn(() => navigationState.selectedLayoutSegment);
export const useSelectedLayoutSegments = vi.fn(() => navigationState.selectedLayoutSegments);
