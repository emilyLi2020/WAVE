const SENTENCE_END_PATTERN = /[.!?]["')\]]?\s+/;
const SOFT_BOUNDARY_PATTERN = /[,;:]\s+/g;
const DEFAULT_WORD_THRESHOLD = 12;

export class SentenceChunkBuffer {
  private buffer = "";

  constructor(private readonly wordThreshold = DEFAULT_WORD_THRESHOLD) {}

  push(delta: string): string[] {
    this.buffer += delta;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(force: boolean): string[] {
    const chunks: string[] = [];

    while (this.buffer.trim().length > 0) {
      const sentenceEndIndex = findSentenceEnd(this.buffer);
      if (sentenceEndIndex !== -1) {
        chunks.push(this.take(sentenceEndIndex));
        continue;
      }

      const wordCount = countWords(this.buffer);
      if (wordCount >= this.wordThreshold) {
        const softBoundaryIndex = findLastSoftBoundary(this.buffer);
        if (softBoundaryIndex !== -1) {
          chunks.push(this.take(softBoundaryIndex));
          continue;
        }

        const wordBoundaryIndex = findWordBoundary(this.buffer, this.wordThreshold);
        if (wordBoundaryIndex !== -1) {
          chunks.push(this.take(wordBoundaryIndex));
          continue;
        }
      }

      if (force) {
        chunks.push(this.take(this.buffer.length));
        continue;
      }

      break;
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  private take(endIndex: number): string {
    const chunk = this.buffer.slice(0, endIndex).trim();
    this.buffer = this.buffer.slice(endIndex).trimStart();
    return chunk;
  }
}

export class AsyncTextChunkStream implements AsyncIterable<string> {
  private readonly chunks: string[] = [];
  private readonly readers: Array<(value: IteratorResult<string>) => void> = [];
  private closed = false;
  private failure: unknown = null;

  enqueue(chunk: string): void {
    if (chunk.trim().length === 0 || this.closed) return;
    const reader = this.readers.shift();
    if (reader) {
      reader({ value: chunk, done: false });
      return;
    }
    this.chunks.push(chunk);
  }

  close(): void {
    this.closed = true;
    while (this.readers.length > 0) {
      this.readers.shift()?.({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    this.failure = error;
    this.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => this.next(),
    };
  }

  private next(): Promise<IteratorResult<string>> {
    if (this.failure) return Promise.reject(this.failure);
    const chunk = this.chunks.shift();
    if (chunk) return Promise.resolve({ value: chunk, done: false });
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise((resolve) => {
      this.readers.push(resolve);
    });
  }
}

function findSentenceEnd(text: string): number {
  const match = SENTENCE_END_PATTERN.exec(text);
  return match ? match.index + match[0].length : -1;
}

function findLastSoftBoundary(text: string): number {
  let match: RegExpExecArray | null = null;
  let lastIndex = -1;
  SOFT_BOUNDARY_PATTERN.lastIndex = 0;
  while ((match = SOFT_BOUNDARY_PATTERN.exec(text)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  return lastIndex;
}

function findWordBoundary(text: string, wordThreshold: number): number {
  const matches = [...text.matchAll(/\S+\s*/g)];
  if (matches.length < wordThreshold) return -1;
  const match = matches[wordThreshold - 1];
  return match.index + match[0].length;
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}
