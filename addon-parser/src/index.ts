import path = require('path');
import * as fs from 'fs';
import { AddonParser } from './addon-parser';
import { idParser } from './id-parser';
import { RepoDirectory } from './Parser';
import { ResourceParser } from './resource-parser';

let totalString = AddonParser.ParseFiles();
totalString += idParser.ParseFiles();
totalString += ResourceParser.ParseFiles();
const targetPath = path.join(RepoDirectory, "client", "src", "assets", "resource-files.ts");
fs.writeFileSync(targetPath, `export let resourceFiles: Map<string, string> = new Map(([${totalString}] as [string, string][])     // ← assert as tuple-array
	  .sort((a, b) => a[0].localeCompare(b[0])));`);