import { Awaitable } from "./types";

export type DelegateFn<T_Args> = (args: T_Args) => Awaitable<void>;
export default class Delegate<T_Args> {
  private fns: DelegateFn<T_Args>[] = [];

  public add(fn: DelegateFn<T_Args>) {
    this.fns.push(fn);
  }

  public async run(args: T_Args) {
    for (const fn of this.fns) {
      try {
        await fn(args);
      } catch (e) {
        console.log(e);
      }
    }
  }
}
