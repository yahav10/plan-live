const ID = /^[0-9a-f]{12}$/;

export const embedIds = model => [...model.preamble, ...model.sections.flatMap(s => s.blocks)].filter(b => b.type === 'embed').map(b => b.id);

// Trust follows the code: an animation you trusted stays trusted only while its code is unchanged.
export const trustState = (trusted, id) => (trusted.has(id) ? 'on' : trusted.size ? 'changed' : 'off');

export function parseTrusted(raw) {
  try {
    const list = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string' && ID.test(x)) : []);
  } catch {
    return new Set();
  }
}

export const serializeTrusted = set => JSON.stringify([...set]);
