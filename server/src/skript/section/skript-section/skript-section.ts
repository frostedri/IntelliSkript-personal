import { DiagnosticSeverity, integer, Location } from 'vscode-languageserver/browser';
import { SkriptNestHierarchy } from '../../../nesting/skript-nest-hierarchy';
import { PatternData, TypeData } from '../../../Pattern/data/pattern-data';
import { PatternType } from "../../../Pattern/pattern-type";
import { SkriptPatternCall } from '../../../Pattern/skript-pattern';
import { TokenModifiers } from '../../../token-modifiers';
import { TokenTypes } from '../../../token-types';
import { SkriptVariable } from '../../storage/skript-variable';
import { SkriptTypeState } from '../../storage/type/skript-type-state';
import { SkriptContext } from '../../validation/skript-context';
import { SkriptSectionGroup } from '../skript-section-group';
import { TransformedPattern } from './pattern-to-line-transform';
//const variablePattern = /\{(.*)\}/g;
//IMPORT BELOW TO AVOID CIRCULAR DEPENDENCIES

//declare class SkriptConditionSection extends SkriptSection {
//	constructor(parent: SkriptSection, context: SkriptContext);
//}
//declare function createBasicSection(context: SkriptContext, parentSection: SkriptSection): SkriptSection;
export class SkriptSection extends SkriptSectionGroup {
	static readonly patternType: PatternType = PatternType.condition;
	startLine: number;
	endLine: number;
	override children: SkriptSection[] = [];

	constructor(parent: SkriptSectionGroup, context?: SkriptContext) {
		super(parent);
		this.startLine = context?.currentLine ?? 0;
		this.endLine = this.startLine;
	}

	/**
	 * this function will be called when the full section is parsed. it's used to add the patterns of pattern container sections, for example
	 */
	finish(_context: SkriptContext) {

	}

	//go up first, then iterate downwards
	override getVariableByName(name: string): SkriptVariable | undefined {
		for (const variable of this.definedVariables) {
			if (variable.overlap(name))//regexes overlap, could be the same variable
			{
				return variable;
			}
		}
		if (this.parent != undefined) {
			return this.parent.getVariableByName(name);
		}
		return undefined;
	}

	addVariableReference(referenceLocation: Location, name: string): SkriptVariable {
		const existingVariable = this.getVariableByName(name);
		if (existingVariable) {
			return existingVariable;
		}
		else {
			const newVariable = new SkriptVariable(referenceLocation, name);
			this.definedVariables.push(newVariable);
			return newVariable;
		}
	}

	getTypeData(typeName: string): TypeData | undefined {
		return this.getScope()?.getPatternMatch(new SkriptPatternCall(typeName, [PatternType.type]))?.fullMatch.matchedPattern;
	}
	getParentSection(): SkriptSection | undefined {
		return this.parent && this.parent instanceof SkriptSection ?
			this.parent :
			undefined;
	}

	/**expects start and length! */
	parseType(context: SkriptContext, start = 0, length = context.currentString.length - start): TypeData | undefined {
		const data = this.getTypeData(context.currentString.substring(start, start + length));
		if (data) {
			context.addPatternMatch(data, start, start + length);
		}
		else {
			context.addDiagnostic(start, length, "cannot recognize type", DiagnosticSeverity.Error);
		}
		context.addToken(TokenTypes.type, start, length, ...(data ? [] : [TokenModifiers.deprecated]));
		return data;
	}

	/**will add a type token! */
	parseTypes(context: SkriptContext, start = 0, length = context.currentString.length - start): SkriptTypeState {
		const str = context.currentString.substring(start, start + length);
		const result = new SkriptTypeState();
		let parts: string[];
		let currentPosition = start;
		if (str[0] == '*') {
			result.staticOnly = true;
			currentPosition++;
			parts = str.substring(1).split('/');
		}
		else if (str[0] == '-') {
			result.canBeEmpty = true;
			currentPosition++;
			parts = str.substring(1).split('/');
		}
		else {
			parts = str.split('/');
		}
		for (let i = 0; i < parts.length; currentPosition += (parts[i].length + '/'.length), i++) {
			const modifiers: TokenModifiers[] = [];
			let typePattern: TypeData | undefined;
			if (parts[i].endsWith('s')) {
				const singleType = parts[i].substring(0, parts[i].length - 1);
				typePattern = this.getTypeData(singleType);
				if (typePattern) {
					result.isArray = true;
				}
			}
			if (!typePattern)
				typePattern = this.getTypeData(parts[i]);
			//error 'type not recognized' has been added by the getPatternData function already

			if (typePattern) {
				result.possibleTypes.push(typePattern);
				context.addPatternMatch(typePattern, currentPosition, currentPosition + parts[i].length);
			} else
				modifiers.push(TokenModifiers.deprecated);

			context.addToken(TokenTypes.type, currentPosition, parts[i].length, ...modifiers);
			//else {
			//	//error 'type not recognized' has been added by the getPatternData function already
			//	return undefined;
			//}
		}
		return result;
	}

