
import path = require('path');
import { skriptFileHeader } from './addon-parser';
import { ParseFile } from './parse-file';
import { Parser } from './Parser';

export class idParser extends Parser {
	static override idDirectory: string = path.join(this.parserDirectory, "ids");
	static override ParseFile(file: ParseFile): ParseFile {
		const inputFileName = file.fileName.substring(0, file.fileName.indexOf('.'));
		let outputFileString = skriptFileHeader;
		outputFileString += "expression:\n";
		outputFileString += "\treturn type: " + inputFileName + "type\n";
		outputFileString += "\tpatterns:\n";
		const vowels = "aeiou";

		for (const line of file.content.split('\n')) {
			const trimmedLine = line.trim();
			const prefix = vowels.includes(trimmedLine.substring(0, 1)) ? "[an] " : "[a] ";
			outputFileString += "\t\t" + prefix + trimmedLine + "\n";
		}

		return {
			content: outputFileString,
			fileName: "zzz (postload) - IntelliSkript " + inputFileName.substring(0, 1).toUpperCase() + inputFileName.substring(1) + '.sk'
		};
		//const targetPath = path.join(AddonSkFilesDirectory, outputFileName) + ".sk";
		//fs.writeFileSync(targetPath, outputFileString);
	}
}