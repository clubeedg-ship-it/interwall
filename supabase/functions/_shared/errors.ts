export class FunctionError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(
        status: number,
        code: string,
        message: string,
        details?: unknown,
    ) {
        super(message);
        this.name = 'FunctionError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function json(data: unknown, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);

    if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json; charset=utf-8');
    }

    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}

export function errorResponse(error: unknown): Response {
    if (error instanceof FunctionError) {
        return json(
            {
                error: {
                    code: error.code,
                    message: error.message,
                    details: error.details ?? null,
                },
            },
            { status: error.status },
        );
    }

    console.error('Unhandled edge function error', error);

    return json(
        {
            error: {
                code: 'internal_server_error',
                message: 'An unexpected backend error occurred.',
            },
        },
        { status: 500 },
    );
}

export function requireMethod(
    request: Request,
    allowedMethods: string[],
): void {
    if (allowedMethods.includes(request.method)) {
        return;
    }

    throw new FunctionError(
        405,
        'method_not_allowed',
        `Method ${request.method} is not allowed for this function.`,
        { allowedMethods },
    );
}

export async function readJson<T>(request: Request): Promise<T> {
    try {
        return await request.json() as T;
    } catch (error) {
        throw new FunctionError(
            400,
            'invalid_json',
            'Request body must be valid JSON.',
            error instanceof Error ? error.message : String(error),
        );
    }
}
