export interface User {
  id: string;
  email: string;
}

export interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  mediaKind: "video" | "image";
  externalId: string;
  thumbnailUrl: string | null;
  status: "uploading" | "uploaded" | "failed";
  createdAt: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export { ApiError };
