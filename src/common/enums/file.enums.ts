export enum FileVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum FileObjectStatus {
  PENDING_UPLOAD = 'pending_upload',
  UPLOADED = 'uploaded',
  SCANNING = 'scanning',
  AVAILABLE = 'available',
  QUARANTINED = 'quarantined',
  REJECTED = 'rejected',
  DELETED = 'deleted',
}

export enum FileUploadStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  ABORTED = 'aborted',
}

export enum MalwareScanStatus {
  PENDING = 'pending',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  INFECTED = 'infected',
  FAILED = 'failed',
}
