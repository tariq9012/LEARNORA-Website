export type AssetDTO = {
  assetId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Route the client can load/download the asset from — never a disk path. */
  url: string;
};

export type LessonResourceDTO = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  downloadUrl: string;
};
