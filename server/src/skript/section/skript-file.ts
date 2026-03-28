import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity, Range, TextEdit } from 'vscode-languageserver/browser';
import { URI } from 'vscode-uri';
import { consumingLineTerminatorRegexp, LineTerminatorRegExp } from '../../intelliskript-constants';
import { PatternData } from '../../Pattern/data/pattern-data';
import { PatternType } from "../../Pattern/pattern-type";
import { Scope } from '../../Pattern/Scope';
import { SkriptPatternMatchHierarchy } from '../../Pattern/skript-patternmatch-hierarchy';
import { currentServer } from '../../server';
import { TokenTypes } from '../../token-types';
import { SkriptFolder } from '../folder-container/skript-folder';
import { SkriptWorkSpace } from '../folder-container/skript-workspace';
import { SkriptOption } from '../storage/skript-option';
import { IndentData } from '../validation/indent-data';
import { ParseResult } from '../validation/parse-result';
import { SkriptContext } from '../validation/skript-context';
import { SkriptTypeSection } from './custom/skript-type-section';
import { ReflectConditionSection } from './reflect/reflect-condition-section';
import { ReflectEffectSection as SkriptEffectSection } from './reflect/reflect-effect-section';
import { ReflectEventSection } from './reflect/reflect-event-section';
import { ReflectExpressionSection } from './reflect/reflect-expression-section';
import { ReflectImportSection } from './reflect/reflect-import-section';
import { ReflectPatternContainerSection } from './reflect/reflect-pattern-container-section';
import { ReflectPatternSection } from './reflect/reflect-pattern-section';
import { ReflectPropertySection } from './reflect/reflect-property-section';
import { ReflectSectionSection } from './reflect/reflect-section-section';
import { SkriptAliasesSection } from './skript-aliases-section';
import { SkriptCommandSection } from './skript-command-section';
import { SkriptEventListenerSection } from './skript-eventlistener-section';
import { SkriptFunction } from './skript-function-section';
import { SkriptOptionsSection } from './skript-options-section';
import { SkriptSection } from "./skript-section/skript-section";
import { SkriptVariablesSection } from './skript-variables-section';
import { SemanticTokenLine, UnOrderedSemanticTokensBuilder } from './unordered-semantic-tokens-builder';


export class SkriptFile extends SkriptSection {
	uri: URI;
	document: TextDocument;
	text: string = "";
	//workSpace: SkriptWorkSpace;
	override parent: SkriptFolder | SkriptWorkSpace;
	builder: UnOrderedSemanticTokensBuilder;

	options: SkriptOption[] = [];
	parseResult: ParseResult = new ParseResult();

	scope: Scope;
	matches: SkriptPatternMatchHierarchy = new SkriptPatternMatchHierarchy();

	//dependents: SkriptFile[] = new Array<SkriptFile>();
	//dependencies: SkriptFile[] = new Array<SkriptFile>();
	validated = false;
	suggestedIndentation: number[] = [];
	/**
	 * invalidate this file, and invalidate it possible dependents
	 */
	invalidate() {
		this.validated = false;
		//first see what dependencies and dependents this file had.
		//for (const dependency of this.dependencies) {
		//	//remove the old file from the dependencies' dependents
		//	dependency.dependents.splice(dependency.dependents.indexOf(this, 0), 1);
		//}
		//this.dependencies = new Array<SkriptFile>();
		//
		//if (this.validated) {
		//	//first set outdated to true, to avoid an infinite loop caused by circular dependencies
		//	this.validated = false;
		//
		//	//for (const dependent of this.dependents) {
		//	//	dependent.invalidate();
		//	//}
		//	this.dependents = new Array<SkriptFile>();
		//}
	}
	/**returns true if the document has changed */
	updateContent(newDocument: TextDocument): boolean {
		const newText = newDocument.getText();
		if (newText != this.text) {
			this.document = newDocument;
			this.text = newText;
			return true;
		}
		return false;
	}

	addPattern(pattern: PatternData): void {
		this.scope.addPattern(pattern);
	}

