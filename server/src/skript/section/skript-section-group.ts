import { Hierarchy } from '../../Hierarchy';
import { Scope } from '../../Pattern/Scope';
import { SkriptVariable } from '../storage/skript-variable';

export class SkriptSectionGroup extends Hierarchy<SkriptSectionGroup> {
	scope?: Scope;
	definedVariables: SkriptVariable[] = [];
	override children: SkriptSectionGroup[] = [];
	constructor(parent?: SkriptSectionGroup) {
		super(parent);
	}

	getVariableByName(_name: string): SkriptVariable | undefined {
		//throw new Error("skriptsectiongroup without derivation");
		return undefined;
	}


	/**
	 * returns the pattern tree of this pattern matcher, which should be set as the parent of any pattern tree of children.
	 */
	getScope(): Scope | undefined {
		return this.scope ?? this.parent?.getScope();
	}
}