export class ObjectPool<T extends { active: boolean }> {
  private readonly items: T[];

  constructor(size: number, factory: () => T) {
    this.items = Array.from({ length: size }, factory);
  }

  acquire(): T | null {
    const item = this.items.find((candidate) => !candidate.active) ?? null;
    if (item) item.active = true;
    return item;
  }

  active(): T[] {
    return this.items.filter((item) => item.active);
  }

  clear() {
    this.items.forEach((item) => { item.active = false; });
  }
}
