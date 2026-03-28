import { TelemetryReporter } from '@vscode/extension-telemetry';
import { ExtensionContext, ExtensionMode, extensions, RelativePattern, TextDocumentContentProvider, Uri, window, workspace } from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, RevealOutputChannelOn } from 'vscode-languageclient';
import { resourceFiles } from './assets/resource-files';

//the connection string is not sensitive, so we can just let it be here.
const connectionString = "InstrumentationKey=3beed08d-7b3d-40cd-a129-05ff7cb7b2f9;IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/;LiveEndpoint=https://westeurope.livediagnostics.monitor.azure.com/;ApplicationId=bfda7f12-a9c2-4196-bd99-850fa9f29864";


const intelliskriptScheme = 'intelliskript';
const resourceFolderString = '/resources';
let reporter : TelemetryReporter;
export async function startClient(creationFunction: (context: ExtensionContext, clientOptions: LanguageClientOptions) => BaseLanguageClient, context: ExtensionContext): Promise<void> {
	console.log('intelliskript activated!');
	// create telemetry reporter on extension activation
	reporter = new TelemetryReporter(connectionString);

	// ensure it gets properly disposed. Upon disposal the events will be flushed
	context.subscriptions.push(reporter);


	if (context.extensionMode != ExtensionMode.Production) {
		//debugging
		setTimeout(function () {
			//sleep 5 sec to give the debugger time to start
		}, 5000);
	}
	const documentSelector = [{ language: 'skript' }];

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {},
		initializationOptions: {},
		revealOutputChannelOn: RevealOutputChannelOn.Error
	};
	const myProvider = new (class implements TextDocumentContentProvider {
		provideTextDocumentContent(uri: Uri): string {
			//remove the '\'
			return resourceFiles.get(uri.path.substring((resourceFolderString + '/').length)) ?? "#document could not be opened";
		}
	})();
	workspace.registerTextDocumentContentProvider(intelliskriptScheme, myProvider);

	client = creationFunction(context, clientOptions);
	//client.registerFeature({ fillInitializeParams(capabilities.textDocument.completion.completionItem.snippetSupport = true) })
	return activateClient(context, client);
}


export async function activateClient(context: ExtensionContext, client: BaseLanguageClient) {
	await client.start();


	//make the server able to read and list files
	const readFileListener = client.onRequest('custom/readFile', async (params: { uri: string }) => {
		const uri = Uri.parse(params.uri);
		const fileContent = await workspace.fs.readFile(uri);
		return Buffer.from(fileContent).toString('utf8');
	});
	const listFilesListener = client.onRequest('custom/listFiles', async (params: { folderUri: string }) => {
		const folderUri = Uri.parse(params.folderUri);
		const files = await workspace.findFiles(new RelativePattern(folderUri, '**/*'), '**/node_modules/**');
		return files.map(file => file.toString());
	});

	//this listener just sends the skript contents of an entire folder to the server
	const getDocumentsListener = client.onRequest('custom/getDocuments', async (params: { folderUri: string }) => {
		const folderUri = Uri.parse(params.folderUri);
		if (folderUri.scheme == intelliskriptScheme) {
			//just return all files
			const fileList: { uri: string, content: string }[] = [];
			for (const file of resourceFiles) {
				fileList.push({ uri: Uri.from({ scheme: intelliskriptScheme, path: resourceFolderString + '/' + file[0] }).toString(), content: file[1] });
			}
			return fileList;
		}
		const files = await workspace.findFiles(new RelativePattern(folderUri, '**/*.sk'));

		const decoder = new TextDecoder('utf-8');
		//read all files at once:
		return Promise.all(
			files.map(
				async file => ({
					uri: file.toString(),
					//convert bytes to string
					content: decoder.decode(await workspace.fs.readFile(file))
				})));
	});
	const extensionUri = extensions.getExtension('JohnHeikens.intelliskript')?.extensionUri;
	//for debugger
	if (extensionUri)
		{client.onRequest('custom/getStartData', async (_params: {}) => {
			return {
				addonPath: Uri.from({ scheme: intelliskriptScheme, path: resourceFolderString }).toString()
			};
		});}
	// Listen for active text editor changes
	window.onDidChangeActiveTextEditor(editor => {
		if (editor && editor.document) {
			client.sendNotification('custom/onDidChangeActiveTextEditor', { uri: editor.document.uri.toString() });
		}
	});
	context.subscriptions.push(readFileListener, listFilesListener, getDocumentsListener);
	//window.showInformationMessage('client finished loading');
	console.log('intelliskript is ready');
	// send event any time after activation
	reporter.sendTelemetryEvent('clientActivated');//, { 'stringProp': 'some string' }, { 'numericMeasure': 123 });

}

let client: BaseLanguageClient | undefined;
export async function deactivate(): Promise<void> {
	if (client !== undefined) {
		await client.stop();
	}
}