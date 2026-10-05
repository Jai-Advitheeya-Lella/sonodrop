import { mkdirSync, promises as fs, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Small JSON file store: synchronous reads, debounced atomic writes. */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly file: string,
    fallback: T
  ) {
    mkdirSync(dirname(file), { recursive: true })
    try {
      this.data = { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) }
    } catch {
      this.data = fallback
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, 400)
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const json = JSON.stringify(this.data)
    this.writing = this.writing
      .then(async () => {
        const tmp = `${this.file}.tmp`
        await fs.writeFile(tmp, json)
        await fs.rename(tmp, this.file)
      })
      .catch((err) => console.error(`[store] failed to write ${this.file}`, err))
    return this.writing
  }

  /** For shutdown, when there is no time left to await. */
  flushSync(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    try {
      writeFileSync(this.file, JSON.stringify(this.data))
    } catch (err) {
      console.error(`[store] failed to write ${this.file}`, err)
    }
  }
}
