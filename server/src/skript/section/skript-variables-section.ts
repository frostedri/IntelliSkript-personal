import { PatternType } from "../../Pattern/pattern-type";
import { TokenModifiers } from "../../token-modifiers";
import { TokenTypes } from "../../token-types";
import { SkriptContext } from "../validation/skript-context";
import { SkriptSection } from "./skript-section/skript-section";

export class SkriptVariablesSection extends SkriptSection{
	processLine(context: SkriptContext): void {
		const parts = context.currentString.split(/ = /);
		context.addToken(TokenTypes.variable, 0, parts[0].length, TokenModifiers.definition);
		this.detectPatternsRecursively(context.push(context.currentString.length - parts[1].length), [PatternType.expression]);
	}
}