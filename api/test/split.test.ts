import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/lib/split'

// Adds up an array of numbers.
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

describe('splitCents', () => {
  it('splits an even amount equally', () => {
    expect(splitCents(3000, 3)).toEqual([1000, 1000, 1000])
  })

  it('gives the extra cents to the first members', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333])
    expect(splitCents(1001, 3)).toEqual([334, 334, 333])
  })

  it('gives the whole amount to a single member', () => {
    expect(splitCents(4999, 1)).toEqual([4999])
  })

  it('gives zero to some members when there are fewer cents than members', () => {
    expect(splitCents(2, 3)).toEqual([1, 1, 0])
    expect(splitCents(1, 4)).toEqual([1, 0, 0, 0])
  })

  it('always adds up to the total', () => {
    // A mix of awkward totals and member counts.
    for (const total of [1, 7, 99, 100, 100001, 999_999_999]) {
      for (const count of [1, 2, 3, 7, 13]) {
        const shares = splitCents(total, count)
        expect(shares).toHaveLength(count)
        expect(sum(shares)).toBe(total)
      }
    }
  })

  it('never gives two members a difference of more than one cent', () => {
    const shares = splitCents(100001, 7)
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
  })

  it('throws on zero or negative member counts', () => {
    expect(() => splitCents(1000, 0)).toThrow()
    expect(() => splitCents(1000, -1)).toThrow()
  })

  it('throws on a negative or decimal total', () => {
    expect(() => splitCents(-1, 3)).toThrow()
    expect(() => splitCents(10.5, 3)).toThrow()
  })
})
