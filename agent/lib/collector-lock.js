let locked = false;
/** @type {Array<() => void>} */
const queue = [];

/**
 * Run one collector tier at a time — avoids overlapping systeminformation calls on Windows.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withCollectorLock(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      locked = true;
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      } finally {
        locked = false;
        const next = queue.shift();
        if (next) next();
      }
    };

    if (locked) queue.push(run);
    else run();
  });
}
