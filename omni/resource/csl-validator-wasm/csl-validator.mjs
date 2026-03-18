import RNV from './rnv.mjs';

const SCHEMA_PATH = '/schema/csl.rnc'; // Includes the other .rnc files
const STYLE_PATH = '/style.csl';

export async function validateStyle(style) {
	let outputBuffer = '';
	let appendOutput = (text) => {
		if (text === STYLE_PATH) return; // Ignore the filename line
		outputBuffer += text + '\n';
	};

	await RNV({
		arguments: [SCHEMA_PATH, STYLE_PATH],
		preRun(rnv) {
			rnv.FS.writeFile(STYLE_PATH, style);
		},
		print: appendOutput,
		printErr: appendOutput,
	});
	
	return outputBuffer;
}
