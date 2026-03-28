import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { Scope } from '../../Pattern/Scope';
import Mutex from '../../Thread';
import { SkriptFile } from '../Section/skript-file';
import { SkriptFolder } from './skript-folder';
import { SkriptFolderContainer } from './skript-foldercontainer';

export class SkriptWorkSpace extends SkriptFolderContainer {
	mutex = new Mutex();
	//the 'childsections' variable is not used here. TODO somehow merge the childsections and files variable
	//
	looseFiles: SkriptFile[] = [];

	//a workspace doesn't have a parent.
	override parent: undefined;
	addonFolder: SkriptFolder;
	//readAddonFiles() {
	//	this.addFolder(this.addonFolder);
	//}

	//the constructor will be used before the debugger is launched. caution!
	constructor() {
		super();
		//the addon folder will not use itself as parent pattern container, because when it calls getpatterncontainer(), this.addonFolder is still undefined
		this.children.push(this.addonFolder = new SkriptFolder(this, URI.from({ scheme: "internal" })));
	}

	getSkriptFileByUri(uri: URI): SkriptFile | undefined {
		const f = this.getFolderByUri(uri);
		if (f) {
			return f.getSkriptFileByUri(uri);
		}
		else {
			return this.looseFiles.find(val => val.uri.toString() == uri.toString()) ?? this.addonFolder.getSkriptFileByUri(uri);
		}
	}

	invalidateDependents(file: SkriptFile) {
		// the document has changed
		// all files validated 'after' this file need to be updated.
		if (file.parent instanceof SkriptFolder) {
			let fileFound = false;
			for (const folderFile of file.parent.files) {
				if (folderFile == file) {
					fileFound = true;
				}
				if (fileFound) {
					folderFile.invalidate();
				}
			}
			//invalidate all parent subfolders which come after the parent folder of this file
			//'aunts and uncles'
			let currentParent: SkriptFolderContainer = file.parent;
			let folderFound = false;
			while (currentParent instanceof SkriptFolder) {
				if (currentParent != file.parent) {
					for (const parentFile of currentParent.files) {
						parentFile.invalidate();
					}
				}

				for (const uncleFolder of currentParent.parent.children) {
					if (folderFound) {
						uncleFolder.invalidate();
					}
					//don't invalidate the found folder
					if (uncleFolder == currentParent) {
						folderFound = true;
					}
				}
				currentParent = currentParent.parent;
			}

			if (file.parent == this.addonFolder) {
				//this is the addon folder, all files in the workspace depend on this
				for (const folder of this.children)
					{folder.invalidate();}
				for (const looseFile of this.looseFiles)
					{looseFile.invalidate();}

			}
		}
		else
			{file.invalidate();}
	}

	async validateTextDocument(document: TextDocument, couldBeChanged = true) {
		const uri: URI = URI.parse(document.uri);
		let file = this.getSkriptFileByUri(uri);
		if (!file) {
			const folder = this.getSubFolderByUri(uri);
			file = new SkriptFile(folder ?? this, document);
			if (folder) {
				folder.createFoldersForUri(uri).addFile(file);
			}
			else {
				this.looseFiles.push(file);
			}
		}
		else if (couldBeChanged && file.updateContent(document)) {
			this.invalidateDependents(file);
		}


		if (!file.validated) {
			//revalidate all possibly invalidated dependencies

			//the workspace folder which is associated with this file
			const mainSubFolder = this.getSubFolderByUri(uri);

			if (mainSubFolder != this.addonFolder) {
				//first of all, validate the entire addon folder
				await this.addonFolder.validateRecursively();
			}

			//when not, this file is a loose file
			if (mainSubFolder) {
				await mainSubFolder.validateRecursively(file);
			}
			else {
				await file.validate();
			}
		}
	}
	override getScope(): Scope | undefined {
		//get patterndata from the skript extension folder
		//don't call the getPatternData from the folder, because that will call this workspace again
		//todo:
		//we're checking twice for the addon folder patterns when compiling the addon folder
		//it isn't that bad, because all files in the addon folder should be able to find their patterns
		return this.addonFolder?.scope;
	}

	//override getVariableByName(name: string): SkriptVariable | undefined {
	//	for (const file of this.files) {
	//		const result = file.getVariableByName(name);
	//		if (result != undefined) return result;
	//	}
	//	return undefined;
	//}

}