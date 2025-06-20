export interface RegisteredObject {
  name: string | undefined;
  id: string;
  fields: Record<string, any>;
}

export class ObjectBatch {
  private objects: RegisteredObject[] = [];
  private maxSize: number;
  private maxAge: number;
  private lastFlush: number;

  constructor(maxSize = 500, maxAge = 30000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.lastFlush = Date.now();
  }

  add(obj: RegisteredObject): boolean {
    this.objects.push(obj);
    
    const shouldFlush = 
      this.objects.length >= this.maxSize ||
      (Date.now() - this.lastFlush) >= this.maxAge;
    
    return shouldFlush;
  }

  getObjects(): RegisteredObject[] {
    const objects = [...this.objects];
    this.objects = [];
    this.lastFlush = Date.now();
    return objects;
  }

  get size(): number {
    return this.objects.length;
  }
}