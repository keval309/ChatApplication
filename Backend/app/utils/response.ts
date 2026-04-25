export const ErrorCodes = {
	BAD_REQUEST: { status: 400, code: 102, message: "Bad request" },
	UNAUTHORIZED: { status: 401, code: 401, message: "Unauthorized" },
	FORBIDDEN: { status: 403, code: 403, message: "Forbidden" },
	NOT_FOUND: { status: 404, code: 404, message: "Not found" },
	CONFLICT: { status: 409, code: 409, message: "Conflict" },
	LOCKED: { status: 423, code: 423, message: "Account temporarily locked" },
	TOO_MANY_REQUESTS: {
		status: 429,
		code: 429,
		message: "Too many requests",
	},
	INTERNAL: { status: 500, code: 500, message: "Internal server error" },

	GENERATE_BAD_REQUEST: (errorDescription: string) => ({
		...ErrorCodes.BAD_REQUEST,
		message: errorDescription,
		errorDescription,
	}),
};

export interface ApiSuccessResponse<T> {
	data: T;
	responseStatus: 200;
}

export const BaseResponse = <T>(result: T): ApiSuccessResponse<T> => ({
	data: result,
	responseStatus: 200,
});
