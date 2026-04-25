
export function invalidText(value: any) {
	return (
		value == null ||
		value == undefined ||
		value.toString().trim().length == 0 ||
		value === 'null'
	);
}