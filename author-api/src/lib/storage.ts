import fs from "node:fs";
import path from "node:path";

export interface StoredFile {
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface StorageProvider {
  save(file: Express.Multer.File): Promise<StoredFile>;
}

export class LocalDiskStorage implements StorageProvider {
  private uploadDir: string;

  constructor(uploadDir = "uploads") {
    this.uploadDir = path.resolve(process.cwd(), uploadDir);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destination = path.join(this.uploadDir, uniqueName);

    await fs.promises.writeFile(destination, file.buffer);

    return {
      filename: file.originalname,
      url: `/uploads/${uniqueName}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}

// Default export uses local disk storage; swappable to S3StorageProvider or CloudStorage
export const storage: StorageProvider = new LocalDiskStorage();

