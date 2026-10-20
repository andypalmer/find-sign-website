import { createLicense } from '#lib/auth.ts'
import { stringToBytes } from '@find-sign/core/functions/string-encode.ts'
import { encodeBase64 } from 'tweetnacl-ts'
const identity = import.meta.env.VITE_SEARCH_WRITE_IDENTITY
const collectionPath = import.meta.env.VITE_SEARCH_DATA

export type FileInfoJSON = {
  name: string, // filename
  type: string, // inferred mimetype
  size: number, // file size in bytes
  lastModified: string, // time when file was last modified,
  etag: string, // some unique string likely to change when file contents change
  created: string, // time when file was created
  path: string, // full path to file
  isFile: boolean, // is this item a file?
  isFolder: boolean, // is this item a folder?
}

export type BulkWriteFiles = {
  [filePath: string]: string | Uint8Array
}

export type MathFormat = 'u8' | 's8' | 'u16' | 's16' | 'u32' | 's32' | 'f32' | 'f64'
export type MathOperation = {
  address: number,
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'set',
  operand: number
}

async function request (path: string, init: RequestInit, ignoreError = false): Promise<Response> {
  const license = createLicense(identity)
  const url = new URL(`${collectionPath}${path}`)
  url.searchParams.set('license', license)
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'User-Agent': 'find-sign-website',
      ...(init.headers || {})
    }
  })

  if (!ignoreError && !response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`)
  }

  return response
}

export async function writeFile (path: string, data: Uint8Array | string): Promise<void> {
  if (typeof data === 'string') {
    data = stringToBytes(data)
  }

  await request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from(data)
  })
}

export async function bulkWrite (path: string, files: BulkWriteFiles): Promise<void> {
  // json is inefficient but gets the job done
  await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'bulk',
      files: Object.fromEntries(Object.entries(files).map(([filePath, data]) => {
        if (typeof data === 'string') {
          return [filePath, { encoding: 'string', data }]
        } else if (data instanceof Uint8Array) {
          return [filePath, { encoding: 'base64', data: encodeBase64(data) }]
        } else {
          return [filePath, { encoding: 'string', data: JSON.stringify(data) }]
        }
      }))
    })
  })

  // eventually want to move to using multipart uploads, but larger uploads are a little broken right now
  // const formData = new FormData()
  // formData.set('type', 'bulk')
  // for (const filePath in files) {
  //   // if (files[filePath] instanceof Blob) {
  //   //   formData.append(filePath, files[filePath], filePath)
  //   // } else {
  //     const value = new Blob([files[filePath]], { type: 'application/octet-stream' })
  //     formData.append('files[]', value, filePath)
  //   // }
  // }
  //
  // await request(path, { method: 'POST', body: formData })

  // worst strategy, has potential chance of race conditions for clients seeing partial updates
  // await Promise.all(Object.entries(files).map(async ([subPath, data]) => {
  //   await writeFile(`${path}/${subPath}`, data)
  // }))
}

export async function mathWrite (path: string, length: number, format: MathFormat, operations: MathOperation[]): Promise<void> {
  await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'math',
      format,
      length,
      operations
    })
  })
}

export async function readFile (path: string): Promise<Uint8Array | undefined> {
  try {
    const response = await request(path, {})
    return new Uint8Array(await response.arrayBuffer())
  } catch (err) {
    if ((err as Error).message.startsWith('404:')) {
      return undefined
    } else {
      throw err
    }
  }
}

export async function exists (path: string): Promise<boolean> {
  const response = await request(path, { method: 'HEAD' }, true)
  return response.status !== 404
}

export async function listFiles (path: string): Promise<FileInfoJSON[]> {
  try {
    const response = await request(path, {})
    const { files } = await response.json() as { files: FileInfoJSON[] }
    return files
  } catch (err) {
    if ((err as Error).message.startsWith('404:')) {
      return []
    } else {
      throw err
    }
  }
}

export async function listFilenames (path: string): Promise<string[]> {
  try {
    const response = await request(path, { headers: { 'Accept': 'text/plain' } })
    const responseText = await response.text()
    if (responseText === '') return []
    const files = responseText.split('\n')
    return files
  } catch (err) {
    if ((err as Error).message.startsWith('404:')) {
      return []
    } else {
      throw err
    }
  }
}

export async function deletePath (path: string): Promise<void> {
  await request(path, { method: 'DELETE' })
}
