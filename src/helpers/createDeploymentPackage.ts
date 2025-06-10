import fs from "fs/promises";
import path from "path";

import AdmZip from "adm-zip";
import fse from "fs-extra";

export async function createDeploymentPackage(codeUri: string): Promise<Buffer> {
  const codeDir: string = path.resolve(codeUri);

  try {
    // Check if the directory exists
    if (!(await fse.pathExists(codeDir))) {
      throw new Error(`Code directory does not exist: ${codeDir}`);
    }

    const zip = new AdmZip();

    const items = await fs.readdir(codeDir);

    for (const item of items) {
      const itemPath = path.join(codeDir, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        zip.addLocalFolder(itemPath, item);
      } else {
        zip.addLocalFile(itemPath);
      }
    }

    const zipBuffer = zip.toBuffer();

    if (zipBuffer.length === 0) {
      throw new Error("Created zip file is empty. Check if the code directory contains files.");
    }

    return zipBuffer;
  } catch (error) {
    throw new Error(`Failed to create deployment package: ${error instanceof Error ? error.message : String(error)}`);
  }
}
