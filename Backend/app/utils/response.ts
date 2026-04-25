export const ErrorCodes = {
	BAD_REQUEST: { status: 400, code: 102, message: 'Bad request' },


	GENERATE_BAD_REQUEST: (errorDescription: string) => {
		return { ...ErrorCodes.BAD_REQUEST, 
				message:errorDescription,
			errorDescription };
	},};

export const BaseResponse = (result: any) => {
	// console.log('object', result);
	return { ...result, responseStatus: 200 };
};
