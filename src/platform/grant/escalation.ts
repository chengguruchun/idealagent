export interface EscalationContext {
  amount: number;
  count: number;
}

const RULE = /^([a-zA-Z]+)\s*(>=|<=|>|<|==)\s*(-?\d+(?:\.\d+)?)$/;

/**
 * 受限表达式，只支持 `字段 运算符 数字`。
 * 不用 eval：授权规则是安全边界，不能允许任意代码执行。
 */
export function matchEscalation(
  rules: string[],
  ctx: EscalationContext,
): { rule: string; reason: string } | null {
  for (const rule of rules) {
    const parsed = RULE.exec(rule.trim());
    if (!parsed) {
      return { rule, reason: `无法解析的升级规则，按需要审批处理: ${rule}` };
    }
    const [, field, op, literal] = parsed;
    if (!(field in ctx)) {
      return { rule, reason: `升级规则引用了未知字段: ${field}` };
    }
    const left = ctx[field as keyof EscalationContext];
    const right = Number(literal);
    if (compare(left, op, right)) {
      return { rule, reason: `命中升级规则 ${rule}（实际 ${field}=${left}）` };
    }
  }
  return null;
}

function compare(left: number, op: string, right: number): boolean {
  switch (op) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "==":
      return left === right;
    default:
      return false;
  }
}
