import { createClient } from "@supabase/supabase-js";

export const roomboardUploadBucket = process.env.ROOMBOARD_UPLOAD_BUCKET ?? "roomboard-uploads";
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
// Signed URLs are re-minted on every room snapshot fetch, so they only need to
// outlive a viewing session — a short TTL limits how long a leaked link works.
const SIGNED_UPLOAD_URL_TTL_SECONDS = 60 * 60;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type RoomboardUploadStorageState = {
  allowedMimeTypes?: string[];
  bucket: string;
  configured: boolean;
  fileSizeLimit?: number | string | null;
  private: boolean;
  public: boolean | null;
  reachable: boolean;
};

type UploadResult = {
  mode: "data-url" | "supabase";
  url: string;
};

export type RoomUploadDeletionResult = {
  configured: boolean;
  deleted: number;
};

type RoomUploadBucketClient = {
  list: (
    path: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ) => Promise<{
    data: Array<{ id?: string | null; name: string }> | null;
    error: unknown;
  }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
};

function getUploadClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function extensionForType(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "image";
}

function getStoragePathFromUrl(url: string) {
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const supabaseHost = new URL(supabaseUrl).host;

    if (parsed.host !== supabaseHost) {
      return null;
    }

    const signedPrefix = `/storage/v1/object/sign/${roomboardUploadBucket}/`;
    const publicPrefix = `/storage/v1/object/public/${roomboardUploadBucket}/`;
    const prefix = parsed.pathname.startsWith(signedPrefix)
      ? signedPrefix
      : parsed.pathname.startsWith(publicPrefix)
        ? publicPrefix
        : null;

    if (!prefix) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

export async function resolveRoomUploadUrl(imageUrl?: string): Promise<string | undefined> {
  if (!imageUrl) {
    return imageUrl;
  }

  const storagePath = getStoragePathFromUrl(imageUrl);
  const supabase = storagePath ? getUploadClient() : null;

  if (!storagePath || !supabase) {
    return imageUrl;
  }

  const { data, error } = await supabase.storage
    .from(roomboardUploadBucket)
    .createSignedUrl(storagePath, SIGNED_UPLOAD_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return imageUrl;
  }

  return data.signedUrl;
}

export async function getRoomboardUploadStorageState(): Promise<RoomboardUploadStorageState> {
  const supabase = getUploadClient();

  if (!supabase) {
    return {
      bucket: roomboardUploadBucket,
      configured: false,
      private: false,
      public: null,
      reachable: false,
    };
  }

  const { data, error } = await supabase.storage.getBucket(roomboardUploadBucket);

  if (error || !data) {
    return {
      bucket: roomboardUploadBucket,
      configured: true,
      private: false,
      public: null,
      reachable: false,
    };
  }

  return {
    allowedMimeTypes: data.allowed_mime_types ?? undefined,
    bucket: roomboardUploadBucket,
    configured: true,
    fileSizeLimit: data.file_size_limit ?? null,
    private: data.public !== true,
    public: data.public === true,
    reachable: true,
  };
}

export async function uploadRoomImage(file: File, roomId: string): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPEG, PNG, GIF, and WebP images are supported.");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Images must be smaller than 10MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = getUploadClient();

  if (!supabase) {
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      mode: "data-url",
      url: `data:${file.type};base64,${base64}`,
    };
  }

  const extension = extensionForType(file.type);
  const storagePath = `${roomId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(roomboardUploadBucket).upload(storagePath, bytes, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(roomboardUploadBucket)
    .createSignedUrl(storagePath, SIGNED_UPLOAD_URL_TTL_SECONDS);

  if (signedUrlError || !data?.signedUrl) {
    throw signedUrlError ?? new Error("Signed upload URL could not be created.");
  }

  return {
    mode: "supabase",
    url: data.signedUrl,
  };
}

export async function deleteRoomUploads(roomId: string): Promise<RoomUploadDeletionResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/.test(roomId)) {
    throw new Error("Valid room id is required before deleting uploads.");
  }

  const supabase = getUploadClient();
  if (!supabase) {
    return { configured: false, deleted: 0 };
  }

  const deleted = await deleteRoomUploadObjects(
    supabase.storage.from(roomboardUploadBucket) as unknown as RoomUploadBucketClient,
    roomId,
  );

  return { configured: true, deleted };
}

export async function deleteRoomUploadObjects(bucket: RoomUploadBucketClient, roomId: string) {
  let deleted = 0;

  while (true) {
    const { data, error } = await bucket.list(roomId, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw error;
    }

    const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${roomId}/${entry.name}`);

    if (paths.length === 0) {
      return deleted;
    }

    const { error: removeError } = await bucket.remove(paths);
    if (removeError) {
      throw removeError;
    }
    deleted += paths.length;
  }
}