	/**
	 *
	 * @param context
	 * @param pattern
	 * @param match
	 * @param matchPatternStart the start of the match, relative to the pattern
	 * @param matchPatternEnd the end of the match, relative to the pattern
	 */
	private tokenizeMatch(context: SkriptContext, pattern: TransformedPattern, match: PatternData, matchPatternStart: integer = 0, matchPatternEnd: integer = pattern.pattern.length) {
		const tokenType: TokenTypes = TokenTypes[PatternType[match.patternType] as keyof typeof TokenTypes];//match.section instanceof SkriptPropertySection ?

		/**the point in the pattern to start tokenizing from. will move to the end of submatches if there are any*/
		let tokenizeFrom = matchPatternStart;
		/**the last found position of a '%' */
		let subMatchPatternPos = -1;

		while (true) {
			// send % to % parsed as % <-- match for '% parsed as %'
			// add tokens for each part of the pattern that wasn't replaced already (aka passed as '%')
			// tokenize ' parsed as '
			// start = 10

			//we can't just use the keypoints, because we'll never know if we will replace something else using keypoints, or if a submatch was of length 1.
			//so instead, let's tokenize everything which isn't a '%'
			subMatchPatternPos = pattern.pattern.indexOf('%', subMatchPatternPos + 1);
			//there is no new submatch within our reach
			if (subMatchPatternPos == -1 || subMatchPatternPos > matchPatternEnd) break;
			const tokenLength = subMatchPatternPos - tokenizeFrom;
			if (tokenLength >= 0) {
				const subMatchLinePos = pattern.getLinePos(subMatchPatternPos);
				if (context.currentString[subMatchLinePos] != '%') {
					//this is not a real, but a replaced '%'
					if (tokenLength > 0) {
						//tokenize the submatch
						context.addToken(tokenType, pattern.getLinePos(tokenizeFrom), tokenLength);
					}
					tokenizeFrom = subMatchPatternPos + 1;
				}
			}
		}
		if (matchPatternEnd > tokenizeFrom)
			//finally, tokenize the part of the match that wasn't tokenized yet
			context.addToken(tokenType, pattern.getLinePos(tokenizeFrom), matchPatternEnd - tokenizeFrom);
	}

	/**visualizes matches recursively */
	private visualizeMatch(context: SkriptContext, pattern: TransformedPattern, currentMatch: PatternMatch) {
		let currentPatternPos = currentMatch.start;
		const separatorWidth = 1;
		for (const subMatch of currentMatch.children) {
			const segmentEnd = subMatch.start - separatorWidth;
			const distance = segmentEnd - currentPatternPos;
			if (distance > 0) {
				this.tokenizeMatch(context, pattern, currentMatch.matchedPattern, currentPatternPos, segmentEnd);
			}
			this.visualizeMatch(context, pattern, subMatch);
			currentPatternPos = subMatch.end + separatorWidth;
		}
		const distance = currentMatch.end - currentPatternPos;
		if (distance > 0) {
			this.tokenizeMatch(context, pattern, currentMatch.matchedPattern, currentPatternPos, currentMatch.end);
		}
		context.addPatternMatch(currentMatch.matchedPattern, pattern.getLinePos(currentMatch.start), pattern.getLinePos(currentMatch.end));
	}

