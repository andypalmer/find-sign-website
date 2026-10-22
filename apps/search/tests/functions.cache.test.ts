import { expect, describe, it } from 'vitest'
import { delay } from '@find-sign/core/functions/delay.ts'
import cache, { immediateResponseCache } from '../src/lib/functions/cache.js'

describe('/src/lib/functions/cache.ts', () => {
  it('retrieves', async () => {
    const c = cache(0.1) // 0.25s duration
    expect(c.get()).to.equal(undefined)
    c.set('value')
    expect(c.get()).to.equal('value')
    await delay(55)
    expect(c.get()).to.equal('value')
    await delay(55)
    expect(c.get()).to.equal(undefined)
  })

  it('resets timeout', async () => {
    const c = cache(0.1) // 0.1s duration
    expect(c.get()).to.equal(undefined)
    c.set('value')
    expect(c.get()).to.equal('value')
    await delay(75)
    expect(c.get()).to.equal('value')
    c.set('value')
    await delay(75)
    expect(c.get()).to.equal('value')
  })

  it('immediateResponseCache behaves as expected', async () => {
    let x = 0
    const c = immediateResponseCache(async () => {
      await delay(10)
      x += 1
      return x
    })

    expect(await c()).to.equal(1)
    expect(await c()).to.equal(1)
    expect(await c()).to.equal(1)
    await delay(15)
    expect(await c()).to.equal(2)
    expect(await c()).to.equal(2)
    expect(await c()).to.equal(2)
    await delay(15)
    expect(await c()).to.equal(3)
    await delay(50)
    const start = Date.now()
    expect(await c()).to.equal(4)
    const end = Date.now()
    expect(end - start).to.be.lessThan(5)
  })

  it('immediateResponseCache fails only the requests a failed load answers, and tries again', async () => {
    const unhandled: unknown[] = []
    const listener = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', listener)
    try {
      let fail = true
      const c = immediateResponseCache(async () => {
        await delay(5)
        if (fail) throw new Error('data server answered with html')
        return 'feed'
      })
      await expect(c()).rejects.toThrow('html')
      // the first load failed: the next request gets that failure, as it loads again
      fail = false
      await expect(c()).rejects.toThrow('html')
      await delay(15)
      expect(await c()).to.equal('feed')
      // a failed update, which nothing has asked for yet
      fail = true
      c()
      await delay(15)
      await expect(c()).rejects.toThrow('html')
      await delay(15)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', listener)
    }
  })
})