	createSection(context: SkriptContext): SkriptSection | undefined {
		const spaceIndex = context.currentString.indexOf(" ");
		let patternStartIndex = spaceIndex == -1 ? undefined : spaceIndex + 1;
		const sectionKeyword = spaceIndex == -1 ? context.currentString : context.currentString.substring(0, spaceIndex);
		let addKeywordToken = true;
		let s: SkriptSection | undefined;
		if (sectionKeyword == "function") {
			s = new SkriptFunction(this, context);
		}
		else if (sectionKeyword == "command") {
			s = new SkriptCommandSection(this, context);
		}
		else if (sectionKeyword == "import") {
			s = new ReflectImportSection(this, context);
		}
		else if (sectionKeyword == "event") {
			s = new ReflectEventSection(this, context);
		}
		else if (sectionKeyword == "condition") {
			s = new ReflectConditionSection(this, context);
		}
		else if (sectionKeyword == "section") {
			s = new ReflectSectionSection(this, context);
		}
		else if (sectionKeyword == "effect") {
			s = new SkriptEffectSection(this, context);
		}
		else if (sectionKeyword == "options") {
			s = new SkriptOptionsSection(this, context);
		}
		else if (sectionKeyword == "type") {
			s = new SkriptTypeSection(this, context);
		}
		else if (sectionKeyword == "aliases") {
			s = new SkriptAliasesSection(this, context);
		}
		else if (sectionKeyword == "variables") {
			s = new SkriptVariablesSection(this, context);
		}
		else {
			const result = /^((local )?((plural|non-single) )?expression)( .*|)/.exec(context.currentString);
			if (result) {
				addKeywordToken = false;
				s = new ReflectExpressionSection(this, context);
				if (result[5]) {
					patternStartIndex = result[1].length + " ".length;
				}
				else {
					patternStartIndex = undefined;
				}
				context.addToken(TokenTypes.keyword, 0, patternStartIndex);
			}
			else {
				const propertyResult = /^(?:((?:(?:local) )?(?:(?:plural|non-single) )?)((?:[^\s]| ){1,}) property) .*/.exec(context.currentString);
				if (propertyResult) {
					const typeStart = propertyResult[1].length;
					const data = this.parseType(context, typeStart, propertyResult[2].length);
					addKeywordToken = false;
					if (data) {
						s = new ReflectPropertySection(this, context, data);
						const typeEnd = typeStart + propertyResult[2].length;
						patternStartIndex = typeEnd + " property ".length;
						//add keyword token for 'local plural'
						context.addToken(TokenTypes.keyword, 0, typeStart);
						//add keyword token for 'property'
						context.addToken(TokenTypes.keyword, typeEnd, " property ".length);
					}
					//else {
					//	context.addDiagnostic(0, context.currentString.length, "property type not recognized");
					//}
				}
				else {
					addKeywordToken = false;
					const result = this.detectPatternsRecursively(context, [PatternType.event]);
					//const pattern = this.getPatternData(new SkriptPatternCall(context.currentString, PatternType.event), stopAtFirstResultProcessor);
					if (result.detectedPattern) {
						//event
						s = new SkriptEventListenerSection(context, result.detectedPattern);
					}
					//else we can't recognise this section. message will be handled elsewhere.
				}
			}
		}
		if ((patternStartIndex != undefined) && (s instanceof ReflectPatternContainerSection)) {
			s.addPattern(context.push(patternStartIndex));
			//const currentPatternType = (
			//	(s instanceof SkriptEventSection) ? PatternType.event :
			//	(s instanceof SkriptTypeSection) ? PatternType.type :
			//	PatternType.effect);
			//this.addPattern(context.push(patternStartIndex), s, currentPatternType);
		}
		if (addKeywordToken)
			context.addToken(TokenTypes.keyword, 0, sectionKeyword.length);
		return s;
	}

	processLine(context: SkriptContext): void {
		context.addDiagnostic(0, context.currentString.length, "can't understand this line (colon or indentation missing?");
	}


