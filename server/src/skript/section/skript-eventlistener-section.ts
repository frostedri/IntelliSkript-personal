import { PatternData } from "../../Pattern/data/pattern-data";
import { Scope } from '../../Pattern/Scope';
import { SkriptContext } from '../validation/skript-context';
import { ReflectEventSection } from './reflect/reflect-event-section';
import { SkriptSection } from './skript-section/skript-section';

export class SkriptEventListenerSection extends SkriptSection {
	scope: Scope;
	eventPattern: PatternData;
	constructor(context: SkriptContext, eventPattern: PatternData) {
		super(context.currentSkriptFile, context);
		this.eventPattern = eventPattern;
		this.scope = new Scope(context.currentSkriptFile.scope);
		const s = this.eventPattern.section as ReflectEventSection;
		if (s.eventValues)
			for (let i = 0; i < s.eventValues.length; i++) {
				this.scope.addPattern(s.eventValues[i]);
			}
	}
}