	//detect patterns like a [b | c]
	//return value: a type. basically, it will convert each subpattern into a result type (a %)
	detectPatternsRecursively(context: SkriptContext, mainPatternTypes: PatternType[] = [PatternType.effect, PatternType.condition], isTopNode = true, currentNode: SkriptNestHierarchy = context.getHierarchy(true)): { detectedPattern: PatternData | undefined } {
		let foundPattern: PatternData | undefined;
		const mergedPatternArguments: Map<number, SkriptTypeState> = new Map<number, SkriptTypeState>();
		//const currentNode = isTopNode ? context.createHierarchy(isTopNode) : context.hierarchy;

		//this transform will make errors and go-to-definition links appear at the right place
		const pattern = new TransformedPattern(context.currentString);

		//number types are defined too and just return 'number'. the only thing we're doing here is coloring the numbers differently.
		//detect numbers (like '2') and convert them to types (%)
		//const convertLiteralsToSymbols = ((lineStart: number, lineEnd: number) => {
		//	let m: RegExpMatchArray | null;
		//	const numberGlobalRegExp = new RegExp(IntelliSkriptConstants.NumberRegExp, "g");
		//	//let outString = '';
		//	//let lastPosition: integer = 0;
		//	while ((m = numberGlobalRegExp.exec(context.currentString.substring(lineStart, lineEnd)))) {
		//		//for the debugger
		//		if (m.index !== undefined) {
		//
		//			const numberData = this.getTypeData("number");
		//			if (numberData) {
		//				mergedPatternArguments.set(m.index, new SkriptTypeState(numberData));
		//				context.addToken(TokenTypes.number, pattern.getLinePos(lineStart + m.index), m[0].length);
		//			}
		//			pattern.replace(lineStart + m.index, lineStart + m.index + m[0].length);
		//			//replace with '%'
		//			//outString += input.substring(lastPosition, m.index) + '%';
		//			//pattern.keypoints.push({ patternPos: outString.length + m.index, linePos: start + m.index })
		//		}
		//	}
		//	//const booleanGlobalRegExp = new RegExp(IntelliSkriptConstants.BooleanRegExp, "g");
		//	//while ((m = booleanGlobalRegExp.exec(input))) {
		//	//	patternArguments.set(m.index, new SkriptTypeState(this.getTypeData("boolean")));
		//	//	context.addToken(TokenTypes.enum, start + m.index, m[0].length);
		//	//}
		//
		//	//const result = input.replace(numberGlobalRegExp, '%');
		//	//result = result.replace(booleanGlobalRegExp, '%');
		//	//return result;
		//});

		//loop over sentence and try to replace as much as possible
		//add the change value to {_test} -> add the change value to % -> add % to %

		//const results: TypeData[] = [];
		const childResultList: PatternData[] = new Array(currentNode.children.length);

		//first: process all child nodes
		for (let i = 0; i < currentNode.children.length; i++) {
			//for (const currentChild of currentNode.children) {
			const nodeToClone = currentNode.children[i];
			//make the hierarchy relative to the node
			const offsetNode = nodeToClone.cloneWithOffset(-nodeToClone.start);

			const childResults = this.detectPatternsRecursively(context.push(nodeToClone.start, nodeToClone.end - nodeToClone.start), [PatternType.expression], false, offsetNode);
			if (childResults.detectedPattern)
				childResultList[i] = childResults.detectedPattern;

		}
		//then process main node
		//will also return true if currentNode.character is ''
		if ('%('.includes(currentNode.delimiter)) {
			//let mergedPattern = '';
			//the position in the pattern
			//let currentPosition = currentNode.start;

			//pattern = pattern.replace(/\{.*\}/g, '%');

			for (let i = 0; i < currentNode.children.length; i++) {
				const child = currentNode.children[i];
				if ('"{('.includes(child.delimiter)) {//string or variable
					let typeToReplace: SkriptTypeState | undefined;
					if (child.delimiter == '(') {
						if (childResultList[i])
							typeToReplace = childResultList[i].returnType;
						else {
							//check if this is a function
							//search to the left (to where the name would end)
							const functionNameRegex = /(?:([a-zA-Z_]{1,})\.)?([a-zA-Z_][a-zA-Z0-9_]{1,})$/g;
							const functionNameEnd = child.start - 1;
							let match;
							if (match = functionNameRegex.exec(context.currentString.substring(0, functionNameEnd))) {
								const javaClass = match[1];
								const functionName = match[2];
								let functionPatternData = undefined;
								let returnTypeData = new SkriptTypeState();
								const functionCallStart = functionNameEnd - functionName.length;
								//TODO: search for functions
								if (javaClass) {
									context.addToken(TokenTypes.namespace, match.index, javaClass.length);

									let unKnownData = this.getTypeData("javaobject");
									if (unKnownData) returnTypeData.possibleTypes.push(unKnownData);
								}
								else {
									let matchingFunction = this.getScope()?.getMatchingFunction(functionName);
									if (!matchingFunction)
										//couldn't find a function with this name. let's just pass it 'raw'.
										continue;
									functionPatternData = matchingFunction.pattern;
									if (functionPatternData) {
										returnTypeData = functionPatternData?.returnType;
										context.addPatternMatch(functionPatternData, functionCallStart, child.end + 1);
									}
								}
								context.addToken(TokenTypes.function, functionCallStart, functionName.length);
								pattern.replace(match.index, child.end + 1);
								mergedPatternArguments.set(child.start, returnTypeData);
								continue;
							}
						}
					}
					else if (child.delimiter == '{') {
						//variable
						this.addVariableReference(context.getLocation(child.start, child.end - child.start), context.currentString.substring(child.start, child.end));
						//context.addToken(variable.isParameter ? TokenTypes.parameter : TokenTypes.variable, child.start, child.end - child.start);

					}
					else if (child.delimiter == '"') {
						const stringData = this.getTypeData("string");
						if (stringData)
							typeToReplace = new SkriptTypeState(stringData);
					}
					if (!typeToReplace) {
						const objectData = this.getTypeData("unknown");
						if (objectData) {
							typeToReplace = new SkriptTypeState(objectData);
						}
					}
					if (typeToReplace)
						mergedPatternArguments.set(child.start, typeToReplace);

					//convertLiteralsToSymbols(currentPosition, child.start);
					pattern.replace(child.start - 1, child.end + 1);
					//currentPosition = child.end + 1;
				}
			}
			//convertLiteralsToSymbols(currentPosition, currentNode.end);
			//now the merged pattern is complete.
			// example:
			// set {_belowLocation} to location of event-block
			// becomes:
			// set % to location of event-block



			//pattern arguments sorted by key (their offset)
			let currentPatternArguments = Array.from(mergedPatternArguments.entries()).
				sort(([keyA], [keyB]) => keyA - keyB).//sort
				map(([, value]) => value);//erase keys

			if (
				(currentPatternArguments.length == 1 && pattern.pattern.length == 1) &&
				//this pattern is just '%'
				(!isTopNode //we should pass it to the pattern detector above
					|| mainPatternTypes.includes(PatternType.effect) || mainPatternTypes.includes(PatternType.expression))//we don't have to evaluate anything
			) {

			}
			else {
				let doubleSpacesRegex = /(?:\s{2,}|[^\S ])/g;
				let nonWhiteSpaceMatchArray;
				while (nonWhiteSpaceMatchArray = doubleSpacesRegex.exec(pattern.pattern)) {
					let start = pattern.getLinePos(nonWhiteSpaceMatchArray.index);
					context.addDiagnostic(start, pattern.getLinePos(nonWhiteSpaceMatchArray.index + nonWhiteSpaceMatchArray[0].length) - start, 'Expected a single space here', DiagnosticSeverity.Warning, "IntelliSkript->Pattern->WhiteSpace");
				}
				let matchResult = undefined;
				const call = new SkriptPatternCall(pattern.pattern, mainPatternTypes, currentPatternArguments);
				context.parseResult.patternsParsed.push([call, currentNode.cloneWithOffset(context.currentPosition)]);

				//pass pattern by reference
				matchResult = this.getScope()?.getPatternMatch(call);// context, mainPatternType, pattern, currentPatternArguments);

				if (matchResult) {
					foundPattern = matchResult.fullMatch.matchedPattern;
					this.visualizeMatch(context, pattern, matchResult.fullMatch);
					context.parseResult.frequencyMatrix.addPassedNodes(matchResult.nodesPassed);
				}
				if (!matchResult && isTopNode) {
					context.addDiagnostic(currentNode.start, currentNode.end - currentNode.start, "can't understand this line (pattern detection is a work in progress. please report on discord)", DiagnosticSeverity.Hint, "IntelliSkript->Pattern");
				}
			}
		}
		//won't pass for '' because it's being handled above
		else if ('"{'.includes(currentNode.delimiter)) {
			const borderSize = currentNode.delimiter == '"' ? 1 : 0;
			const tokenType = currentNode.delimiter == '"' ? TokenTypes.string : TokenTypes.variable;
			let formatCodes: TokenModifiers[] = [];
			let colorCode: TokenModifiers[] = [];

			//just tokenize around the already processed child nodes
			let currentPosition = currentNode.start - borderSize;

			/**start to end!*/
			const tokenize = (start: integer, end: integer) => {
				if (currentNode.delimiter == '{') {
					context.addToken(tokenType, start, end - start);
				}
				else {
					//string
					//process string and read all bukkit color / format codes
					let lastIndex = start;
					for (let index = start; index < end; index++) {
						const currentChar = context.currentString[index];
						if (currentChar == '&' && index + 1 < end) {
							let nextChar = context.currentString[index + 1];
							if (/[0-9a-fl-or]/.test(nextChar)) {
								if (index > lastIndex) {
									context.addToken(tokenType, lastIndex, index - lastIndex, ...formatCodes, ...colorCode);
									lastIndex = index;
								}
								if (nextChar == 'r') {
									formatCodes = [];
									colorCode = [];
								}
								else {
									//we guarantee the compiler that it's one of the token modifiers
									const newModifier = TokenModifiers[("bukkit_" + nextChar) as keyof typeof TokenModifiers];
									if (/[0-9a-f]/.test(nextChar)) {
										//reset format codes, like in minecraft java edition.
										formatCodes = [];
										//prevent multiple color code modifiers
										colorCode = [newModifier];
									}
									else {
										if (!formatCodes.includes(newModifier)) {
											//prevent duplicate format codes
											formatCodes.push(newModifier);
										}
									}
								}
							}
						}
						//double #
						else if (currentChar == "#" && context.currentString[index + 1] == "#") {
							context.addDiagnostic(index, 2, "double #s don't get replaced to single #s anymore", DiagnosticSeverity.Warning, "IntelliSkript->Nest->Double Hashtags");
						}
					}
					//we can guarantee there will be something to tokenize here, at least 3 tokens (when the string ends with &c" )
					context.addToken(tokenType, lastIndex, end - lastIndex, ...formatCodes, ...colorCode);
				}
			}

			for (let i = 0; i < currentNode.children.length; i++) {
				{
					//we don't have to do anything with the results of the children (the %%'es)
					const child = currentNode.children[i];
					tokenize(currentPosition, child.start);
					currentPosition = child.end;
				}
			}
			tokenize(currentPosition, currentNode.end + borderSize);
		}
		return { detectedPattern: foundPattern };
	}

