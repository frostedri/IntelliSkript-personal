import { PatternData, TypeData } from '../../../Pattern/data/pattern-data';
import { PatternTree } from '../../../Pattern/pattern-tree';
import { PatternType } from '../../../Pattern/pattern-type';
import { SkriptTypeState } from '../../storage/type/skript-type-state';
import { SkriptContext } from '../../validation/skript-context';
import { SkriptSection } from '../skript-section/skript-section';
import { ReflectExpressionSection } from './reflect-expression-section';

export class ReflectPropertySection extends ReflectExpressionSection {
	propertyParentType: TypeData;
	constructor(parent: SkriptSection, context: SkriptContext, propertyParentType: TypeData,) {
		super(parent, context);
		this.propertyParentType = propertyParentType;
	}
	override addPattern(context: SkriptContext): void {
		const p = PatternTree.parsePattern(context, this, PatternType.expression);
		if (p) {

			const typeState = new SkriptTypeState(this.propertyParentType);
			//generate 2 patterns with this information
			//patterns will be "%'s position" and "position of %"
			const p1 = new PatternData("%'s " + p.skriptPatternString, "%'s " + p.regexPatternString, p.definitionLocation, PatternType.expression, this, [typeState, ...p.expressionArguments]);
			const p2 = new PatternData(p.skriptPatternString + " of %", p.regexPatternString + " of %", p.definitionLocation, PatternType.expression, this, [...p.expressionArguments, typeState]);

			context.parseResult.newPatterns.push([this.scope, p1], [this.scope, p2]);
		}
	}
}