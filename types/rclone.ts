// Rclone backend type definitions and helpers
// These types describe sources/destinations for rclone operations.
// They intentionally favor named remotes (configured in rclone.conf),
// but also capture extra fields that may be useful for validation or future automation.

export type RcloneOperation = "sync" | "copy";

export type RcloneBackend = LocalBackend | B2Backend | S3Backend;

export interface LocalBackend {
  type: "local";
  /** Absolute path inside the container (e.g., /backup/photos) */
  path: string;
}

export interface B2Backend {
  type: "b2";
  bucket: string;
    prefix?: string;
    applicationKeyId: string;
    applicationKey: string;
}

export interface S3Backend {
  type: "s3";
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix?: string;
  region?: string;
  endpoint?: string; // e.g., https://s3.us-west-2.amazonaws.com or custom S3-compatible
}

export function isLocal(b: RcloneBackend): b is LocalBackend {
  return b.type === "local";
}
export function isB2(b: RcloneBackend): b is B2Backend {
  return b.type === "b2";
}
export function isS3(b: RcloneBackend): b is S3Backend {
  return b.type === "s3";
}

/**
 * Build an rclone compatible remote spec string for a given backend, suitable
 * to pass as a source or destination argument (e.g., rclone sync <src> <dst>).
 * - local => "/absolute/path"
 * - b2    => "<remote>:<bucket>/<prefix>"
 * - s3    => "<remote>:<bucket>/<prefix>"
 */
export function toRcloneSpec(backend: RcloneBackend): string {
  if (isLocal(backend)) {
    return backend.path;
  }
  const remote = (backend as any).remote ?? backend.type; // default remote name to the backend type
  const bucket = (backend as any).bucket as string;
  const prefix = (backend as any).prefix as string | undefined;
  const key = prefix && prefix.length > 0 ? `/${prefix}` : "";
  return `${remote}:${bucket}${key}`;
}