	processLine(context: SkriptContext): void {

		//let p: RegExpExecArray | null;
		//detect all variables in this line and create a hierarchy of for example opening and closing braces:
		// hi[er(ar|ch)]y
		this.detectPatternsRecursively(context);
		//const results = this.detectPatternsRecursively(context, context.hierarchy);
		////start fitting all the results in a hierarchy
		//if (results.length) {
		//	const h = new SkriptPatternMatchHierarchy(0, context.currentString.length);
		//	for (const result of results) {
		//		//this method assumes that nodes don't overlap
		//		const parentNode = h.getDeepestChildNodeAt(result.start);
		//		parentNode.children.push(result);
		//	}
		//	context.currentSkriptFile?.matches.children.push(h);
		//}


	}
	createSection(context: SkriptContext): SkriptSection | undefined {
		const checkPattern = /check \[(?!\()/g;
		let p: RegExpExecArray | null;
		//let isIfStatement = false;
		while ((p = checkPattern.exec(context.currentString))) {
			const braceEndIndex = p.index + "check [".length;
			const node = context.hierarchy?.getChildNodeAt(braceEndIndex); // without the brace because we need to check the brace
			if (node && node.start == braceEndIndex) {
				context.addDiagnostic(
					p.index + "check [".length,
					node.end - node.start,
					`add braces around here to increase skript(re) load performance`, DiagnosticSeverity.Information, "IntelliSkript->Performance->Braces->Lambda");
				//isIfStatement = true;
			}
		}


		if (context.currentString.startsWith("loop ")) {
			context.addToken(TokenTypes.keyword, 0, "loop ".length);
			return new SkriptLoopSection(this, context.push("loop ".length));
		}
		let section = new SkriptConditionSection(this, context);
		const ifStatementStartPatterns: string[] = ['if ', 'else if '];
		for (const pattern of ifStatementStartPatterns) {
			if (context.currentString.startsWith(pattern)) {
				context.addToken(TokenTypes.keyword, 0, pattern.length);
				section.detectPatternsRecursively(context.push(pattern.length), [PatternType.condition]);
				return section;
			}
		}
		if (context.currentString == 'else') {
			context.addToken(TokenTypes.keyword, 0, 'else'.length);
		}
		else {
			const result = section.detectPatternsRecursively(context, [PatternType.condition]);
			if (!result.detectedPattern) return undefined;
		}
		//try to find a (condition) pattern
		return section;

	}
	getExactSectionAtLine(line: number): SkriptSection {
		const childSection = this.getChildSectionAtLine(line);
		return childSection == undefined ? this : childSection.getExactSectionAtLine(line);
	}
	getChildSectionAtLine(line: number): SkriptSection | undefined {
		for (let i = 0; i < this.children.length; i++) {
			if (line >= this.children[i].startLine && line <= this.children[i].endLine) {
				return this.children[i];
			}
		}
		return undefined;
	}
}

import { PatternMatch } from '../../../Pattern/match/pattern-match';
import { SkriptLoopSection } from '../skript-loop-section';

export class SkriptConditionSection extends SkriptSection {
	constructor(parent: SkriptSection, context: SkriptContext) {
		super(parent, context);
	}

}