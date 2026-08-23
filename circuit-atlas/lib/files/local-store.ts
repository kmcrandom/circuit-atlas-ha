import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export type StoredPrivateFile = {
  body: ReadableStream<Uint8Array>;
  size: number;
  bytes(): Promise<Uint8Array>;
};

export interface PrivateFileStore {
  put(key: string, bytes: ArrayBuffer | Uint8Array): Promise<void>;
  get(key: string): Promise<StoredPrivateFile | null>;
  delete(key: string | readonly string[]): Promise<void>;
}

const globalStore = globalThis as typeof globalThis & {
  circuitAtlasFileStore?: PrivateFileStore;
};

function configuredRoot(): string {
  const explicit = process.env.CIRCUIT_ATLAS_FILES_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const dataDirectory = process.env.CIRCUIT_ATLAS_DATA_DIR?.trim();
  return path.resolve(dataDirectory || ".data", "files");
}

function safePath(root: string, key: string): string {
  if (
    !key ||
    key.includes("\0") ||
    key.includes("\\") ||
    path.isAbsolute(key)
  ) {
    throw new Error("The private-file storage key is invalid.");
  }
  const segments = key.split("/");
  if (
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.length > 255,
    )
  ) {
    throw new Error("The private-file storage key is invalid.");
  }
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("The private-file storage key escapes its storage root.");
  }
  return resolved;
}

export class LocalPrivateFileStore implements PrivateFileStore {
  readonly root: string;

  constructor(root = configuredRoot()) {
    this.root = path.resolve(root);
  }

  async put(key: string, input: ArrayBuffer | Uint8Array): Promise<void> {
    const target = safePath(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${crypto.randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    await handle.close();
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<StoredPrivateFile | null> {
    const target = safePath(this.root, key);
    let fileStat;
    try {
      fileStat = await stat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (!fileStat.isFile()) return null;
    return {
      body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
      size: fileStat.size,
      async bytes() {
        return new Uint8Array(await readFile(target));
      },
    };
  }

  async delete(keyOrKeys: string | readonly string[]): Promise<void> {
    const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
    await Promise.all(
      keys.map(async (key) => {
        const target = safePath(this.root, key);
        try {
          await unlink(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }),
    );
  }
}

export function getPrivateFileStore(): PrivateFileStore {
  globalStore.circuitAtlasFileStore ??= new LocalPrivateFileStore();
  return globalStore.circuitAtlasFileStore;
}

export function setPrivateFileStoreForTests(store: PrivateFileStore | null): void {
  if (store) globalStore.circuitAtlasFileStore = store;
  else delete globalStore.circuitAtlasFileStore;
}

export async function privateFileStoreIsReady(): Promise<boolean> {
  try {
    const root = configuredRoot();
    await mkdir(root, { recursive: true });
    await access(root, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
