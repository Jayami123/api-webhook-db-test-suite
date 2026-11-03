/**
 * Gate for env-dependent cases (A2). Returns true when the variable holds a value of the expected shape.
 * Otherwise: in CI (CI set) it throws, naming the variable and never its value, so the job goes red;
 * locally it returns false and the caller skips with a named condition.
 */
export function requireDocKey(
  name: string,
  shape: RegExp,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[name]?.trim() ?? "";
  if (value.length > 0 && shape.test(value)) return true;
  if (env.CI) {
    throw new Error(
      `ENV: ${name} is ${value.length > 0 ? "not in the expected shape" : "not set"} in CI; the cases that need it cannot run`,
    );
  }
  return false;
}