	static trimLineWithoutComments(line: string): { trimmedLine: string, commentIndex: number } {
		let currentDelimiters = "";
		let commentIndex = -1;
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if ('"%'.includes(char)) {
				if (currentDelimiters.length > 0 && currentDelimiters[currentDelimiters.length - 1] == char) {
					currentDelimiters = currentDelimiters.substring(0, currentDelimiters.length - 1);
				} else
					currentDelimiters += line[i];
			}
			else if (char === '#' && currentDelimiters.length == 0) {
				commentIndex = i; break;
			}
		}
		//remove comments and space from the right
		//const commentIndex = line.search(
		//	//there can't be a < in front of a # because then it might be a hex color
		//	/(?<![#\<])#(?!#)/
		//);
		const lineWithoutComments = commentIndex == -1 ? line : line.substring(0, commentIndex);
		return { trimmedLine: lineWithoutComments.trim(), commentIndex: commentIndex };
	}


	static validateCodeLine(context: SkriptContext, section: SkriptSection, indentData: IndentData): SkriptContext {
		const sectionContext = context.push(0,
			indentData.hasColon ? context.currentString.length - 1 : undefined);
		sectionContext.currentSection = section;
		sectionContext.parseResult = new ParseResult();

		if (indentData.hasColon) {
			//indent
			sectionContext.parseResult.newSection = sectionContext.currentSection.createSection(sectionContext);
			if (sectionContext.parseResult.newSection == undefined) {
				sectionContext.addDiagnostic(0, sectionContext.currentString.length, 'can\'t recognise this section. (pattern detection is a work in progress. please report on discord)', DiagnosticSeverity.Hint, "IntelliSkript->Section->Not Recognised");
			}
		}
		else {
			//context.currentString = trimmedLine;
			sectionContext.currentSection.processLine(sectionContext);
			//context.currentSection.endLine = context.currentLine;
		}
		return sectionContext;
	}

	async validate() {
		//clear old data
		this.scope = new Scope(this.parent.getScope());
		this.matches = new SkriptPatternMatchHierarchy();
		//create reference to builder
		this.parseResult = new ParseResult(this.builder);
		this.options = [];
		this.children = [];
		//dependencies are handled by the workspace
		const context = new SkriptContext(this);
		context.currentSection = this;
		this.builder.startNextBuild(this.document);

		/**we need to include the line breaks. to do that, we split using a positive lookbehind.
		to avoid splitting in two separate delimiters when a document has both \r\n, a negative lookahead is added to check for \n
		the last line doesn't have \r\n at the end.*/
		const terminatedLines = this.text.split(LineTerminatorRegExp);

		this.suggestedIndentation = new Array<number>(terminatedLines.length);

		const currentSections: SkriptSection[] = [];
		currentSections[0] = this;


		let currentLineIndex = 0;
		let currentLineStartPosition = 0;

		let inMultiLineComment = false;

		/**the index of the last line which contained code, so no lines with comments */
		let lastCodeLine = -1;

		const indentData = new IndentData();

		const currentSettings = await currentServer.getDocumentSettings(this.uri.toString());

		function popStacks(stacksToPop: number) {
			if (stacksToPop > 0) {
				const startLine = context.currentSection.startLine;
				if (startLine == (currentLineIndex - 1)) {
					context.addDiagnosticAbsolute({
						start: { line: startLine, character: 0 },
						end: { line: startLine, character: terminatedLines[startLine].length }
					}, "empty section (expected something here)", DiagnosticSeverity.Warning, "IntelliSkript->Indent->Empty");
				}
				for (let i = 0; i < stacksToPop; i++) {
					const parent = context.currentSection.getParentSection();
					if (parent) {
						context.currentSection.endLine = lastCodeLine;// currentLineIndex;
						context.currentSection.finish(context);
						context.currentSection = parent;
					}
					else break;
				}
			}
		}

		while (currentLineIndex < terminatedLines.length) {
			//the current line, including line break
			const currentLineTerminated = terminatedLines[currentLineIndex];
			const terminatorIndex = currentLineTerminated.search(/[\r\n]/g);
			const currentLine = terminatorIndex == -1 ? currentLineTerminated : currentLineTerminated.substring(0, terminatorIndex);
			const currentLineContext = context.push(currentLineStartPosition, currentLine.length);
			currentLineContext.currentLine = currentLineIndex;

			let wasInMultiLineComment = inMultiLineComment;
			if (currentLine == "###") inMultiLineComment = !inMultiLineComment;
			if (inMultiLineComment || wasInMultiLineComment) {
				currentLineContext.addToken(TokenTypes.comment);
			}
			else {


				const trimInfo = SkriptFile.trimLineWithoutComments(currentLine);

				const trimmedLine = trimInfo.trimmedLine;

				if (trimmedLine.length > 0) {
					indentData.nextLine(currentLineContext);
					indentData.hasColon = trimmedLine.endsWith(":");
					//process indentation
					//context.currentPosition = currentLineStartPosition + indentationEndIndex;
					//removed indentation and comments
					const trimmedContext = currentLineContext.push(indentData.endIndex, trimmedLine.length);

					let mostValidContext: SkriptContext | undefined;

					const checkSection = (section: SkriptSection): boolean => {
						let validatedContext: SkriptContext;
						try {
							validatedContext = SkriptFile.validateCodeLine(trimmedContext, section, indentData);
						}
						catch (exception) {
							let errorMessage;
							if (exception instanceof Error) {
								errorMessage = `Name: ${exception.name}\nMessage:\n${exception.message}\nStack:\n${exception.stack ?? "unknown"}`;
							}
							else {
								errorMessage = `Unknown Error:\n${String(exception)}`;
							}
							throw new Error(`\nwhile validating line ${currentLineIndex} of ${this.document.uri}:\n` + errorMessage);
						}
						const parsedCorrectly = validatedContext.parseResult.diagnostics.length == 0;
						//first we check the expected section, so the most validcontext will be undefined at this point
						if (!mostValidContext
							//when this indentation results in correct parsing, we make this the most valid context
							|| parsedCorrectly) mostValidContext = validatedContext;
						return parsedCorrectly;
					}

					let expectedSection = trimmedContext.currentSection;

					const expectedStacksToPop = indentData.expected - indentData.mostValid;


					//check different indentation offsets
					//first check the expected indentation, then go back from top to bottom,
					//skipping the expected indentation offset and duplicate types. (duplicate types todo)
					for (let i = 0; i < expectedStacksToPop; i++) {
						const parent = expectedSection.getParentSection();
						if (parent)
							expectedSection = parent;
						else {
							//popping too much stacks

							break;
						}
					}


					if (!checkSection(expectedSection)) {
						/**use this set to make sure we don't check the same type of section two times (in most cases, it's just a huge performance drain) */
						//we won't check for a pattern section, because that would be 'cheating', as almost no validation will be done there.
						//'not good? ok, let me convert it to a pattern'
						const passedTypes = new Set<string>([ReflectPatternSection.name, expectedSection.constructor.name]);
						expectedSection = trimmedContext.currentSection;
						let newMostValid = indentData.expected;
						//loop over other possibilities, starting by the max indent possible at the moment and decrementing to the minimum
						while (true) {
							const constructorName = expectedSection.constructor.name;
							if (!passedTypes.has(constructorName)) {
								if (checkSection(expectedSection)) {
									indentData.mostValid = newMostValid;
									break;
								}
								passedTypes.add(constructorName);
							}

							const parent = expectedSection.getParentSection();
							if (parent) {
								newMostValid--;
								expectedSection = parent;
							}
							else
								break;
						}
					}

					const stacksToPop = indentData.expected - indentData.mostValid;

					popStacks(stacksToPop);
					//for debugger
					if (mostValidContext) {

						//merge parse result
						this.builder.addLine(mostValidContext.parseResult.tokens as SemanticTokenLine)
						this.parseResult.diagnostics.push(...mostValidContext.parseResult.diagnostics);

						//expectedIndentationCount = currentinden
						if (indentData.hasColon) {
							//when the no section was able to be created, create a new skriptsection
							const newSection = mostValidContext.parseResult.newSection ?? new SkriptSection(mostValidContext.currentSection, mostValidContext);
							context.currentSection?.children.push(newSection);
							context.currentSection = newSection;
						}
						//add patterns to scope
						for (const [scope, pattern] of mostValidContext.parseResult.newPatterns) {
							scope.addPattern(pattern);
						}

						this.parseResult.frequencyMatrix.push(mostValidContext.parseResult.frequencyMatrix);
						indentData.finishLine();
						if (indentData.current != indentData.correct) {
							currentLineContext.addDiagnostic(0, indentData.current, "this line works when adjusting indentation. press ctrl + F to fix", DiagnosticSeverity.Information, "IntelliSkript->Indent->Amount")
						}
					}
					//empty lines and comments should indentate like the lines below them
					for (let suggestIndex = lastCodeLine + 1; suggestIndex <= currentLineIndex; suggestIndex++) {
						this.suggestedIndentation[suggestIndex] = indentData.correct;
					}
					lastCodeLine = currentLineIndex;
				}


				if (trimInfo.commentIndex != -1) {
					currentLineContext.addToken(TokenTypes.comment, trimInfo.commentIndex, currentLine.length - trimInfo.commentIndex);
				}
			}
			currentLineIndex++;
			currentLineStartPosition += currentLineTerminated.length;
		}
		popStacks(indentData.correct);

		//the file is updated! set outdated to false
		this.validated = true;
	}

	constructor(parent: SkriptFolder | SkriptWorkSpace, document: TextDocument) {
		super(parent, undefined);
		this.document = document;
		this.text = document.getText();
		this.builder = new UnOrderedSemanticTokensBuilder(this.document);
		this.parent = parent;
		this.scope = new Scope(parent.getScope());
		this.uri = URI.parse(document.uri);
	}
	toString(): string {
		const uri = this.document.uri;
		//uri will always have the same \ method, no matter what platform the coder is on
		return uri.substring(uri.lastIndexOf("/"));
	}
	format(): TextEdit[] {
		const edits: TextEdit[] = [];
		//loop over all lines and see what makes sense to do.
		//replace all spaces with tabs for now
		//when we find something which is probably the start of a new block like 'expression' or 'property', we set the recommended index to 0.
		//inside of functions, we don't modify indentation as long as it's safe (you may indentate 2 tabs backward, but not forward for example)
		const lines = this.text.split('\n');
		for (const [index, line] of lines.entries()) {
			const currentIndentationLength = IndentData.getIndentationEndIndex(line);
			const trimInfo = SkriptFile.trimLineWithoutComments(line);
			const currentIndentation = line.substring(0, currentIndentationLength);
			const recommendedIndentation = '\t'.repeat(this.suggestedIndentation[index]);
			if (currentIndentation != recommendedIndentation) {
				edits.push(TextEdit.replace(Range.create({ line: index, character: 0 }, { line: index, character: currentIndentation.length }), recommendedIndentation));
			}
			if (trimInfo.commentIndex != -1) {
				//also format comments. make sure every comment has some space after the '#'. when it hasn't, a single space is inserted.
				const charBehindHashtag = line[trimInfo.commentIndex + 1];
				if (charBehindHashtag != undefined && charBehindHashtag.match(/\S/)) {
					edits.push(TextEdit.insert({ line: index, character: trimInfo.commentIndex + 1 }, " "));
				}
			}
		}
		return edits;
	}
	getLineIndexRange(lineIndex: number): { start: number, end: number } {
		const startPos = { line: lineIndex, character: 0 };
		const startOffset = this.document.offsetAt(startPos);
		consumingLineTerminatorRegexp.lastIndex = startOffset;
		const match = consumingLineTerminatorRegexp.exec(this.text);

		const endOffset = match?.index ?? this.text.length;
		consumingLineTerminatorRegexp.lastIndex = 0;
		return { start: startOffset, end: endOffset };
	}
	getLineContext(lineIndex: number): SkriptContext {
		const lineRange = this.getLineIndexRange(lineIndex);
		const context = new SkriptContext(this, this.text.substring(lineRange.start, lineRange.end));
		context.currentPosition = lineRange.start;
		context.currentLine = lineIndex;
		return context;
	}
}