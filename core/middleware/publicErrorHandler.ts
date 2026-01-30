export interface PublicError {
    error: string;
    code?: string;
}

export class PublicError extends Error {
    statusCode: number;
    code?: string;
    
    constructor(
        message: string,
        statusCode: number = 400,
        code: string = "BAD_REQUEST"
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

