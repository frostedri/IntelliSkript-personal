import { PatternType } from '../../../Pattern/pattern-type';
import { TokenTypes } from '../../../token-types';
import { SkriptContext } from '../../validation/skript-context';
import { SkriptSection } from '../skript-section/skript-section';
import { ReflectPatternContainerSection } from './reflect-pattern-container-section';

export class ReflectConditionSection extends ReflectPatternContainerSection {
	static patternType = PatternType.condition;
	createSection(context: SkriptContext): SkriptSection | undefined {
		const regex = /^(check|parse|usable in)$/;
		const result = regex.exec(context.currentString);
		const bool = this.getTypeData("boolean");
		if (bool) {
			this.returnType.possibleTypes.push(bool);
		}

		if (result) {
			context.addToken(TokenTypes.keyword, 0, context.currentString.length);
			return new SkriptSection(this, context);
		}
		else return super.createSection(context);
	}
}