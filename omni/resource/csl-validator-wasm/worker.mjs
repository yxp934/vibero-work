import { validateStyle } from './csl-validator.mjs';

self.onmessage = async (event) => {
	let style = event.data;
	let result = await validateStyle(style);
	self.postMessage(result);
};
