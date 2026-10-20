import type { MediaItem, RecordContent } from '../src/index.ts'

export function video (name: string, version = '1'): MediaItem {
  return { type: 'video', source: { method: 'fetch', url: `${name}.mp4`, version } }
}

export function encodedVideo (name: string, version = '1'): MediaItem {
  return {
    ...video(name, version),
    encoded: {
      thumbnail: `${name}-0.webp`,
      encodedAt: '2026-01-01T00:00:00.000Z',
      encodes: [{ type: 'video/mp4', width: 512, height: 288, container: 'mp4', codec: 'h264', version: 'mp4:x264:22@512x288', url: `${name}-0.mp4`, byteSize: 100, duration: 2 }],
    },
  }
}

export function sign (id: string, extra: Partial<RecordContent> = {}): RecordContent {
  return { id, title: id[0].toUpperCase() + id.slice(1), words: [id], tags: [], media: [video(id)], ...extra }
}
