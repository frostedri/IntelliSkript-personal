import { URI } from 'vscode-uri';
import { addToUri, getRelativePathPart, URISeparator } from '../../file-system/file-functions';
import { Scope } from '../../Pattern/Scope';
import { sortedIndex } from '../../sorted-array';
import { SkriptFile } from '../Section/skript-file';
import { SkriptFolderContainer } from './skript-foldercontainer';
import { SkriptWorkSpace } from './skript-workspace';

export class SkriptFolder extends SkriptFolderContainer {
	//uri.path always ends with a slash
	uri: URI;
	files: SkriptFile[] = [];
	override parent: SkriptFolderContainer;

	/**caution! scope can be a reference to another scope! */
	scope: Scope;
	getPreferredSkriptFileIndexByUri(uri: URI): number {
		return sortedIndex(this.files, uri, (a, b) => a.document.uri < b.toString());
	}
	getPreferredSkriptFolderIndexByUri(uri: URI): number {
		//string comparison will still work if it's a subpath, since earlier charachters have priority
		return sortedIndex(this.children, uri, (a, b) => a.uri.toString() < b.toString());
	}

	addFile(file: SkriptFile) {
		const index = this.getPreferredSkriptFileIndexByUri(file.uri);
		this.files.splice(index, 0, file);
	}

	getSkriptFileByUri(uri: URI): SkriptFile | undefined {
		if (!this.files.length) {return undefined;}
		const index = this.getPreferredSkriptFileIndexByUri(uri);
		const foundFile = this.files[index];
		return (foundFile && foundFile.document.uri == uri.toString()) ? foundFile : undefined;
	}
	/**invalidate all files in this folder and child folders */
	invalidate() {
		for (const file of this.files)
			{file.invalidate();}

		for (const folder of this.children)
			{folder.invalidate();}

	}

	/**validate files recursively, until we find the file
	 * @param endFile validate until this file is encountered */
	async validateRecursively(endFile?: SkriptFile): Promise<boolean> {
		//when a file invalidates, all files after it invalidate too.
		const isAddonFolder = this.parent instanceof SkriptWorkSpace && this.parent.addonFolder === this;
		this.scope = isAddonFolder ? new Scope(undefined) : this.parent instanceof SkriptFolder ? this.parent.scope : new Scope(this.parent.getScope());

		//first, validate all folders
		for (const child of this.children) {
			if (await child.validateRecursively(endFile)) {
				return true;
			}
		}

		//then, validate all files
		for (const file of this.files) {
			//this way, a file won't know what is previous to it
			if (!file.validated)
				{await file.validate();}
			this.scope.merge(file.scope);

			if (file === endFile) //we don't need patterns after this
				{return true;}
		}


		return false;
	}

	constructor(parent: SkriptFolderContainer, uri: URI) {
		super();
		this.parent = parent;
		this.uri = uri;
		this.scope = new Scope(parent.getScope());
	}

	createFoldersForUri(uri: URI): SkriptFolder {
		console.log('creating folder for uri: ' + uri.toString() + ' , folder uri:' + this.uri.toString());
		const child = this.getSubFolderByUri(uri);
		if (child) {
			return child.createFoldersForUri(uri);
		}
		else {
			const relativePath = getRelativePathPart(this.uri, uri);
			const offset = relativePath.search(URISeparator);
			if (offset == -1) {
				return this;
			}
			else {
				//TODO: make them insert alphabetically
				const newChild = new SkriptFolder(this, addToUri(this.uri, relativePath.substring(0, offset)));
				this.children.splice(this.getPreferredSkriptFileIndexByUri(newChild.uri), 0, newChild);
				return newChild.createFoldersForUri(uri);
			}
		}
	}
}