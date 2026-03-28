import { PatternData } from '../../Pattern/data/pattern-data';
import { PatternType } from '../../Pattern/pattern-type';
import { Scope } from '../../Pattern/Scope';
import { SkriptTypeState } from '../storage/type/skript-type-state';
import { SkriptContext } from '../validation/skript-context';
import { SkriptSection } from './skript-section/skript-section';

export class SkriptLoopSection extends SkriptSection {
	constructor(parent: SkriptSection, context: SkriptContext) {
		super(parent, context);
		//const loopValueContext = context.push("loop ".length);
		const pattern = this.detectPatternsRecursively(context, [PatternType.expression]);
		let result = pattern.detectedPattern?.returnType;
		if (!result) {
			const unknownData = this.getTypeData('unknown');
			result = unknownData ? new SkriptTypeState(unknownData) : new SkriptTypeState();
		}
		this.scope = new Scope(parent.getScope());
		this.scope.addPattern(new PatternData("[the] loop-value", "(the )?loop-value", context.getLocation(), PatternType.expression, undefined, [], [], result));
	}

}