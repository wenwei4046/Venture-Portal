// A Supabase client for action tests that only need to see what was WRITTEN.
//
// Every query chain is accepted (select / eq / in / order / … in any order)
// and answered by `answer(call)`, so a test states only the rows its path
// needs. Inserts, updates, upserts and RPC calls are kept in order, which is
// what a test of "which day did this write?" reads back.

export interface RecordedCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  values?: unknown
  /** Every filter / modifier applied, as [method, ...args]. */
  chain: Array<[string, ...unknown[]]>
  /** `.single()` / `.maybeSingle()` was asked. */
  single: boolean
}

export interface Answer {
  data?: unknown
  error?: { message: string } | null
  count?: number | null
}

export function recordingSupabase(
  answer: (call: RecordedCall) => Answer = () => ({}),
  rpcAnswer: (fn: string, args: unknown) => Answer = () => ({}),
) {
  const calls: RecordedCall[] = []
  const rpcs: Array<{ fn: string; args: unknown }> = []
  const settle = (a: Answer) => ({ data: a.data ?? null, error: a.error ?? null, count: a.count ?? null })

  const from = (table: string) => {
    const call: RecordedCall = { table, op: 'select', chain: [], single: false }
    calls.push(call)
    const write = (op: RecordedCall['op']) => (values?: unknown) => {
      call.op = op
      call.values = values
      return query
    }
    const own: Record<string, unknown> = {
      insert: write('insert'),
      update: write('update'),
      upsert: write('upsert'),
      delete: write('delete'),
      single: () => { call.single = true; return Promise.resolve(settle(answer(call))) },
      maybeSingle: () => { call.single = true; return Promise.resolve(settle(answer(call))) },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(settle(answer(call))).then(resolve, reject),
    }
    const query: unknown = new Proxy(own, {
      get: (target, prop: string) =>
        prop in target
          ? target[prop]
          : (...args: unknown[]) => { call.chain.push([prop, ...args]); return query },
    })
    return query
  }

  const rpc = (fn: string, args?: unknown) => {
    rpcs.push({ fn, args })
    const result = () => Promise.resolve(settle(rpcAnswer(fn, args)))
    return {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
      single: result,
      maybeSingle: result,
    }
  }

  const writes = (table?: string) => calls.filter((c) => c.op !== 'select' && (!table || c.table === table))
  return { client: { from, rpc }, calls, rpcs, writes }
}
