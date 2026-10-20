import { expect, describe, it } from 'vitest'
import { delay, lagSwitch } from '../src/functions/delay.js'

describe('/src/lib/functions/delay.ts', () => {
  it('delay()', async () => {
    const start = Date.now()
    await delay(25)
    const end = Date.now()

    expect(end - start).to.be.within(20, 30)

    expect(await delay(1, 'foo')).to.equal('foo')
    expect(await delay(1)).to.equal(undefined)
  })

  it('lagSwitch()', async () => {
    let finalValue = undefined
    const ret = await lagSwitch(10, delay(15, 'final'), 'default', value => { finalValue = value })
    expect(ret).to.equal('default')
    expect(finalValue).to.equal(undefined)
    await delay(10)
    expect(finalValue).to.equal('final')

    let final2 = undefined
    const ret2 = await lagSwitch(10, delay(5, 'final'), 'default', value => { final2 = value })
    expect(ret2).to.equal('final')
    expect(final2).to.equal(undefined)
    await delay(10)
    expect(final2).to.equal(undefined)
  })
})
