class CustomApiError extends Error {
    statusCode: number;
    code?: string;
    details?: unknown;

    constructor(
        message: string,
        statusCode: number,
        options: { code?: string; details?: unknown } = {},
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = options.code;
        this.details = options.details;
    }
}

export default CustomApiError;
