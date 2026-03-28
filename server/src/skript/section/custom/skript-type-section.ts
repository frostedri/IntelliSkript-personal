
import { PatternData } from '../../../Pattern/data/pattern-data';
import { PatternTree } from '../../../Pattern/pattern-tree';
import { PatternType } from "../../../Pattern/pattern-type";
import { TokenTypes } from '../../../token-types';
import { SkriptContext } from '../../validation/skript-context';
import { ReflectPatternContainerSection } from '../reflect/reflect-pattern-container-section';
import { SkriptSectionGroup } from '../skript-section-group';
export class SkriptTypeSection extends ReflectPatternContainerSection {
    baseClasses: SkriptTypeSection[] = [];
    patterns: PatternData[] = [];

    constructor(parent: SkriptSectionGroup, context: SkriptContext) {
        super(parent, context);
        //if (this.patterns[0]?.skriptPatternString != 'object[s]') {
        //    const objectType = this.getTypeData('object')?.section;
        //    if (objectType)
        //        this.baseClasses.push(objectType as SkriptTypeSection);
        //}
    }
    override processLine(context: SkriptContext): void {
        if (context.currentString.startsWith('inherits: ')) {
            let currentPosition = "inherits: ".length;
            context.addToken(TokenTypes.keyword, 0, currentPosition);
            const baseClassNames = context.currentString.substring(currentPosition).split(", ");
            for (const currentBaseClassName of baseClassNames) {
                const pattern = this.parseType(context, currentPosition, currentBaseClassName.length);
                if (pattern) {
                    this.baseClasses.push(pattern.section as SkriptTypeSection);
                }

                currentPosition += currentBaseClassName.length + ", ".length;
            }
        }
        else {
            return super.processLine(context);
        }
    }
    override addPattern(context: SkriptContext): void {
        const pattern = PatternTree.parsePattern(context, this, PatternType.type);
        if (pattern) {
            this.patterns.push(pattern);
            context.currentSkriptFile.addPattern(pattern);
        }
    }
    getKey(): string {
        return this.patterns[0]?.skriptPatternString ?? "";
    }
    instanceOf(otherType: PatternData): boolean {
        if (otherType.regexPatternString == "object(s)?") {
            return true;//everything inherits from object
        }
        else if (otherType.section == this) {
            return true;
        }
        else {
            for (const baseClass of this.baseClasses) {
                //direct inheritance

                if (baseClass.instanceOf(otherType)) {
                    return true;
                }

            }
            return false;
        }
    }
    testBaseClasses(testFunction: (testKey: string) => void, testedTypes: Set<string> = new Set<string>()): boolean {
        if (!testedTypes.has(this.patterns[0]?.skriptPatternString)) {
            testFunction(this.getKey());
            testedTypes.add(this.patterns[0]?.skriptPatternString);

            for (const baseClass of this.baseClasses) {
                baseClass.testBaseClasses(testFunction, testedTypes);
            }
        }
        return false;
    }
}