import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
  createEmptyControlPlaneSnapshot,
  parseControlPlaneSnapshot,
} from "./control-plane-store.js";

export class FileControlPlaneStore implements ControlPlaneStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ControlPlaneSnapshot> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return parseControlPlaneSnapshot(contents, `JSON store at ${this.filePath}`);
    } catch (error) {
      if (error instanceof ControlPlanePersistenceError) {
        throw error;
      }

      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return createEmptyControlPlaneSnapshot();
      }

      throw new ControlPlanePersistenceError(
        `Could not read control-plane store at ${this.filePath}. Check that the file contains valid JSON.`,
      );
    }
  }

  async save(snapshot: ControlPlaneSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  async reset(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
