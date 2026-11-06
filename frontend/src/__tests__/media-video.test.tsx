/**
 * Videos in the media library: uploaded straight to the media storage with the
 * permission our server signs, shown as videos in the library, left out of the
 * picture pickers, and chosen in the website builder's Video block.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), postForm: vi.fn(), delete: vi.fn() },
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(), tell: vi.fn() }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isLoading: false }) }));

import { isVideoFile, isVideoItem, videoEmbed } from "@/lib/videoUrl";
import { mediaService } from "@/services/media.service";
import MediaLibraryPage from "@/app/(admin)/admin/media/page";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { VideoField, type EditorEnv } from "@/components/builder/editor/fields";
import { BY_TYPE } from "@/lib/builder/registry";

const VIDEO = "https://ik.imagekit.io/9vhlgquzw/tenants/demo/reel_Ab12.mp4";
const PICTURE = "https://ik.imagekit.io/9vhlgquzw/tenants/demo/tee.png";
const ITEMS = [
  { file_id: "v1", url: VIDEO, thumbnail_url: null, name: "reel_Ab12.mp4", size: 5_000_000, file_type: "non-image", mime: "video/mp4", created_at: null },
  { file_id: "p1", url: PICTURE, thumbnail_url: PICTURE, name: "tee.png", size: 50_000, file_type: "image", mime: "image/png", created_at: null },
];

beforeEach(() => { get.mockReset(); post.mockReset(); });

describe("a video's address", () => {
  it("is an https video file, a library item marked as video, or a YouTube or Vimeo link", () => {
    expect(isVideoFile(VIDEO)).toBe(true);
    expect(isVideoFile(`${VIDEO}?tr=w-640`)).toBe(true);
    expect(isVideoFile("http://example.com/a.mp4")).toBe(false);
    expect(isVideoFile(PICTURE)).toBe(false);
    expect(isVideoFile('https://x.co/a.mp4" onerror="x')).toBe(false);
    expect(isVideoItem({ mime: "video/quicktime", url: "https://x.co/file" })).toBe(true);
    expect(isVideoItem(ITEMS[1]!)).toBe(false);
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed(VIDEO)).toBe("");
  });
});

class FakeXhr {
  static last: FakeXhr | null = null;
  status = 200;
  responseText = "";
  sent: FormData | null = null;
  url = "";
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(_m: string, url: string) { this.url = url; }
  send(body: FormData) { this.sent = body; FakeXhr.last = this; }
}

describe("uploading a video", () => {
  it("asks our server for permission, then sends the file straight to the storage with exactly what was signed", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const fields = { fileName: "reel.mp4", folder: "/tenants/demo", useUniqueFileName: "true", checks: '"file.size" <= 104857600 AND "file.mime" : "video"' };
    post.mockResolvedValue({ upload_url: "https://upload.imagekit.io/api/v2/files/upload", token: "jwt.token.here", fields });
    const file = new File(["x".repeat(10)], "reel.mp4", { type: "video/mp4" });
    const progress: number[] = [];
    const done = mediaService.uploadVideo(file, (p) => progress.push(p));
    await waitFor(() => expect(FakeXhr.last).not.toBeNull());
    expect(post).toHaveBeenCalledWith("/api/v1/admin/media/video-upload", { file_name: "reel.mp4", size: 10, mime: "video/mp4" });
    const xhr = FakeXhr.last!;
    expect(xhr.url).toBe("https://upload.imagekit.io/api/v2/files/upload");
    for (const [k, v] of Object.entries(fields)) expect(xhr.sent!.get(k)).toBe(v);
    expect(xhr.sent!.get("token")).toBe("jwt.token.here");
    expect((xhr.sent!.get("file") as File).name).toBe("reel.mp4");
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    xhr.responseText = JSON.stringify({ url: VIDEO, fileId: "v1", name: "reel_Ab12.mp4" });
    xhr.onload?.();
    await expect(done).resolves.toEqual({ url: VIDEO, file_id: "v1", name: "reel_Ab12.mp4" });
    expect(progress).toEqual([50]);
    vi.unstubAllGlobals();
  });

  it("says what the storage said when it refuses", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    post.mockResolvedValue({ upload_url: "https://upload.imagekit.io/api/v2/files/upload", token: "t", fields: {} });
    const done = mediaService.uploadVideo(new File(["x"], "a.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(FakeXhr.last?.sent).toBeTruthy());
    const xhr = FakeXhr.last!;
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ message: "Your request failed the upload checks." });
    xhr.onload?.();
    await expect(done).rejects.toThrow("Your request failed the upload checks.");
    vi.unstubAllGlobals();
  });
});

describe("the Media library page", () => {
  it("takes pictures and videos, and shows a video as one", async () => {
    get.mockResolvedValue({ configured: true, items: ITEMS, videos: true, video_max_mb: 100 });
    const { container } = render(<MediaLibraryPage />);
    await screen.findByText("reel_Ab12.mp4");
    expect(container.querySelector("input[type=file]")!.getAttribute("accept")).toBe("image/*,video/*");
    expect(screen.getByRole("button", { name: "Upload pictures or videos" })).toBeInTheDocument();
    const card = container.querySelector("[data-video]")!;
    expect(card.querySelector("video")!.getAttribute("src")).toBe(VIDEO);
    expect(card).toHaveTextContent("Video");
    expect(container.querySelectorAll("[data-media-item] img")).toHaveLength(1);
  });

  it("stops a video bigger than the plan takes before sending anything", async () => {
    get.mockResolvedValue({ configured: true, items: [], videos: true, video_max_mb: 100 });
    const up = vi.spyOn(mediaService, "uploadVideo");
    const { container } = render(<MediaLibraryPage />);
    await screen.findByText(/Nothing here yet/);
    const big = new File(["x"], "long.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 150 * 1024 * 1024 });
    await act(async () => { fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [big] } }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("long.mp4: videos can be up to 100 MB.");
    expect(up).not.toHaveBeenCalled();
    up.mockRestore();
  });

  it("shows a video the moment it is up, though the storage's list takes a few seconds to include it", async () => {
    // Live, 2026-11-06: the upload landed, the list read right after did not have it yet.
    get.mockResolvedValue({ configured: true, items: [ITEMS[1]], videos: true, video_max_mb: 100 });
    const NEW = "https://ik.imagekit.io/9vhlgquzw/tenants/demo/new_Xy.mp4?updatedAt=1";
    const up = vi.spyOn(mediaService, "uploadVideo").mockResolvedValue({ url: NEW, file_id: "v9", name: "new_Xy.mp4" });
    const { container } = render(<MediaLibraryPage />);
    await screen.findByText("tee.png");
    const clip = new File(["x"], "new.mp4", { type: "video/mp4" });
    await act(async () => { fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [clip] } }); });
    await waitFor(() => expect(container.querySelector("[data-video] video")?.getAttribute("src")).toBe(NEW));
    expect(container.querySelector("[data-media-item]")).toHaveAttribute("data-video");
    expect(screen.queryByRole("alert")).toBeNull();
    up.mockRestore();
  });

  it("keeps to pictures when video uploads are not set up", async () => {
    get.mockResolvedValue({ configured: true, items: [], videos: false });
    const { container } = render(<MediaLibraryPage />);
    await screen.findByText(/Nothing here yet/);
    expect(container.querySelector("input[type=file]")!.getAttribute("accept")).toBe("image/*");
  });
});

describe("the picture pickers", () => {
  it("leave the videos out", async () => {
    get.mockResolvedValue({ configured: true, items: ITEMS });
    const { container } = render(<MediaPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(1));
    expect(container.querySelector(`img[src="${PICTURE}"]`)).not.toBeNull();
  });
});

describe("the website builder's Video block", () => {
  const ctx = (edit = false) => ({
    data: { product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" } },
    globals: {}, page: null, query: "", route: "home", edit,
  }) as unknown as RenderCtx;
  const block = (url: string) => ({ ...BY_TYPE.video!.create(), id: "v1", props: { url } });

  it("plays a video from the library in the browser's own player", () => {
    const { container } = render(<Tree tree={block(VIDEO)} ctx={ctx()} />);
    const video = container.querySelector(".b-video video")!;
    expect(video.getAttribute("src")).toBe(VIDEO);
    expect(video.hasAttribute("controls")).toBe(true);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("still plays YouTube and Vimeo links, and shows nothing for an address that is not a video", () => {
    expect(render(<Tree tree={block("https://www.youtube.com/watch?v=dQw4w9WgXcQ")} ctx={ctx()} />).container.querySelector("iframe")!.getAttribute("src"))
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(render(<Tree tree={block("https://example.com/page")} ctx={ctx()} />).container.innerHTML).toBe("");
    expect(render(<Tree tree={block("")} ctx={ctx(true)} />).container)
      .toHaveTextContent("Choose a video from your library, or paste a YouTube or Vimeo link");
  });

  it("chooses from the library's videos, or takes a new upload", () => {
    const openMedia = vi.fn();
    const onChange = vi.fn();
    render(<VideoField value="" onChange={onChange} env={{ openMedia } as unknown as EditorEnv} />);
    fireEvent.click(screen.getByRole("button", { name: /Library/ }));
    expect(openMedia).toHaveBeenCalledWith(onChange, "video");
    expect(screen.getByRole("button", { name: /Upload/ })).toBeInTheDocument();
    expect(BY_TYPE.video!.fields[0]!.kind).toBe("video");
  });
});
