// collection of simple vector math stuff for working with word vectors

// number arrays and typed arrays like Float32Array both work
export type Vector = ArrayLike<number> & { map (fn: (value: number, index: number) => number): Vector }

// add a list of vectors to each other, making a new vector
export function add (...vectors: Vector[]): Vector {
  return vectors.reduce((a, b) => a.map((num, idx) => num + b[idx]))
}

// multiply a list of vectors together
export function multiply (list: Vector[], mul: ArrayLike<number>): Vector[] {
  return list.map(left => left.map((n, i) => n * mul[i]))
}

// mean average the vectors together
export function mean (...list: Vector[]): Vector {
  return multiply([add(...list)], build(1 / list.length, list[0].length))[0]
}

// build a new vector, containing value for every entry, with size many dimensions
export function build (value: number, size: number): number[] {
  return (new Array(size)).fill(value, 0, size)
}

// calculate squared Euclidean distance between two vectors, adapted from how tensorflow-js does it
export function distanceSquared (a: ArrayLike<number>, b: ArrayLike<number>): number {
  let result = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    result += diff * diff
  }
  return result
}

// calculate how different the meaning of the words in the list is from the average of all of them
// returns an array of distances from the mean
export function diversity (...vectors: Vector[]): number[] {
  // skip if there are 0 or 1 vectors
  if (vectors.length <= 1) return [0]
  // first average all the vectors together
  const meanVector = mean(...vectors)
  // calculate how far from the center point each vector is
  return vectors.map(v => distanceSquared(v, meanVector))
}
