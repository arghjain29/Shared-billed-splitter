/**
 * Splits `totalCents` into `memberCount` whole-cent shares.
 * The shares always add up to `totalCents`. Leftover cents go one by one
 * to the first members (in the order they were added).
 *
 * splitCents(1000, 3) -> [334, 333, 333]
 * splitCents(2, 3)    -> [1, 1, 0]
 *
 * Callers validate input first; these throws only catch programming bugs.
 */
export function splitCents(totalCents: number, memberCount: number): number[] {
  if (!Number.isInteger(memberCount) || memberCount <= 0) {
    throw new Error('memberCount must be a positive integer')
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer')
  }

  const baseShare = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares: number[] = []
  for (let i = 0; i < memberCount; i++) {
    // The first `remainder` members get one extra cent.
    if (i < remainder) {
      shares.push(baseShare + 1)
    } else {
      shares.push(baseShare)
    }
  }
  return shares
}
