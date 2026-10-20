// minimal stand-ins for sveltekit RequestEvent objects, for calling route handlers directly

/** stand-in for event.cookies: reads the request cookie header, records writes */
export function fakeCookies (header: string) {
  const values = new Map(header.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const [name, ...rest] = x.split('=')
    return [name, decodeURIComponent(rest.join('='))] as [string, string]
  }))
  return {
    writes: [] as any[],
    get (name: string) { return values.get(name) },
    set (name: string, value: string, opts: object) { this.writes.push({ op: 'set', name, value, opts }) },
    delete (name: string, opts: object) { this.writes.push({ op: 'delete', name, opts }) },
  }
}

export function event ({ cookie = '', url = 'http://site.test/admin', username = undefined, params = {}, body = undefined, method = 'GET' }: {
  cookie?: string, url?: string, username?: string, params?: object, body?: any, method?: string
} = {}) {
  return {
    url: new URL(url),
    params,
    locals: username ? { username } : {},
    cookies: fakeCookies(cookie),
    getClientAddress: () => '127.0.0.1',
    setHeaders: () => {},
    request: new Request(url, { method, headers: { cookie }, body: body && JSON.stringify(body) }),
  } as any
}
